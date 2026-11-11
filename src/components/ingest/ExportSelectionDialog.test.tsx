import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, cleanup, fireEvent, waitFor } from "@testing-library/react";
import type { Artifact } from "@/api/types";

const loadExportProfiles = vi.fn();
const resolveExport = vi.fn();
const exportSelection = vi.fn();
vi.mock("@/lib/reviewExportSource", () => ({
  loadExportProfiles: (...a: unknown[]) => loadExportProfiles(...a),
  resolveExport: (...a: unknown[]) => resolveExport(...a),
  exportSelection: (...a: unknown[]) => exportSelection(...a),
}));
const saveBlob = vi.fn();
vi.mock("@/lib/saveBlob", () => ({ saveBlob: (...a: unknown[]) => saveBlob(...a) }));

import { ExportSelectionDialog } from "./ExportSelectionDialog";

// SYNTHETIC values throughout.
const A = "synthetic-kind-a";
const B = "synthetic-kind-b";
const prof = (name: string, accepts?: string[]) => ({ name, format: "csv", granularity: "notice_part", ...(accepts ? { accepts } : {}) });
const notice = (id: string, kind: string) => ({ ingest_id: id, notice_id: null, content_kind: kind });
const ingest = (id: string, ingestId: string | null): Artifact =>
  ({ id, summary: `sum-${id}`, rendered_output: { components: [{ archetype: "INGEST", ingest: { ingest_id: ingestId } }] } }) as unknown as Artifact;
const answer = (id: string): Artifact => ({ id, summary: "an answer", rendered_output: { components: [] } }) as unknown as Artifact;
const q = (c: HTMLElement, s: string) => c.querySelector(s) as HTMLElement | null;
const qa = (c: HTMLElement, s: string) => [...c.querySelectorAll(s)] as HTMLElement[];

function mount(artifacts: Artifact[], selection: string[], onClose = vi.fn()) {
  return { onClose, ...render(<ExportSelectionDialog artifacts={artifacts} selection={selection} onClose={onClose} />) };
}
const ready = async (c: HTMLElement) =>
  waitFor(() => expect(["ready", "empty", "refused", "failed"]).toContain(q(c, "[data-export-dialog]")!.getAttribute("data-export-dialog")));

beforeEach(() => {
  loadExportProfiles.mockResolvedValue([prof("p1", [A])]);
  resolveExport.mockResolvedValue({ notices: [notice("i-1", A)], unexportable: [] });
  exportSelection.mockResolvedValue({ blob: new Blob(["x"]), filename: "f.csv" });
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("ExportSelectionDialog", () => {
  it("offers only the profiles that accept every kind present, in served order", async () => {
    resolveExport.mockResolvedValue({ notices: [notice("i-1", A), notice("i-2", B)], unexportable: [] });
    loadExportProfiles.mockResolvedValue([prof("P1", [A, B]), prof("P2", [A]), prof("P3"), prof("P4", [B, A, "synthetic-kind-c"])]);
    const { container } = mount([ingest("a1", "i-1")], ["a1"]);
    await ready(container);
    expect(qa(container, "[data-export-profile]").map((e) => e.getAttribute("data-export-profile"))).toEqual(["P1", "P4"]);
  });

  it("lists the unexportable before download, then sends only the notices", async () => {
    resolveExport.mockResolvedValue({
      notices: [notice("i-1", A), notice("i-2", A)],
      unexportable: [{ ingest_id: "i-3", notice_id: null, reason_code: "synthetic_refusal", reason: "synthetic: not promoted" }],
    });
    const { container } = mount([ingest("a1", "i-1")], ["a1"]);
    await ready(container);
    expect(q(container, "[data-export-unexportable]")!.textContent).toContain("synthetic: not promoted");
    const btn = q(container, "[data-export-download]")!;
    expect(btn.textContent).toContain("skip 1");
    fireEvent.click(q(container, "[data-export-profile]")!);
    fireEvent.click(btn);
    await waitFor(() => expect(q(container, "[data-export-dialog]")!.getAttribute("data-export-dialog")).toBe("done"));
    expect(exportSelection).toHaveBeenCalledWith(expect.objectContaining({ name: "p1" }), ["i-1", "i-2"]);
    expect(saveBlob).toHaveBeenCalled();
  });

  it("partitions the selection: null-id drop listed, answer counted and never sent", async () => {
    const arts = [ingest("a1", "i-1"), ingest("a2", null), answer("a3")];
    const { container } = mount(arts, ["a1", "a2", "a3"]);
    await ready(container);
    expect(resolveExport).toHaveBeenCalledWith({ ingestIds: ["i-1"] });
    expect(q(container, '[data-unexportable="a2"]')!.getAttribute("data-reason-code")).toBe("");
    expect(q(container, '[data-export-others="1"]')).not.toBeNull();
    expect(JSON.stringify(resolveExport.mock.calls)).not.toContain("a3");
  });

  it("select by range: blocked while from > to, then resolves the range", async () => {
    const { container } = mount([ingest("a1", "i-1")], ["a1"]);
    await ready(container);
    const set = (s: string, v: string) => fireEvent.change(q(container, s)!, { target: { value: v } });
    set("[data-range-from]", "2026-02-02");
    set("[data-range-to]", "2026-02-01");
    expect((q(container, "[data-range-apply]") as HTMLButtonElement).disabled).toBe(true);
    expect(q(container, "[data-range-error]")).not.toBeNull();
    set("[data-range-to]", "2026-02-03");
    expect((q(container, "[data-range-apply]") as HTMLButtonElement).disabled).toBe(false);
    resolveExport.mockResolvedValueOnce({ notices: [notice("r-1", A)], unexportable: [] });
    fireEvent.click(q(container, "[data-range-apply]")!);
    await waitFor(() => expect(q(container, "[data-export-source]")!.textContent).toBe("range 2026-02-02 to 2026-02-03"));
    expect(resolveExport).toHaveBeenLastCalledWith({ from: "2026-02-02", to: "2026-02-03" });
  });

  it("a range applied while the selection's resolve is in flight wins when that resolve lands late", async () => {
    let lateIds!: (v: unknown) => void;
    resolveExport
      .mockImplementationOnce(() => new Promise((r) => (lateIds = r)))
      .mockResolvedValueOnce({ notices: [notice("r-1", A), notice("r-2", A)], unexportable: [] });
    const { container } = mount([ingest("a1", "i-1")], ["a1"]);
    fireEvent.change(q(container, "[data-range-from]")!, { target: { value: "2026-10-01" } });
    fireEvent.change(q(container, "[data-range-to]")!, { target: { value: "2026-10-05" } });
    fireEvent.click(q(container, "[data-range-apply]")!);
    await waitFor(() => expect(q(container, "[data-export-source]")!.textContent).toBe("range 2026-10-01 to 2026-10-05"));
    lateIds({ notices: [notice("i-1", A)], unexportable: [] });
    await new Promise((r) => setTimeout(r, 0));
    expect(q(container, "[data-export-source]")!.textContent).toBe("range 2026-10-01 to 2026-10-05");
    expect(q(container, "[data-export-download]")!.textContent).toContain("Export 2");
  });

  it("a refused download shows the refusal and the refused state", async () => {
    exportSelection.mockRejectedValue({ response: { status: 403, data: { detail: { error: "not_entitled_to_export_batch" } } } });
    const { container } = mount([ingest("a1", "i-1")], ["a1"]);
    await ready(container);
    fireEvent.click(q(container, "[data-export-profile]")!);
    fireEvent.click(q(container, "[data-export-download]")!);
    await waitFor(() => expect(q(container, '[data-export-refusal="not_entitled_to_export_batch"]')).not.toBeNull());
    expect(q(container, "[data-export-dialog]")!.getAttribute("data-export-dialog")).toBe("refused");
    expect(saveBlob).not.toHaveBeenCalled();
  });

  it("a failed resolve is not silent", async () => {
    resolveExport.mockRejectedValue(new Error("down"));
    const { container } = mount([ingest("a1", "i-1")], ["a1"]);
    await waitFor(() => expect(q(container, "[data-export-failed]")).not.toBeNull());
    expect(q(container, "[data-export-dialog]")!.getAttribute("data-export-dialog")).toBe("failed");
  });

  it("no profile accepts the kinds: says so, and download is disabled", async () => {
    loadExportProfiles.mockResolvedValue([prof("p1", ["synthetic-kind-z"]), prof("p2")]);
    const { container } = mount([ingest("a1", "i-1")], ["a1"]);
    await ready(container);
    expect(q(container, "[data-export-no-profile]")!.textContent).toContain(A);
    expect((q(container, "[data-export-download]") as HTMLButtonElement).disabled).toBe(true);
  });

  it("no profiles served at all: the available-to-you text", async () => {
    loadExportProfiles.mockResolvedValue([]);
    const { container } = mount([ingest("a1", "i-1")], ["a1"]);
    await ready(container);
    expect(q(container, "[data-export-no-profile]")!.textContent).toContain("available to you");
  });

  it("closes on Esc and on the close button", async () => {
    const { container, onClose } = mount([ingest("a1", "i-1")], ["a1"]);
    await ready(container);
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
    fireEvent.click(q(container, "[data-export-close]")!);
    expect(onClose).toHaveBeenCalledTimes(2);
  });
});
