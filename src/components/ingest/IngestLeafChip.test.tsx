/**
 * IngestLeafChip — the PROPOSED leaf chip (10-21 packet §3). Renders nothing until the status row
 * carries the `leaf_source` key.
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, cleanup, fireEvent, waitFor } from "@testing-library/react";
import { IngestLeafChip } from "./IngestLeafChip";
import { readIngestStatusRow, type IngestStatusRow } from "@/lib/ingestWire";

const correctIngestLeaf = vi.fn();
vi.mock("@/lib/ingestTransport", () => ({
  correctIngestLeaf: (...a: unknown[]) => correctIngestLeaf(...a),
}));

afterEach(() => {
  cleanup();
  correctIngestLeaf.mockReset();
});

const ID = `sha256:${"3f9a2b".padEnd(64, "0")}`;
const T = 1790860800000;
const wire = (over: Record<string, unknown> = {}): Record<string, unknown> => ({
  ingest_id: ID, sha256: ID.slice(7), kind: "pdf", stage: "review", detail: null, duplicate: null,
  created_at: T, updated_at: T, origin: null, case_id: null, leaf: "pcn", leaf_source: "extraction-title", ...over,
});
const row = (over: Record<string, unknown> = {}): IngestStatusRow => readIngestStatusRow(wire(over))!;
const q = (sel: string) => document.querySelector(sel);

describe("IngestLeafChip", () => {
  it("renders nothing when the leaf_source key is absent", () => {
    const bare = wire();
    delete bare.leaf;
    delete bare.leaf_source;
    const r = render(<IngestLeafChip row={readIngestStatusRow(bare)!} />);
    expect(r.container.innerHTML).toBe("");
  });

  it.each([
    ["the original visible", "review"],
    ["the original invisible", null],
  ])("a duplicate row (%s) draws no chip, even carrying a leaf pair", (_, stage) => {
    const dup = row({ stage, duplicate: { of_ingest_id: ID, message: "already processed" } });
    expect(dup.duplicate).not.toBeNull();
    expect("leaf_source" in dup).toBe(true);
    const r = render(<IngestLeafChip row={dup} />);
    expect(r.container.innerHTML).toBe("");
  });

  it("an event row draws no chip, even carrying a leaf pair", () => {
    const ev = readIngestStatusRow(wire({ kind: "event" }));
    expect(ev?.kind).toBe("event");
    expect(ev && "leaf_source" in ev).toBe(true);
    const r = render(<IngestLeafChip row={ev!} />);
    expect(r.container.innerHTML).toBe("");
  });

  it.each([
    [{ leaf: "pcn", leaf_source: "ingest" }, "review", "PCN · picked"],
    [{ leaf: "pdn", leaf_source: "extraction-title" }, "review", "PDN · from title"],
    [{ leaf: null, leaf_source: null }, "extracting", "? · not read yet"],
    [{ leaf: null, leaf_source: null }, "review", "? · not identified"],
  ])("label for %j at %s is %s", (pair, stage, label) => {
    render(<IngestLeafChip row={row({ ...pair, stage })} />);
    expect(q("[data-leaf-chip]")?.textContent).toContain(label);
    expect(q("[data-leaf-chip]")?.getAttribute("data-leaf")).toBe(pair.leaf ?? "?");
  });

  it.each(["promoted", "rejected", "failed", "review_rejected"])("at %s there is no change button", (stage) => {
    render(<IngestLeafChip row={row({ stage, detail: "d" })} />);
    expect(q("[data-leaf-chip]")).toBeTruthy();
    expect(q('[data-leaf-verb="change"]')).toBeNull();
  });

  it("awaiting_kind opens the picker by default; other stages start closed", () => {
    render(<IngestLeafChip row={row({ stage: "awaiting_kind", leaf: null, leaf_source: null })} />);
    expect(q('[data-leaf-pick="pcn"]')).toBeTruthy();
    expect(q('[data-leaf-pick="pdn"]')).toBeTruthy();
    cleanup();
    render(<IngestLeafChip row={row()} />);
    expect(q('[data-leaf-pick="pcn"]')).toBeNull();
    fireEvent.click(q('[data-leaf-verb="change"]')!);
    expect((q('[data-leaf-pick="pcn"]') as HTMLButtonElement).disabled).toBe(true); // the current leaf
    expect((q('[data-leaf-pick="pdn"]') as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(q('[data-leaf-verb="cancel"]')!);
    expect(q('[data-leaf-pick="pdn"]')).toBeNull();
  });

  // The directive: the leaf can be changed BEFORE extraction starts as well as after.
  it.each(["received", "extracting", "awaiting_origin", "awaiting_kind", "review"])("at %s the leaf can be changed", (stage) => {
    render(<IngestLeafChip row={row({ stage, leaf: null, leaf_source: null })} />);
    expect(q('[data-leaf-verb="change"]')).toBeTruthy();
  });

  it("a row that REACHES awaiting_kind while mounted opens the picker; a close made earlier does not carry over", () => {
    const r = render(<IngestLeafChip row={row({ stage: "extracting", leaf: null, leaf_source: null })} />);
    fireEvent.click(q('[data-leaf-verb="change"]')!);
    fireEvent.click(q('[data-leaf-verb="cancel"]')!);
    expect(q('[data-leaf-pick="pcn"]')).toBeNull();
    r.rerender(<IngestLeafChip row={row({ stage: "awaiting_kind", leaf: null, leaf_source: null })} />);
    expect(q('[data-leaf-pick="pcn"]')).toBeTruthy();
    expect(q('[data-leaf-chip]')?.textContent).toContain("? · not identified");
  });

  it("a pick posts the leaf and hands the parsed row to onRow", async () => {
    correctIngestLeaf.mockResolvedValue(wire({ leaf: "pdn", leaf_source: "ingest" }));
    const onRow = vi.fn();
    render(<IngestLeafChip row={row()} onRow={onRow} />);
    fireEvent.click(q('[data-leaf-verb="change"]')!);
    fireEvent.click(q('[data-leaf-pick="pdn"]')!);
    await waitFor(() => expect(onRow).toHaveBeenCalledTimes(1));
    expect(correctIngestLeaf).toHaveBeenCalledWith(ID, "pdn");
    expect(onRow.mock.calls[0][0]).toMatchObject({ leaf: "pdn", leaf_source: "ingest" });
    expect(q('[data-leaf-pick="pdn"]')).toBeNull();
  });

  it("a 409 refusal's message is shown verbatim and the picker stays open", async () => {
    const message = "The kind can no longer be changed at promoted.";
    correctIngestLeaf.mockRejectedValue({
      response: { status: 409, data: { detail: { error: "leaf_locked", stage: "promoted", message } } },
    });
    render(<IngestLeafChip row={row()} />);
    fireEvent.click(q('[data-leaf-verb="change"]')!);
    fireEvent.click(q('[data-leaf-pick="pdn"]')!);
    await waitFor(() => expect(q("[data-leaf-error]")?.textContent).toBe(message));
    expect(q('[data-leaf-pick="pdn"]')).toBeTruthy();
  });
});
