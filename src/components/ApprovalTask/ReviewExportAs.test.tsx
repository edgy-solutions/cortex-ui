import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, cleanup, fireEvent, waitFor, act } from "@testing-library/react";

const loadExportProfiles = vi.fn();
const loadCanExportBatch = vi.fn();
const checkExport = vi.fn();
const exportNotices = vi.fn();
vi.mock("@/lib/reviewExportSource", () => ({
  loadExportProfiles: (...a: unknown[]) => loadExportProfiles(...a),
  loadCanExportBatch: (...a: unknown[]) => loadCanExportBatch(...a),
  checkExport: (...a: unknown[]) => checkExport(...a),
  exportNotices: (...a: unknown[]) => exportNotices(...a),
}));
vi.mock("@/lib/saveBlob", () => ({ saveBlob: vi.fn() }));

import { ReviewExportAs } from "./ReviewExportAs";
import { useIngestStatusStore } from "@/store/useIngestStatusStore";
import type { IngestStatusRow } from "@/lib/ingestWire";

// SYNTHETIC state and kind names: no real stage is spelled.
const ID = "sha256:abc";
const SA = "synthetic-state-a";
const SB = "synthetic-state-b";
const prof = (name: string, states?: string[]) => ({
  name,
  format: "csv",
  granularity: "g",
  accepts: null,
  ...(states ? { exportable_states: states } : {}),
});
const INITIAL = useIngestStatusStore.getState();
const seed = (row: Record<string, unknown> | null) =>
  act(() =>
    useIngestStatusStore.setState({
      rows: row ? { [ID]: { ingest_id: ID, ...row } as unknown as IngestStatusRow } : {},
      track: vi.fn(),
    }),
  );
const btn = (c: HTMLElement) => c.querySelector("[data-review-export-as]");
const settle = () => new Promise((r) => setTimeout(r, 30));

beforeEach(() => {
  window.localStorage.setItem("cortex.reviewExport", "1");
  loadCanExportBatch.mockResolvedValue(true);
  loadExportProfiles.mockResolvedValue([prof("p1", [SA]), prof("p2", [SB]), prof("p3")]);
  checkExport.mockImplementation(async (p: { name: string }, ids: string[]) => ({ profile: p.name, version: 1, notices: ids.length, unexportable: [] }));
  seed({ stage: SA, content_kind: "synthetic-kind-a" });
});
afterEach(() => {
  cleanup();
  useIngestStatusStore.setState(INITIAL, true);
  window.localStorage.clear();
  vi.clearAllMocks();
});

describe("ReviewExportAs", () => {
  it("is hidden without the capability, and never reads profiles", async () => {
    loadCanExportBatch.mockResolvedValue(false);
    const { baseElement: container } = render(<ReviewExportAs ingestId={ID} />);
    await settle();
    expect(btn(container)).toBeNull();
    expect(loadExportProfiles).not.toHaveBeenCalled();
  });

  it("is hidden with the flag off", async () => {
    window.localStorage.removeItem("cortex.reviewExport");
    const { baseElement: container } = render(<ReviewExportAs ingestId={ID} />);
    await settle();
    expect(btn(container)).toBeNull();
    expect(loadCanExportBatch).not.toHaveBeenCalled();
  });

  it("hides again when the flag goes off after the profiles loaded (the gate is read every render)", async () => {
    const { baseElement: container, rerender } = render(<ReviewExportAs ingestId={ID} />);
    await waitFor(() => expect(btn(container)).not.toBeNull());
    window.localStorage.removeItem("cortex.reviewExport");
    rerender(<ReviewExportAs ingestId={ID} />);
    await settle();
    expect(btn(container)).toBeNull();
  });

  it("is hidden while the stage is unknown (no row, or a null stage)", async () => {
    seed(null);
    const { baseElement: container } = render(<ReviewExportAs ingestId={ID} />);
    await settle();
    expect(btn(container)).toBeNull();
    seed({ stage: null });
    await settle();
    expect(btn(container)).toBeNull();
  });

  it("is hidden when no profile lists the stage", async () => {
    seed({ stage: "synthetic-state-unlisted" });
    const { baseElement: container } = render(<ReviewExportAs ingestId={ID} />);
    await waitFor(() => expect(loadExportProfiles).toHaveBeenCalled());
    await settle();
    expect(btn(container)).toBeNull();
  });

  it("is hidden when the profile read fails", async () => {
    loadExportProfiles.mockRejectedValue(new Error("down"));
    const { baseElement: container } = render(<ReviewExportAs ingestId={ID} />);
    await waitFor(() => expect(loadExportProfiles).toHaveBeenCalled());
    await settle();
    expect(btn(container)).toBeNull();
  });

  it("is shown when a profile lists the stage, and the dialog offers only that set", async () => {
    const { baseElement: container } = render(<ReviewExportAs ingestId={ID} />);
    await waitFor(() => expect(btn(container)).not.toBeNull());
    fireEvent.click(btn(container)!);
    await waitFor(() => expect(container.querySelector("[data-export-profile]")).not.toBeNull());
    expect([...container.querySelectorAll("[data-export-profile]")].map((e) => e.getAttribute("data-export-profile"))).toEqual(["p1"]);
    expect(container.querySelector("[data-export-source]")!.textContent).toBe(ID);
    fireEvent.click(container.querySelector('[data-export-profile="p1"]')!);
    await waitFor(() => expect(checkExport).toHaveBeenCalledWith(expect.objectContaining({ name: "p1" }), [ID]));
  });

  it("follows the status row: appears when the stage becomes one a profile lists", async () => {
    seed({ stage: "synthetic-state-unlisted" });
    const { baseElement: container } = render(<ReviewExportAs ingestId={ID} />);
    await waitFor(() => expect(loadExportProfiles).toHaveBeenCalled());
    await settle();
    expect(btn(container)).toBeNull();
    seed({ stage: SB });
    await waitFor(() => expect(btn(container)).not.toBeNull());
  });
});
