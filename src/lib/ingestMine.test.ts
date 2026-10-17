/**
 * `GET /ingest/mine` (191): the page reader (`readIngestMinePage`, src/lib/ingestWire.ts) and the
 * merge rule (`mergeListedRow`, src/store/useIngestStatusStore.ts) — a row this tab already holds
 * wins only while it is NEWER than the listed item.
 */
import { describe, it, expect } from "vitest";
import { readIngestMinePage, readIngestStatusRow, type IngestStatusRow } from "./ingestWire";
import { mergeListedRow } from "@/store/useIngestStatusStore";

const ID = `sha256:${"3f9a2b".padEnd(64, "0")}`;
const T = 1790860800000;
const wire = (over: Record<string, unknown> = {}) => ({
  ingest_id: ID, sha256: ID.slice(7), kind: "pdf", stage: "review", detail: null, duplicate: null,
  created_at: T, updated_at: T, origin: null, case_id: null, ...over,
});
const row = (over: Record<string, unknown> = {}): IngestStatusRow => readIngestStatusRow(wire(over))!;

describe("readIngestMinePage", () => {
  it("items in the server's order, read as status rows; the cursor kept", () => {
    const OTHER = `sha256:${"a1b2c3".padEnd(64, "0")}`;
    const page = readIngestMinePage({ items: [wire({ content_kind: "pcn" }), wire({ ingest_id: OTHER, sha256: OTHER.slice(7) })], next: "c1" });
    expect(page!.items.map((r) => r.ingest_id)).toEqual([ID, OTHER]);
    expect(page!.items[0].content_kind).toBe("pcn");
    expect(page!.next).toBe("c1");
    expect(page!.unreadable).toBe(0);
  });

  it("an unreadable item is left out AND counted, never silently", () => {
    const page = readIngestMinePage({ items: [wire(), { ingest_id: 7 }, wire({ stage: "no-such-stage" })], next: null });
    expect(page!.items).toHaveLength(1);
    expect(page!.unreadable).toBe(2);
  });

  it("no drops: an empty page, not a refusal", () => {
    expect(readIngestMinePage({ items: [], next: null })).toEqual({ items: [], unreadable: 0, next: null });
  });

  it.each([["a blank cursor", ""], ["a number", 3], ["absent", undefined]])("%s: next is null", (_n, next) => {
    expect(readIngestMinePage({ items: [], next })!.next).toBeNull();
  });

  it.each([["null", null], ["an array", []], ["items not an array", { items: {} }], ["the 422 body", { error: "invalid_cursor" }]])(
    "%s: not this route's body -> null",
    (_n, raw) => {
      expect(readIngestMinePage(raw)).toBeNull();
    },
  );
});

describe("mergeListedRow: the held row wins only while it is newer", () => {
  it("nothing held -> the listed item", () => {
    const listed = row();
    expect(mergeListedRow(undefined, listed)).toBe(listed);
  });
  it("held is NEWER (the live poll moved on) -> held", () => {
    const held = row({ stage: "promoted", updated_at: T + 1 });
    expect(mergeListedRow(held, row())).toBe(held);
  });
  it("held is the same age -> the listed item", () => {
    const listed = row();
    expect(mergeListedRow(row({ stage: "extracting" }), listed)).toBe(listed);
  });
  it("held is OLDER -> the listed item", () => {
    const listed = row({ stage: "promoted", updated_at: T + 1 });
    expect(mergeListedRow(row(), listed)).toBe(listed);
  });
});
