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
  // awaiting_origin parks after extraction; awaiting_kind after the title read, BEFORE parts
  // extraction (architect, 10-21), so its extracting rung has not finished.
  const parked = (s: "awaiting_origin" | "awaiting_kind") => [
    { stage: "received", state: "done" },
    { stage: "extracting", state: s === "awaiting_origin" ? "done" : "pending" },
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
    ["pcn", "declared"],
    ["pdn", "title"],
    ["pcn", "corrected"],
  ])("valid pair (%j, %j) is kept", (leaf, leaf_source) => {
    const r = readIngestStatusRow(wire({ leaf, leaf_source }))!;
    expect(r.leaf).toBe(leaf);
    expect(r.leaf_source).toBe(leaf_source);
  });

  it.each([
    ["PCN", "declared"],
    ["pcn", "dropper"],
    ["pcn", null],
    [null, "declared"],
    [7, "declared"],
    ["pcn", "ingest"],
    ["pdn", "extraction-title"],
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

describe("reader: the retired names and corrected_by", () => {
  it("the retired names are unknown", () => {
    for (const old of ["ingest", "extraction-title"]) {
      const r = readIngestStatusRow(wire({ leaf: "pcn", leaf_source: old }))!;
      expect("leaf" in r).toBe(false);
      expect("leaf_source" in r).toBe(false);
    }
  });

  it.each([
    ["corrected", "ana", "ana"],
    ["corrected", "  ", null],
    ["corrected", 7, null],
    ["corrected", undefined, null],
    ["title", "ana", null],
    ["declared", "ana", null],
  ])("corrected_by with source %s and value %j reads as %j, and never invalidates the pair", (leaf_source, by, expected) => {
    const r = readIngestStatusRow(wire({ leaf: "pcn", leaf_source, corrected_by: by }))!;
    expect(r.leaf_source).toBe(leaf_source);
    expect(r.corrected_by).toBe(expected);
  });
});

describe("reader: leaf_candidates", () => {
  const ref = { page: 1, bbox: [0.07, 0.03, 0.92, 0.07] };
  const good = (leaf: string, score = 0.5) => ({ leaf, score, evidence_ref: { ...ref } });
  const cand = (v: unknown) => readIngestStatusRow(wire({ leaf: null, leaf_source: null, leaf_candidates: v }))!.leaf_candidates;

  it("a valid list of 2 is kept in the server's order", () => {
    expect(cand([good("pdn", 0.3), good("pcn", 0.9)])?.map((c) => c.leaf)).toEqual(["pdn", "pcn"]);
  });

  it("an absent key is undefined", () => {
    expect(readIngestStatusRow(wire({ leaf: null, leaf_source: null }))!.leaf_candidates).toBeUndefined();
  });

  it("0 items is undefined", () => expect(cand([])).toBeUndefined());
  it("an empty candidate list is no claim", () => expect(cand([])).toBeUndefined());
  it("a null candidate list is no claim", () => expect(cand(null)).toBeUndefined());
  it("a candidate with a pixel bbox drops the whole list", () => {
    expect(cand([good("pdn"), { ...good("pcn"), evidence_ref: { ...ref, bbox: [40, 60, 560, 110] } }])).toBeUndefined();
  });
  it.each([1.2, -0.1])("a score outside 0..1 drops the whole list (%s)", (score) => {
    expect(cand([good("pdn"), good("pcn", score)])).toBeUndefined();
  });
  it("4 items is undefined", () => expect(cand([good("pcn"), good("pdn"), good("pcn"), good("pdn")])).toBeUndefined());
  it("a non-array is undefined", () => expect(cand({ leaf: "pcn" })).toBeUndefined());

  it.each([
    ["score NaN", { ...good("pcn"), score: NaN }],
    ["leaf PCN", { ...good("PCN") }],
    ["page 0", { ...good("pcn"), evidence_ref: { ...ref, page: 0 } }],
    ["bbox of 3", { ...good("pcn"), evidence_ref: { ...ref, bbox: [1, 2, 3] } }],
    ["an extra key", { ...good("pcn"), evidence_ref: { ...ref, extra: 1 } }],
    ["a blank note", { ...good("pcn"), evidence_ref: { ...ref, note: "  " } }],
  ])("one bad item (%s) makes the whole field undefined", (_, bad) => {
    expect(cand([good("pdn"), bad])).toBeUndefined();
  });
});

describe("ingestLeafPath", () => {
  it("encodes the id", () => expect(ingestLeafPath("sha256:ab/c")).toBe("/ingest/sha256%3Aab%2Fc/leaf"));
});
