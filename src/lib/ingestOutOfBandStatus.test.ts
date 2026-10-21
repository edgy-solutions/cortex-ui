/**
 * Out-of-band DOCUMENT statuses (`awaiting_origin`, `review_rejected`, and the PROPOSED
 * `awaiting_kind`) and the PROPOSED `leaf` / `leaf_source` pair on the status row.
 */
import { describe, it, expect } from "vitest";
import {
  ingestLeafPath,
  ingestPollingDone,
  ingestStageLadder,
  readIngestMinePage,
  readIngestStatusRow,
} from "./ingestWire";

const ID = `sha256:${"3f9a2b".padEnd(64, "0")}`;
const T = 1790860800000;
const wire = (over: Record<string, unknown> = {}): Record<string, unknown> => ({
  ingest_id: ID, sha256: ID.slice(7), kind: "pdf", stage: "review", detail: null, duplicate: null,
  created_at: T, updated_at: T, origin: null, case_id: null, ...over,
});

describe("reader: out-of-band stages", () => {
  const cases: [string, string | null][] = [
    ["awaiting_origin", null],
    ["review_rejected", "not this supplier"],
    ["awaiting_kind", null],
  ];

  it.each(cases)("a document row at %s parses with that stage", (stage, detail) => {
    expect(readIngestStatusRow(wire({ stage, detail }))?.stage).toBe(stage);
  });

  it.each(cases)("an EVENT row at %s is refused", (stage, detail) => {
    expect(readIngestStatusRow(wire({ kind: "event", stage, detail }))).toBeNull();
  });

  it.each([null, "", "  "])("review_rejected with detail %j is refused", (detail) => {
    expect(readIngestStatusRow(wire({ stage: "review_rejected", detail }))).toBeNull();
  });

  it("control: an unknown stage is still refused", () => {
    expect(readIngestStatusRow(wire({ stage: "awaiting_something" }))).toBeNull();
  });

  it("readIngestMinePage counts an awaiting_origin item as read, not unreadable", () => {
    const page = readIngestMinePage({ items: [wire({ stage: "awaiting_origin" })], next: null });
    expect(page!.items).toHaveLength(1);
    expect(page!.unreadable).toBe(0);
  });
});

describe("ladder and polling", () => {
  const parked = (s: "awaiting_origin" | "awaiting_kind") => [
    { stage: "received", state: "done" },
    { stage: "extracting", state: "done" },
    { stage: "review", state: "pending" },
    { stage: "promoted", state: "pending" },
    { stage: s, state: "current" },
  ];
  it("awaiting_origin", () => expect(ingestStageLadder("awaiting_origin")).toEqual(parked("awaiting_origin")));
  it("awaiting_kind", () => expect(ingestStageLadder("awaiting_kind")).toEqual(parked("awaiting_kind")));
  it("review_rejected branches off review", () => {
    expect(ingestStageLadder("review_rejected")).toEqual([
      { stage: "received", state: "done" },
      { stage: "extracting", state: "done" },
      { stage: "review", state: "done" },
      { stage: "promoted", state: "pending" },
      { stage: "review_rejected", state: "current" },
    ]);
  });
  it.each([
    ["awaiting_origin", false],
    ["awaiting_kind", false],
    ["review_rejected", true],
  ] as const)("ingestPollingDone at %s is %s", (stage, done) => {
    expect(ingestPollingDone({ stage, duplicate: null })).toBe(done);
  });
});

describe("reader: leaf / leaf_source (PROPOSED)", () => {
  it("absent: both keys omitted", () => {
    const r = readIngestStatusRow(wire())!;
    expect("leaf" in r).toBe(false);
    expect("leaf_source" in r).toBe(false);
  });

  it.each([
    [null, null],
    ["pcn", "ingest"],
    ["pdn", "extraction-title"],
  ])("valid pair (%j, %j) is kept", (leaf, leaf_source) => {
    const r = readIngestStatusRow(wire({ leaf, leaf_source }))!;
    expect(r.leaf).toBe(leaf);
    expect(r.leaf_source).toBe(leaf_source);
  });

  it.each([
    ["PCN", "ingest"],
    ["pcn", "dropper"],
    ["pcn", null],
    [null, "ingest"],
    [7, "ingest"],
  ])("no-claim pair (%j, %j): both keys omitted, row still read", (leaf, leaf_source) => {
    const r = readIngestStatusRow(wire({ leaf, leaf_source }))!;
    expect(r).not.toBeNull();
    expect("leaf" in r).toBe(false);
    expect("leaf_source" in r).toBe(false);
  });

  it("leaf present but leaf_source absent: no claim", () => {
    const r = readIngestStatusRow(wire({ leaf: "pcn" }))!;
    expect("leaf" in r).toBe(false);
    expect("leaf_source" in r).toBe(false);
  });
});

describe("ingestLeafPath", () => {
  it("encodes the id", () => expect(ingestLeafPath("sha256:ab/c")).toBe("/ingest/sha256%3Aab%2Fc/leaf"));
});
