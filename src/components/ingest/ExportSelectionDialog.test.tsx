import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, cleanup, fireEvent, waitFor } from "@testing-library/react";
import type { ExportTarget } from "@/lib/reviewExport";

const loadExportProfiles = vi.fn();
const checkExport = vi.fn();
const exportNotices = vi.fn();
vi.mock("@/lib/reviewExportSource", () => ({
  loadExportProfiles: (...a: unknown[]) => loadExportProfiles(...a),
  checkExport: (...a: unknown[]) => checkExport(...a),
  exportNotices: (...a: unknown[]) => exportNotices(...a),
}));
const saveBlob = vi.fn();
vi.mock("@/lib/saveBlob", () => ({ saveBlob: (...a: unknown[]) => saveBlob(...a) }));

import { ExportSelectionDialog } from "./ExportSelectionDialog";

// SYNTHETIC values throughout: no real kind, state or reason name is spelled.
const A = "synthetic-kind-a";
const B = "synthetic-kind-b";
const SA = "synthetic-state-a";
const SB = "synthetic-state-b";
const prof = (name: string, accepts: string[] | null, states: string[] = [SA]) => ({
  name,
  format: "csv",
  granularity: "notice_part",
  accepts,
  exportable_states: states,
});
const tgt = (id: string, kind: string | null = A, state: string | null = SA): ExportTarget => ({ ingestId: id, kind, state });
const check = (profile: string, n: number, unexportable: { notice_id: string; reason: string; state: string | null }[] = []) => ({
  profile,
  version: 1,
  notices: n,
  unexportable,
});
const q = (c: HTMLElement, s: string) => c.querySelector(s) as HTMLElement | null;
const qa = (c: HTMLElement, s: string) => [...c.querySelectorAll(s)] as HTMLElement[];
const dlg = (c: HTMLElement) => q(c, "[data-export-dialog]")!.getAttribute("data-export-dialog");

function mount(targets: ExportTarget[], extra: { notReady?: { id: string; label: string }[]; others?: number; onClose?: () => void } = {}) {
  const onClose = extra.onClose ?? vi.fn();
  const r = render(
    <ExportSelectionDialog
      targets={targets}
      notReady={extra.notReady ?? []}
      others={extra.others ?? 0}
      source={`${targets.length} selected`}
      onClose={onClose}
    />,
  );
  // The dialog is portaled to document.body (0.4.87: it mounts inside transformed canvas cards), so every query
  // reads the body; `mountedIn` is the render container, which must NOT hold the dialog.
  return { onClose, ...r, container: r.baseElement, mountedIn: r.container };
}
const profilesLoaded = async (c: HTMLElement) => waitFor(() => expect(dlg(c)).not.toBe("loading"));
const pickProfile = (c: HTMLElement, name: string) => fireEvent.click(q(c, `[data-export-profile="${name}"]`)!);

beforeEach(() => {
  loadExportProfiles.mockResolvedValue([prof("p1", [A])]);
  checkExport.mockImplementation(async (p: { name: string }, ids: string[]) => check(p.name, ids.length));
  exportNotices.mockResolvedValue({ blob: new Blob(["x"]), filename: "f.csv" });
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("ExportSelectionDialog", () => {
  it("offers only profilesFor's set, in served order", async () => {
    loadExportProfiles.mockResolvedValue([
      prof("P1", [A, B]),
      prof("P2", [A]),
      prof("P3", null),
      prof("P4", [B, A, "synthetic-kind-c"]),
      prof("P5", [A, B], [SB]),
      { name: "P6", format: "csv", granularity: "g", accepts: null },
    ]);
    const { container } = mount([tgt("i-1", A), tgt("i-2", B)]);
    await profilesLoaded(container);
    expect(qa(container, "[data-export-profile]").map((e) => e.getAttribute("data-export-profile"))).toEqual(["P1", "P3", "P4"]);
  });

  it("picking a profile runs check_only for every target id and renders its rows with data-state", async () => {
    checkExport.mockResolvedValue(
      check("p1", 3, [
        { notice_id: "i-2", reason: "state_not_exportable", state: SB },
        { notice_id: "i-3", reason: "not_available", state: null },
      ]),
    );
    const { container } = mount([tgt("i-1"), tgt("i-2"), tgt("i-3")]);
    await profilesLoaded(container);
    pickProfile(container, "p1");
    expect(dlg(container)).toBe("checking");
    await waitFor(() => expect(dlg(container)).toBe("ready"));
    expect(checkExport).toHaveBeenCalledWith(expect.objectContaining({ name: "p1" }), ["i-1", "i-2", "i-3"]);
    const ul = q(container, "[data-export-unexportable]")!;
    expect(ul.getAttribute("data-export-unexportable")).toBe("2");
    const li2 = q(container, '[data-unexportable="i-2"]')!;
    expect(li2.getAttribute("data-reason-code")).toBe("state_not_exportable");
    expect(li2.getAttribute("data-state")).toBe(SB);
    expect(li2.textContent).toBe(`i-2: state_not_exportable (state: ${SB})`);
    const li3 = q(container, '[data-unexportable="i-3"]')!;
    expect(li3.getAttribute("data-state")).toBe("");
    expect(li3.textContent).toBe("i-3: not_available");
  });

  it("the download is disabled until the check for the current pick lands, then sends only the cleared ids", async () => {
    let land!: (v: unknown) => void;
    checkExport.mockReturnValue(new Promise((r) => (land = r)));
    const { container } = mount([tgt("i-1"), tgt("i-2"), tgt("i-3")], { notReady: [{ id: "a9", label: "doc.pdf" }] });
    await profilesLoaded(container);
    const btn = q(container, "[data-export-download]") as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
    pickProfile(container, "p1");
    expect(btn.disabled).toBe(true);
    land(check("p1", 3, [{ notice_id: "i-2", reason: "r", state: SB }]));
    await waitFor(() => expect(btn.disabled).toBe(false));
    // N = 3 targets minus 1 unexportable; K = 1 notReady + 1 unexportable.
    expect(btn.textContent).toBe("Export 2, skip 2");
    fireEvent.click(btn);
    await waitFor(() => expect(dlg(container)).toBe("done"));
    expect(exportNotices).toHaveBeenCalledWith(expect.objectContaining({ name: "p1" }), ["i-1", "i-3"]);
    expect(saveBlob).toHaveBeenCalled();
  });

  it("notReady rows come first, with the cortex-side reason and an empty reason code", async () => {
    const { container } = mount([tgt("i-1")], { notReady: [{ id: "a2", label: "doc.pdf" }] });
    await profilesLoaded(container);
    const li = q(container, '[data-unexportable="a2"]')!;
    expect(li.getAttribute("data-reason-code")).toBe("");
    expect(li.textContent).toContain("doc.pdf");
  });

  it("a stale check (pick A, pick B, A lands late) does not set state", async () => {
    loadExportProfiles.mockResolvedValue([prof("pa", [A]), prof("pb", [A])]);
    const landers: Record<string, (v: unknown) => void> = {};
    checkExport.mockImplementation((p: { name: string }) => new Promise((r) => (landers[p.name] = r)));
    const { container } = mount([tgt("i-1"), tgt("i-2")]);
    await profilesLoaded(container);
    pickProfile(container, "pa");
    pickProfile(container, "pb");
    landers.pb!(check("pb", 2));
    await waitFor(() => expect(dlg(container)).toBe("ready"));
    // A lands late, carrying a row B never had.
    landers.pa!(check("pa", 2, [{ notice_id: "i-1", reason: "late", state: null }]));
    await new Promise((r) => setTimeout(r, 20));
    expect(q(container, "[data-export-unexportable]")).toBeNull();
    expect((q(container, "[data-export-download]") as HTMLButtonElement).textContent).toBe("Export 2, skip 0");
    fireEvent.click(q(container, "[data-export-download]")!);
    await waitFor(() => expect(exportNotices).toHaveBeenCalled());
    expect(exportNotices).toHaveBeenCalledWith(expect.objectContaining({ name: "pb" }), ["i-1", "i-2"]);
  });

  it("a 422 refusal shows the server's rows with their state, plus the status and code", async () => {
    const { container } = mount([tgt("i-1"), tgt("i-2")]);
    await profilesLoaded(container);
    pickProfile(container, "p1");
    await waitFor(() => expect(dlg(container)).toBe("ready"));
    exportNotices.mockRejectedValue({
      response: {
        status: 422,
        data: { detail: { error: "export_notices_unexportable", message: "m", unexportable: [{ notice_id: "i-2", reason: "state_not_exportable", state: SB }] } },
      },
    });
    fireEvent.click(q(container, "[data-export-download]")!);
    await waitFor(() => expect(dlg(container)).toBe("refused"));
    const li = q(container, '[data-unexportable="i-2"]')!;
    expect(li.getAttribute("data-state")).toBe(SB);
    expect(li.getAttribute("data-reason-code")).toBe("state_not_exportable");
    expect(q(container, '[data-export-refusal="export_notices_unexportable"]')!.textContent).toContain("422");
    expect((q(container, "[data-export-download]") as HTMLButtonElement).textContent).toBe("Export 1, skip 1");
  });

  it("a 422 refusal JOINS the check's rows: an id the check blocked is never sent on the retry", async () => {
    checkExport.mockResolvedValue(check("p1", 3, [{ notice_id: "i-1", reason: "r", state: SB }]));
    const { container } = mount([tgt("i-1"), tgt("i-2"), tgt("i-3")]);
    await profilesLoaded(container);
    pickProfile(container, "p1");
    await waitFor(() => expect(dlg(container)).toBe("ready"));
    // The refusal names only what was sent (i-2, i-3); i-2 changed state in between.
    exportNotices.mockRejectedValueOnce({
      response: {
        status: 422,
        data: { detail: { error: "e", message: "m", unexportable: [{ notice_id: "i-2", reason: "state_not_exportable", state: SB }] } },
      },
    });
    fireEvent.click(q(container, "[data-export-download]")!);
    await waitFor(() => expect(dlg(container)).toBe("refused"));
    expect(exportNotices).toHaveBeenLastCalledWith(expect.objectContaining({ name: "p1" }), ["i-2", "i-3"]);
    expect(qa(container, "[data-unexportable]").map((li) => li.getAttribute("data-unexportable"))).toEqual(["i-1", "i-2"]);
    const btn = q(container, "[data-export-download]") as HTMLButtonElement;
    expect(btn.textContent).toBe("Export 1, skip 2");
    fireEvent.click(btn);
    await waitFor(() => expect(dlg(container)).toBe("done"));
    expect(exportNotices).toHaveBeenLastCalledWith(expect.objectContaining({ name: "p1" }), ["i-3"]);
  });

  it("a failed check leaves the download disabled: nothing is sent without a check", async () => {
    checkExport.mockRejectedValue({ response: { status: 403, data: { detail: { error: "not_entitled_to_export" } } } });
    const { container } = mount([tgt("i-1")]);
    await profilesLoaded(container);
    pickProfile(container, "p1");
    await waitFor(() => expect(dlg(container)).toBe("refused"));
    expect((q(container, "[data-export-download]") as HTMLButtonElement).disabled).toBe(true);
  });

  it("a refusal with no unexportable list leaves the shown list alone", async () => {
    checkExport.mockResolvedValue(check("p1", 2, [{ notice_id: "i-2", reason: "r", state: SB }]));
    const { container } = mount([tgt("i-1"), tgt("i-2")]);
    await profilesLoaded(container);
    pickProfile(container, "p1");
    await waitFor(() => expect(dlg(container)).toBe("ready"));
    exportNotices.mockRejectedValue({ response: { status: 403, data: { detail: { error: "not_entitled_to_export" } } } });
    fireEvent.click(q(container, "[data-export-download]")!);
    await waitFor(() => expect(dlg(container)).toBe("refused"));
    expect(q(container, '[data-unexportable="i-2"]')).not.toBeNull();
    expect(q(container, '[data-export-refusal="not_entitled_to_export"]')).not.toBeNull();
  });

  it("every notice unexportable: nothing to send, the button stays disabled", async () => {
    checkExport.mockResolvedValue(check("p1", 1, [{ notice_id: "i-1", reason: "r", state: SA }]));
    const { container } = mount([tgt("i-1")]);
    await profilesLoaded(container);
    pickProfile(container, "p1");
    await waitFor(() => expect(dlg(container)).toBe("ready"));
    expect((q(container, "[data-export-download]") as HTMLButtonElement).disabled).toBe(true);
  });

  it("no profile offered: names the kinds and states present", async () => {
    loadExportProfiles.mockResolvedValue([prof("p1", [A], [SB])]);
    const { container } = mount([tgt("i-1", A, SA)]);
    await profilesLoaded(container);
    expect(q(container, "[data-export-no-profile]")!.textContent).toBe(`No export profile you hold takes ${A} in ${SA}.`);
  });

  it("no profile offered, kind and state unknown: the message omits both", async () => {
    loadExportProfiles.mockResolvedValue([{ name: "p1", format: "csv", granularity: "g" }]);
    const { container } = mount([tgt("i-1", null, null)]);
    await profilesLoaded(container);
    expect(q(container, "[data-export-no-profile]")!.textContent).toBe("No export profile you hold takes this selection.");
  });

  it("an empty profile list says none is available", async () => {
    loadExportProfiles.mockResolvedValue([]);
    const { container } = mount([tgt("i-1")]);
    await profilesLoaded(container);
    expect(q(container, "[data-export-no-profile]")!.textContent).toBe("No export profile is available to you.");
  });

  it("a failed profile load shows the failure", async () => {
    loadExportProfiles.mockRejectedValue({ response: { status: 403, data: { detail: { error: "nope" } } } });
    const { container } = mount([tgt("i-1")]);
    await waitFor(() => expect(dlg(container)).toBe("refused"));
  });

  it("no targets: empty, no profile picker", async () => {
    const { container } = mount([], { others: 2 });
    await profilesLoaded(container);
    expect(dlg(container)).toBe("empty");
    expect(q(container, "[data-export-empty]")).not.toBeNull();
    expect(q(container, "[data-export-others]")!.getAttribute("data-export-others")).toBe("2");
  });

  it("is portaled: a direct child of document.body, not inside the tree that mounted it", async () => {
    const { container, mountedIn } = mount([tgt("i-1")]);
    await profilesLoaded(container);
    const d = q(container, "[data-export-dialog]")!;
    expect(d.parentElement).toBe(document.body);
    expect(mountedIn.contains(d)).toBe(false);
  });

  it("Escape and the close button close it", async () => {
    const { container, onClose } = mount([tgt("i-1")]);
    await profilesLoaded(container);
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
    fireEvent.click(q(container, "[data-export-close]")!);
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it("shows the source line and has no range control", async () => {
    const { container } = mount([tgt("i-1"), tgt("i-2")]);
    await profilesLoaded(container);
    expect(q(container, "[data-export-source]")!.textContent).toBe("2 selected");
    expect(q(container, "[data-range-from]")).toBeNull();
    expect(container.innerHTML).not.toContain("data-range-");
    expect(q(container, "[data-overlay]")).not.toBeNull();
    expect(q(container, '[role="dialog"]')).not.toBeNull();
  });
});
