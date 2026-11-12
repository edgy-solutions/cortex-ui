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

const HEX = "3f9a1c7e5b2d4a60918273645f5e4d3c2b1a09f8e7d6c5b4a39281706f5e4d3c";
const ID = `sha256:${HEX}`;
const INITIAL = useIngestStatusStore.getState();
const seed = (row: Record<string, unknown>) =>
  act(() =>
    useIngestStatusStore.setState({
      rows: { [ID]: { ingest_id: ID, ...row } as unknown as IngestStatusRow },
      track: vi.fn(),
    }),
  );
const open = async (container: HTMLElement) => {
  await waitFor(() => expect(container.querySelector("[data-review-export-as]")).not.toBeNull());
  fireEvent.click(container.querySelector("[data-review-export-as]")!);
  await waitFor(() => expect(container.querySelector("[data-export-profile]")).not.toBeNull());
};
const pick = async (container: HTMLElement) => {
  fireEvent.click(container.querySelector('[data-export-profile="p1"]')!);
  await waitFor(() => expect(checkExport).toHaveBeenCalled());
};

beforeEach(() => {
  window.localStorage.setItem("cortex.reviewExport", "1");
  loadCanExportBatch.mockResolvedValue(true);
  loadExportProfiles.mockResolvedValue([{ name: "p1", format: "csv", granularity: "g", accepts: null, exportable_states: ["synthetic-state-a"] }]);
  checkExport.mockImplementation(async (p: { name: string }, ids: string[]) => ({ profile: p.name, version: 1, notices: ids.length, unexportable: [] }));
  exportNotices.mockResolvedValue({ blob: new Blob(["x"]), filename: "x.csv" });
});
afterEach(() => {
  cleanup();
  useIngestStatusStore.setState(INITIAL, true);
  window.localStorage.clear();
  vi.clearAllMocks();
});

describe("the dialog names the notice by its number, not its hash (Chris, 0.4.88)", () => {
  it("shows the number, and no 12-hex run of the sha anywhere in the dialog", async () => {
    seed({ stage: "synthetic-state-a", notice_id: "PCN-2683" });
    const { baseElement } = render(<ReviewExportAs ingestId={ID} />);
    await open(baseElement);
    expect(baseElement.querySelector("[data-export-source]")!.textContent).toBe("PCN-2683");
    const dialogText = baseElement.querySelector("[data-export-source]")!.closest("div[class]")!.parentElement!.textContent ?? "";
    expect(dialogText).toContain("PCN-2683");
    expect(dialogText).not.toMatch(/[0-9a-f]{12}/);
  });

  it("with no number yet, says drop <first 12 hex>, never the sha256: id", async () => {
    seed({ stage: "synthetic-state-a", notice_id: null });
    const { baseElement } = render(<ReviewExportAs ingestId={ID} />);
    await open(baseElement);
    const t = baseElement.querySelector("[data-export-source]")!.textContent;
    expect(t).toBe(`drop ${HEX.slice(0, 12)}`);
    expect(t).not.toContain("sha256:");
  });

  it("a refused row reads the number but keeps the ingest id as its identity", async () => {
    seed({ stage: "synthetic-state-a", notice_id: "PCN-2683" });
    checkExport.mockResolvedValue({ profile: "p1", version: 1, notices: 1, unexportable: [{ notice_id: ID, reason: "x", state: "s" }] });
    const { baseElement } = render(<ReviewExportAs ingestId={ID} />);
    await open(baseElement);
    await pick(baseElement);
    await waitFor(() => expect(baseElement.querySelector("[data-unexportable]")).not.toBeNull());
    const li = baseElement.querySelector("[data-unexportable]")!;
    expect(li.getAttribute("data-unexportable")).toBe(ID);
    expect(li.textContent!.startsWith("PCN-2683:")).toBe(true);
  });

  it("control: the download body carries the ingest id, never the label", async () => {
    seed({ stage: "synthetic-state-a", notice_id: "PCN-2683" });
    const { baseElement } = render(<ReviewExportAs ingestId={ID} />);
    await open(baseElement);
    await pick(baseElement);
    await waitFor(() => expect((baseElement.querySelector("[data-export-download]") as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(baseElement.querySelector("[data-export-download]")!);
    await waitFor(() => expect(exportNotices).toHaveBeenCalled());
    expect(exportNotices).toHaveBeenCalledWith(expect.objectContaining({ name: "p1" }), [ID]);
  });
});
