/**
 * A drop as an Artifact (src/lib/ingestArtifact.ts): the badge, the in-flight predicate, the search
 * text, and the three-state `extraction_defect` read (src/lib/ingestWire.ts).
 */
import { describe, it, expect } from "vitest";
import {
  ingestComponentFrom,
  ingestInFlight,
  ingestToArtifact,
  isIngestArtifact,
  type IngestEntry,
} from "./ingestArtifact";
import { answerArchetype, answerSearchText, answerSummary } from "./answerDisplay";
import { drawnLineageClaim } from "./drawnLineage";
import { readIngestStatusRow, type IngestStatusRow } from "./ingestWire";

const ID = `sha256:${"3f9a2b".padEnd(64, "0")}`;
const OTHER = `sha256:${"a1b2c3".padEnd(64, "0")}`;

const wireRow = (over: Record<string, unknown> = {}) => ({
  ingest_id: ID,
  sha256: "3f9a2b".padEnd(64, "0"),
  kind: "pdf",
  stage: "review",
  detail: null,
  duplicate: null,
  created_at: 1790860800000,
  updated_at: 1790860800000,
  origin: null,
  case_id: null,
  ...over,
});

const entry = (over: Partial<IngestEntry> = {}): IngestEntry => ({
  key: "t1",
  filename: "work-instruction.pdf",
  kind: "pdf",
  droppedAt: 1790860800000,
  phase: "status",
  ingestId: ID,
  error: null,
  acceptedThisSession: true,
  duplicate: null,
  note: null,
  row: null,
  notFound: false,
  ...over,
});

const badge = (e: IngestEntry) => ingestComponentFrom(ingestToArtifact(e))!.badge;

describe("the drop as an Artifact", () => {
  it("is an INGEST artifact, led by the filename, and is not an answer", () => {
    const a = ingestToArtifact(entry());
    expect(isIngestArtifact(a)).toBe(true);
    expect(answerArchetype(a)).toBe("INGEST");
    expect(answerSummary(a)).toBe("work-instruction.pdf");
    expect(a.created_at).toBe(1790860800000);
    expect(a.durability_status).toBe("persistence_pending");
    expect(drawnLineageClaim(a)).toBeUndefined();
  });

  it("badge: uploading, error, duplicate, received, then the row stage", () => {
    expect(badge(entry({ phase: "uploading", ingestId: null, acceptedThisSession: false }))).toBe("uploading");
    expect(badge(entry({ phase: "error", ingestId: null, error: "too big" }))).toBe("error");
    expect(badge(entry({ duplicate: { message: "already processed", ofIngestId: OTHER } }))).toBe("duplicate");
    expect(badge(entry())).toBe("received");
    expect(badge(entry({ row: readIngestStatusRow(wireRow({ stage: "extracting" })) }))).toBe("extracting");
    expect(badge(entry({ row: readIngestStatusRow(wireRow({ stage: "promoted" })) }))).toBe("promoted");
  });

  it("a remembered drop with no row yet says it is being checked, not received", () => {
    expect(badge(entry({ acceptedThisSession: false }))).toBe("checking");
    expect(badge(entry({ acceptedThisSession: false, notFound: true }))).toBe("not found");
  });

  it("in flight = uploading + received/extracting/review; nothing terminal, nothing unread", () => {
    const flight = (b: string) => ingestInFlight({ badge: b });
    for (const b of ["uploading", "received", "extracting", "review"]) expect(flight(b), b).toBe(true);
    for (const b of ["promoted", "rejected", "failed", "duplicate", "error", "not found", "checking", "case_opened"]) {
      expect(flight(b), b).toBe(false);
    }
  });

  it("search finds the drop by filename, ingest id, stage and the original id", () => {
    const a = ingestToArtifact(
      entry({ duplicate: { message: "already processed", ofIngestId: OTHER }, ingestId: OTHER }),
    );
    const text = answerSearchText(a);
    expect(text).toContain("work-instruction.pdf");
    expect(text).toContain(OTHER.toLowerCase());
    expect(text).toContain("duplicate");
    const b = answerSearchText(ingestToArtifact(entry({ row: readIngestStatusRow(wireRow()) })));
    expect(b).toContain(ID.toLowerCase());
    expect(b).toContain("review");
  });
});

describe("extraction_defect: absent / null / object / malformed", () => {
  const read = (over: Record<string, unknown>): IngestStatusRow => readIngestStatusRow(wireRow(over))!;
  const defectOf = (row: IngestStatusRow) => ingestComponentFrom(ingestToArtifact(entry({ row })))!.extraction_defect;

  it("absent: no claim -- the key is not on the row and nothing is drawn", () => {
    const row = read({});
    expect("extraction_defect" in row).toBe(false);
    expect(defectOf(row)).toBeNull();
  });

  it("null: no defect on record -- carried as null, drawn as nothing", () => {
    const row = read({ extraction_defect: null });
    expect(row.extraction_defect).toBeNull();
    expect(defectOf(row)).toBeNull();
  });

  it("object: the defect, verbatim", () => {
    const row = read({ extraction_defect: { task_id: "task-9", edits: 3 } });
    expect(row.extraction_defect).toEqual({ task_id: "task-9", edits: 3 });
    expect(defectOf(row)).toEqual({ task_id: "task-9", edits: 3 });
  });

  it.each([
    ["an empty task id", { task_id: "", edits: 3 }],
    ["a missing task id", { edits: 3 }],
    ["a negative count", { task_id: "t", edits: -1 }],
    ["a fractional count", { task_id: "t", edits: 1.5 }],
    ["a string count", { task_id: "t", edits: "3" }],
    ["a non-record", "defect"],
    ["an array", []],
  ])("malformed (%s): no claim, never complete and never a defect", (_n, value) => {
    const row = read({ extraction_defect: value });
    expect("extraction_defect" in row).toBe(false);
    expect(defectOf(row)).toBeNull();
  });

  it("zero edits is a valid object", () => {
    expect(read({ extraction_defect: { task_id: "t", edits: 0 } }).extraction_defect).toEqual({ task_id: "t", edits: 0 });
  });
});
