/**
 * "Select by range" in the Export as... dialog (saf's #364, 3a632cb3), behind `exportRange`. Only the WIRE is stubbed
 * (axios, one level out, as `downloadExportRefusal.test.ts` does): the real client, source seam and dialog run, so the
 * request bodies asserted here are what leaves the browser. SYNTHETIC kind/state/profile names throughout.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, cleanup, fireEvent, waitFor } from "@testing-library/react";

const { mockGet, mockPost } = vi.hoisted(() => ({ mockGet: vi.fn(), mockPost: vi.fn() }));
vi.mock("axios", () => ({
  default: {
    get: vi.fn(),
    create: vi.fn(() => ({
      get: mockGet,
      post: mockPost,
      interceptors: { request: { use: vi.fn() }, response: { use: vi.fn() } },
    })),
  },
}));
const saveBlob = vi.fn();
vi.mock("@/lib/saveBlob", () => ({ saveBlob: (...a: unknown[]) => saveBlob(...a) }));

import type { ExportTarget } from "@/lib/reviewExport";
import { ExportSelectionDialog } from "./ExportSelectionDialog";

const SA = "synthetic-state-a";
const PROFILE = { name: "p1", format: "csv", granularity: "notice_part", accepts: null, exportable_states: [SA] };
const tgt = (id: string): ExportTarget => ({ ingestId: id, kind: "synthetic-kind-a", state: SA, label: `N-${id}` });
const RANGE = { from: "2026-01-01", to: "2026-01-31" };
const rangeReply = (ids: string[], bad: { notice_id: string; reason: string }[] = []) => ({
  data: { profile: "p1", version: 1, notices: ids.length, unexportable: bad, range: { ...RANGE, field: "created_at" }, notice_ids: ids },
});
const q = (c: HTMLElement, s: string) => c.querySelector(s) as HTMLElement | null;
const qa = (c: HTMLElement, s: string) => [...c.querySelectorAll(s)] as HTMLElement[];
const dlg = (c: HTMLElement) => q(c, "[data-export-dialog]")!.getAttribute("data-export-dialog");

function mount(opts: { admitted?: string[] } = {}) {
  const r = render(
    <ExportSelectionDialog targets={[tgt("L1"), tgt("L2")]} notReady={[]} others={0} source="2 selected" admitted={opts.admitted} onClose={vi.fn()} />,
  );
  return { ...r, c: r.baseElement };
}
const loaded = (c: HTMLElement) => waitFor(() => expect(dlg(c)).not.toBe("loading"));
const setRange = (c: HTMLElement, from: string, to: string) => {
  fireEvent.change(q(c, "[data-range-from]")!, { target: { value: from } });
  fireEvent.change(q(c, "[data-range-to]")!, { target: { value: to } });
};
const apply = (c: HTMLElement, from = RANGE.from, to = RANGE.to) => {
  setRange(c, from, to);
  fireEvent.click(q(c, "[data-range-apply]")!);
};
const pick = (c: HTMLElement) => fireEvent.click(q(c, '[data-export-profile="p1"]')!);
const dl = (c: HTMLElement) => q(c, "[data-export-download]") as HTMLButtonElement;
const refusal = (status: number, error: string, message: string) => ({ response: { status, data: { detail: { error, message } } } });

beforeEach(() => {
  mockGet.mockReset();
  mockPost.mockReset();
  mockGet.mockResolvedValue({ data: [PROFILE] });
  window.localStorage.setItem("cortex.exportRange", "1");
});
afterEach(() => {
  cleanup();
  window.localStorage.removeItem("cortex.exportRange");
  vi.clearAllMocks();
});

describe("ExportSelectionDialog, select by range", () => {
  it("R1 flag off: no range section, and the dialog's DOM is the lasso's alone", async () => {
    window.localStorage.removeItem("cortex.exportRange");
    const { c } = mount();
    await loaded(c);
    expect(q(c, "[data-export-range]")).toBeNull();
    expect(c.innerHTML).not.toContain("data-range-");
    expect(c.innerHTML).not.toContain("Select by range");
    // the controls the lasso dialog has today: close, one profile, download
    expect(qa(c, "button").length).toBe(3);
    expect(qa(c, "input").length).toBe(0);
  });

  it("flag on, lasso: the section adds exactly two date inputs and two buttons' worth (apply)", async () => {
    const { c } = mount();
    await loaded(c);
    expect(q(c, "[data-export-range]")).not.toBeNull();
    expect(qa(c, "input").length).toBe(2);
    expect(qa(c, "button").length).toBe(4);
  });

  it("R2 reviewer (admitted given): no range section even with the flag on", async () => {
    const { c } = mount({ admitted: ["p1"] });
    await loaded(c);
    expect(q(c, "[data-export-range]")).toBeNull();
    expect(c.innerHTML).not.toContain("data-range-");
  });

  it("R3 inverted range: apply disabled, the error shown, no check call", async () => {
    const { c } = mount();
    await loaded(c);
    setRange(c, "2026-02-01", "2026-01-01");
    expect((q(c, "[data-range-apply]") as HTMLButtonElement).disabled).toBe(true);
    expect(q(c, "[data-range-error]")!.textContent).toBe("From is after To.");
    fireEvent.click(q(c, "[data-range-apply]")!);
    expect(q(c, "[data-export-source]")!.textContent).toBe("2 selected");
    expect(mockPost).not.toHaveBeenCalled();
    // one empty end also disables it
    setRange(c, "", "2026-01-01");
    expect((q(c, "[data-range-apply]") as HTMLButtonElement).disabled).toBe(true);
  });

  it("R4 Chris's path: range check body is exactly {range, profile, check_only}; Export 2, skip 1; the download sends [A, C] and no range", async () => {
    mockPost.mockResolvedValueOnce(rangeReply(["A", "B", "C"], [{ notice_id: "B", reason: "synthetic_reason" }]));
    const { c } = mount();
    await loaded(c);
    apply(c);
    expect(q(c, "[data-export-source]")!.textContent).toBe(`received ${RANGE.from} to ${RANGE.to}`);
    pick(c);
    await waitFor(() => expect(dl(c).disabled).toBe(false));
    expect(mockPost.mock.calls[0]![0]).toBe("/ingest/export/notices");
    expect(mockPost.mock.calls[0]![1]).toEqual({ range: RANGE, profile: "p1", check_only: true });
    expect(Object.keys(mockPost.mock.calls[0]![1] as object).sort()).toEqual(["check_only", "profile", "range"]);
    expect(dl(c).textContent).toBe("Export 2, skip 1");
    // B is not on the canvas: no number is invented, it reads drop <hex>
    expect(q(c, '[data-unexportable="B"]')!.textContent).toBe("drop B: synthetic_reason");
    mockPost.mockResolvedValueOnce({ data: new Blob(["x"]), headers: {} });
    fireEvent.click(dl(c));
    await waitFor(() => expect(dlg(c)).toBe("done"));
    const body = mockPost.mock.calls[1]![1] as Record<string, unknown>;
    expect(body.notice_ids).toEqual(["A", "C"]);
    expect("range" in body).toBe(false);
    expect(body.check_only).toBeUndefined();
  });

  it("R5 refused: the server's message is shown under data-range-refused, the download stays disabled", async () => {
    mockPost.mockRejectedValueOnce(refusal(422, "export_range_too_large", "synthetic: a range may select at most CAP notices; narrow the range"));
    const { c } = mount();
    await loaded(c);
    apply(c);
    pick(c);
    await waitFor(() => expect(q(c, "[data-range-refused]")).not.toBeNull());
    expect(q(c, "[data-range-refused]")!.getAttribute("data-range-refused")).toBe("export_range_too_large");
    expect(q(c, "[data-range-refused]")!.textContent).toBe("synthetic: a range may select at most CAP notices; narrow the range");
    expect(dl(c).disabled).toBe(true);
  });

  it("R6 empty range: Export 0, skip 0, the download disabled", async () => {
    mockPost.mockResolvedValueOnce(rangeReply([]));
    const { c } = mount();
    await loaded(c);
    apply(c);
    pick(c);
    await waitFor(() => expect(dlg(c)).toBe("ready"));
    expect(dl(c).textContent).toBe("Export 0, skip 0");
    expect(dl(c).disabled).toBe(true);
  });

  it("R7 race: two applies, the first resolves last; the second's ids win", async () => {
    let land1!: (v: unknown) => void;
    mockPost.mockReturnValueOnce(new Promise((r) => (land1 = r)));
    mockPost.mockResolvedValueOnce(rangeReply(["S1", "S2", "S3"]));
    const { c } = mount();
    await loaded(c);
    apply(c, "2026-01-01", "2026-01-10");
    pick(c);
    apply(c, "2026-02-01", "2026-02-10");
    pick(c);
    await waitFor(() => expect(dl(c).textContent).toBe("Export 3, skip 0"));
    land1(rangeReply(["F1"]));
    await new Promise((r) => setTimeout(r, 20));
    expect(dl(c).textContent).toBe("Export 3, skip 0");
    expect(q(c, "[data-export-source]")!.textContent).toBe("received 2026-02-01 to 2026-02-10");
    mockPost.mockResolvedValueOnce({ data: new Blob(["x"]), headers: {} });
    fireEvent.click(dl(c));
    await waitFor(() => expect(dlg(c)).toBe("done"));
    expect((mockPost.mock.calls[2]![1] as { notice_ids: string[] }).notice_ids).toEqual(["S1", "S2", "S3"]);
  });

  it("R8 back: the source line and targets are the lasso's again, and the download sends the lasso ids", async () => {
    mockPost.mockResolvedValueOnce(rangeReply(["A", "B"]));
    const { c } = mount();
    await loaded(c);
    apply(c);
    pick(c);
    await waitFor(() => expect(dl(c).textContent).toBe("Export 2, skip 0"));
    fireEvent.click(q(c, "[data-range-back]")!);
    expect(q(c, "[data-export-source]")!.textContent).toBe("2 selected");
    expect(q(c, "[data-range-back]")).toBeNull();
    mockPost.mockReset();
    mockPost.mockResolvedValueOnce({ data: { profile: "p1", version: 1, notices: 2, unexportable: [] } });
    pick(c);
    await waitFor(() => expect(dl(c).disabled).toBe(false));
    expect(mockPost.mock.calls[0]![1]).toEqual({ notice_ids: ["L1", "L2"], profile: "p1", check_only: true });
    mockPost.mockResolvedValueOnce({ data: new Blob(["x"]), headers: {} });
    fireEvent.click(dl(c));
    await waitFor(() => expect(dlg(c)).toBe("done"));
    expect((mockPost.mock.calls[1]![1] as { notice_ids: string[] }).notice_ids).toEqual(["L1", "L2"]);
  });
});
