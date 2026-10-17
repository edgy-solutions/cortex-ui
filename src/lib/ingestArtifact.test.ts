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

describe("notice_id: absent / null / string / malformed", () => {
  const read = (over: Record<string, unknown>): IngestStatusRow => readIngestStatusRow(wireRow(over))!;
  const noticeOf = (row: IngestStatusRow) => ingestComponentFrom(ingestToArtifact(entry({ row })))!.notice_id;

  it("absent: no claim -- the key is not on the row; the component carries null", () => {
    const row = read({});
    expect("notice_id" in row).toBe(false);
    expect(noticeOf(row)).toBeNull();
  });

  it("null: the key is present and null", () => {
    const row = read({ notice_id: null });
    expect("notice_id" in row).toBe(true);
    expect(row.notice_id).toBeNull();
    expect(noticeOf(row)).toBeNull();
  });

  it("a non-blank string is kept verbatim", () => {
    const row = read({ notice_id: "PCN26-184" });
    expect(row.notice_id).toBe("PCN26-184");
    expect(noticeOf(row)).toBe("PCN26-184");
    expect(read({ notice_id: " PCN26-184 " }).notice_id).toBe(" PCN26-184 ");
  });

  it.each([["empty", ""], ["whitespace", "  "], ["a number", 42], ["an object", {}]])(
    "%s: no claim -- the key is not on the row",
    (_n, value) => {
      expect("notice_id" in read({ notice_id: value })).toBe(false);
    },
  );

  it("search finds the entry by its notice id", () => {
    const art = ingestToArtifact(entry({ row: read({ notice_id: "PCN26-184" }) }));
    expect(answerSearchText(art)).toContain("pcn26-184");
  });
});

describe("rail placement: a retried drop sits at its latest activity, every other drop at its drop", () => {
  const DROP = 1790860800000; // the original drop
  const LATER = DROP + 4 * 86400000; // four days on: a different day header
  const placed = (row: Record<string, unknown> | null) => {
    const a = ingestToArtifact(entry({ droppedAt: DROP, row: row ? readIngestStatusRow(wireRow({ created_at: DROP, ...row })) : null }));
    return [a.created_at, a.updated_at];
  };

  it("attempt 2, retried four days later -> placed at updated_at, not the original drop", () => {
    expect(placed({ attempt: 2, stage: "received", updated_at: LATER })).toEqual([LATER, LATER]);
  });
  it("attempt 1 that moved on four days later -> stays at the drop (a stage change is not a retry)", () => {
    expect(placed({ attempt: 1, stage: "promoted", updated_at: LATER })).toEqual([DROP, DROP]);
  });
  it("attempt absent -> stays at the drop, however late updated_at is", () => {
    expect(placed({ stage: "promoted", updated_at: LATER })).toEqual([DROP, DROP]);
  });
  it("attempt 2 whose server updated_at reads EARLIER than this browser's drop -> never placed before the drop", () => {
    expect(placed({ attempt: 2, stage: "received", updated_at: DROP - 60_000 })).toEqual([DROP, DROP]);
  });
  it("no row yet -> the drop", () => {
    expect(placed(null)).toEqual([DROP, DROP]);
  });
});

describe("failed reason", () => {
  const reasonOf = (stage: string, detail: string | null) =>
    ingestComponentFrom(ingestToArtifact(entry({ row: readIngestStatusRow(wireRow({ stage, detail })) })))!.reason;

  it("is the detail for failed, null for rejected and every other stage", () => {
    expect(reasonOf("failed", "no registered content_kind")).toBe("no registered content_kind");
    expect(reasonOf("rejected", "not a PCN")).toBeNull();
    expect(reasonOf("review", null)).toBeNull();
  });
});

describe("content_kind: the chip names the leaf kind once the row carries one", () => {
  const read = (over: Record<string, unknown>): IngestStatusRow => readIngestStatusRow(wireRow(over))!;
  const chipOf = (row: IngestStatusRow | null) => ingestToArtifact(entry({ row })).question_text;

  it("a string: kept verbatim, and the chip says it instead of the sent kind", () => {
    const row = read({ content_kind: "pcn" });
    expect(row.content_kind).toBe("pcn");
    expect(ingestComponentFrom(ingestToArtifact(entry({ row })))!.content_kind).toBe("pcn");
    expect(chipOf(row)).toBe("dropped as pcn");
  });

  it("null ('not known'): the key is present and null, the chip falls back to the sent kind", () => {
    const row = read({ content_kind: null });
    expect("content_kind" in row).toBe(true);
    expect(row.content_kind).toBeNull();
    expect(chipOf(row)).toBe("dropped as pdf");
  });

  it("absent (a fleet before 191): no claim, the chip says the sent kind", () => {
    const row = read({});
    expect("content_kind" in row).toBe(false);
    expect(chipOf(row)).toBe("dropped as pdf");
    expect(chipOf(null)).toBe("dropped as pdf");
  });

  it.each([["empty", ""], ["whitespace", "  "], ["a number", 7], ["an object", {}]])(
    "%s: no claim -- the key is not on the row and the chip says the sent kind",
    (_n, value) => {
      const row = read({ content_kind: value });
      expect("content_kind" in row).toBe(false);
      expect(chipOf(row)).toBe("dropped as pdf");
    },
  );
});
