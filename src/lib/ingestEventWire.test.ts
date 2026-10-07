/**
 * The EVENT branch of the ingest wire: `event` as a kind, `case_opened` as an out-of-band
 * status (never a stage, never a rung of the document ladder), and `case_id` on the row.
 * Rows are the hand-built ones in `cases.fixtures.ts` — NOT live captures.
 */
import { describe, it, expect } from "vitest";
import {
  INGEST_CASE_OPENED_STATUS,
  INGEST_EVENT_LADDER,
  INGEST_KINDS,
  INGEST_STAGES,
  ingestEventLadder,
  ingestPollingDone,
  ingestStageLadder,
  readIngestStatusRow,
} from "./ingestWire";
import {
  CASE_ID,
  EVENT_ROW_CASE_OPENED_HAND_BUILT,
  EVENT_ROW_RECEIVED_HAND_BUILT,
  PDF_ROW_WITH_CASE_ID_HAND_BUILT,
} from "./cases.fixtures";

describe("seal 2 — case_opened is out of band: in no ladder", () => {
  it("is not an INGEST_STAGE and not a kind", () => {
    expect([...INGEST_STAGES]).not.toContain(INGEST_CASE_OPENED_STATUS);
    expect([...INGEST_KINDS]).not.toContain(INGEST_CASE_OPENED_STATUS);
    expect([...INGEST_KINDS]).toContain("event");
  });

  it("no document-ladder rung, for ANY stage the ladder can be asked for, is case_opened", () => {
    for (const stage of INGEST_STAGES) {
      const rungs = ingestStageLadder(stage).map((r) => r.stage as string);
      expect(rungs, `ladder for ${stage}`).not.toContain(INGEST_CASE_OPENED_STATUS);
    }
  });

  it("the event ladder is exactly received then case_opened, and invents no other stage", () => {
    expect([...INGEST_EVENT_LADDER]).toEqual(["received", "case_opened"]);
    expect(ingestEventLadder("received")).toEqual([
      { stage: "received", state: "current" },
      { stage: "case_opened", state: "pending" },
    ]);
    expect(ingestEventLadder("case_opened")).toEqual([
      { stage: "received", state: "done" },
      { stage: "case_opened", state: "current" },
    ]);
    expect(ingestEventLadder("extracting")).toBeNull();
    expect(ingestEventLadder(null)).toBeNull();
  });

  it("case_opened ends polling (nothing in the event route moves it on)", () => {
    expect(ingestPollingDone({ stage: "case_opened", duplicate: null })).toBe(true);
    expect(ingestPollingDone({ stage: "received", duplicate: null })).toBe(false);
  });
});

describe("the event rows parse", () => {
  it("received: kind event, no case yet", () => {
    const row = readIngestStatusRow(EVENT_ROW_RECEIVED_HAND_BUILT);
    expect(row).not.toBeNull();
    expect(row!.kind).toBe("event");
    expect(row!.stage).toBe("received");
    expect(row!.case_id).toBeNull();
  });
  it("case_opened: carries its case_id", () => {
    const row = readIngestStatusRow(EVENT_ROW_CASE_OPENED_HAND_BUILT);
    expect(row!.stage).toBe("case_opened");
    expect(row!.case_id).toBe(CASE_ID);
  });
  it("a DOCUMENT row at case_opened is refused — the producer writes it for events only", () => {
    expect(readIngestStatusRow({ ...PDF_ROW_WITH_CASE_ID_HAND_BUILT, stage: "case_opened" })).toBeNull();
  });
});

describe("seal 3 — case_id parse: string, null, absent; anything else refuses the row", () => {
  const base = EVENT_ROW_CASE_OPENED_HAND_BUILT;
  const without = (() => {
    const { case_id: _drop, ...rest } = base;
    void _drop;
    return rest;
  })();

  it("a non-empty string becomes the string", () => {
    expect(readIngestStatusRow({ ...base, case_id: "case-77" })!.case_id).toBe("case-77");
  });
  it("null is null", () => {
    expect(readIngestStatusRow({ ...base, case_id: null })!.case_id).toBeNull();
  });
  it("ABSENT is null (older producers omit the field) — and the key is there, as null", () => {
    expect("case_id" in without).toBe(false);
    const row = readIngestStatusRow(without);
    expect(row).not.toBeNull();
    expect(row!.case_id).toBeNull();
    expect("case_id" in row!).toBe(true);
  });
  it("42 refuses the row", () => {
    expect(readIngestStatusRow({ ...base, case_id: 42 })).toBeNull();
  });
  it("an empty string, an object and a boolean refuse the row too", () => {
    expect(readIngestStatusRow({ ...base, case_id: "" })).toBeNull();
    expect(readIngestStatusRow({ ...base, case_id: {} })).toBeNull();
    expect(readIngestStatusRow({ ...base, case_id: false })).toBeNull();
  });
});
