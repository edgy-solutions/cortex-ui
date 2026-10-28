/**
 * REFACTOR ITEM 3 -- the hand registries that became DERIVED from the OpenAPI snapshots' enums.
 *
 * Each derivation has two arms, and neither reads `src/api/generated` as its source of truth:
 *
 *   (a) the enum is read straight from the committed SNAPSHOT JSON (never via the generator or the
 *       generated file) and compared with what the CONSUMER accepts: the reader is called with each
 *       value and with one out-of-set value;
 *   (b) a LIVENESS arm: `generate()` run over an in-memory copy of the snapshot with one extra enum
 *       value must emit it -- proving the pipeline carries a new value through, so (a) cannot be
 *       green merely because both sides are stuck on the same stale list.
 *
 * A split enum (the same field, different values in different schemas) must THROW, not pick a copy.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { generate } from "../../scripts/gen-api-types.mjs";
import { INGEST_LEAVES, INGEST_LEAF_SOURCES, readLeafCandidates, readLeafSource } from "../lib/ingestWire";
import { DEFAULT_REJECT_CODES, readExtraction } from "../lib/promotionReview";
import { HEADER_EDIT_FIELDS } from "../lib/reviewRowEdits";
import { REJECT_REASONS } from "../components/GroupedReview/GroupedReviewTable";

const read = (p: string) => readFileSync(path.join(__dirname, p), "utf8");
const v1 = JSON.parse(read("openapi/ingest-v1.openapi.json"));
const bff = JSON.parse(read("openapi/cortex-bff.openapi.json"));
const SOURCES = JSON.parse(read("openapi/SOURCES.json")) as Record<string, { sha: string }>;

/** The enum of `schema.field` read from the snapshot JSON itself; a nullable enum is `anyOf[0].enum`. */
function snapshotEnum(doc: any, schema: string, field: string): string[] {
  const p = doc.components.schemas[schema]?.properties?.[field];
  const e = p?.enum ?? p?.anyOf?.[0]?.enum;
  if (!Array.isArray(e)) throw new Error(`${schema}.${field}: no enum in the snapshot`);
  return e;
}

/** A deep copy of the snapshot with `extra` appended to `schema.field`'s enum. */
function withExtra(doc: any, schema: string, field: string, extra: string): any {
  const copy = JSON.parse(JSON.stringify(doc));
  const p = copy.components.schemas[schema].properties[field];
  (p.enum ?? p.anyOf[0].enum).push(extra);
  return copy;
}

const gen = (doc: any, name: string) => generate(doc, { sourceName: name, sha: SOURCES[name].sha });
const OUT_OF_SET = "not-in-any-enum";
const LEAF_COPIES = ["Extraction", "LeafResponse", "StatusBody", "TitleLeafResponse"];
const FRACTION_REF = { page: 1, bbox: null };

describe("leaf (step 1): INGEST_LEAVES / INGEST_LEAF_SOURCES come from the v1 snapshot", () => {
  for (const s of LEAF_COPIES) {
    it(`${s}.leaf equals what the readers accept`, () => {
      const snap = snapshotEnum(v1, s, "leaf");
      expect([...INGEST_LEAVES]).toEqual(snap);
      for (const leaf of snap) {
        expect(readLeafCandidates({ leaf_candidates: [{ leaf, score: 0.5, evidence_ref: FRACTION_REF }] }), leaf).toBeDefined();
      }
      expect(readLeafCandidates({ leaf_candidates: [{ leaf: OUT_OF_SET, score: 0.5, evidence_ref: FRACTION_REF }] })).toBeUndefined();
    });
    it(`${s}.leaf_source equals what readLeafSource accepts`, () => {
      const snap = snapshotEnum(v1, s, "leaf_source");
      expect([...INGEST_LEAF_SOURCES]).toEqual(snap);
      for (const v of snap) expect(readLeafSource(v), v).toBe(v);
      expect(readLeafSource(OUT_OF_SET)).toBeNull();
    });
  }

  it("liveness: a new leaf in all four copies reaches the generated LEAF constant", () => {
    let doc = v1;
    for (const s of LEAF_COPIES) doc = withExtra(doc, s, "leaf", "document");
    expect(gen(doc, "ingest-v1.openapi.json")).toContain('export const LEAF = ["pcn","pdn","document"] as const;');
  });

  it("a split leaf enum (one copy changed) THROWS rather than picking a copy", () => {
    const doc = withExtra(v1, "StatusBody", "leaf", "document");
    expect(() => gen(doc, "ingest-v1.openapi.json")).toThrow(/split enum for field "leaf"/);
  });
});

describe("reject codes (step 2): the consumers list exactly HumanTaskActRequest.reason_code", () => {
  const snap = snapshotEnum(bff, "HumanTaskActRequest", "reason_code");
  it("REJECT_REASONS and DEFAULT_REJECT_CODES offer each snapshot code, in order, and nothing else", () => {
    expect(REJECT_REASONS.map((r) => r.code)).toEqual(snap);
    expect(DEFAULT_REJECT_CODES.map((r) => r.code)).toEqual(snap);
    expect(REJECT_REASONS.map((r) => r.code)).not.toContain(OUT_OF_SET);
    expect(DEFAULT_REJECT_CODES.map((r) => r.code)).not.toContain(OUT_OF_SET);
  });
  it("every offered code carries a non-empty label", () => {
    for (const r of [...REJECT_REASONS, ...DEFAULT_REJECT_CODES]) expect(r.label.trim()).not.toBe("");
  });
  it("liveness: a new reason_code reaches the generated constant", () => {
    const doc = withExtra(bff, "HumanTaskActRequest", "reason_code", "document");
    expect(gen(doc, "cortex-bff.openapi.json")).toContain('HumanTaskActRequest_reason_code = ["not_a_notice","unreadable","parts_unusable","duplicate","document"]');
  });
});

describe("header-edit fields (step 3)", () => {
  it("HEADER_EDIT_FIELDS equals HeaderEdit.field in the snapshot", () => {
    expect([...HEADER_EDIT_FIELDS]).toEqual(snapshotEnum(bff, "HeaderEdit", "field"));
    expect(HEADER_EDIT_FIELDS as readonly string[]).not.toContain(OUT_OF_SET);
  });
  it("liveness: a new field reaches the generated constant", () => {
    const doc = withExtra(bff, "HeaderEdit", "field", "document");
    expect(gen(doc, "cortex-bff.openapi.json")).toContain('HeaderEdit_field = ["mfr","notice_id","notice_date","document"]');
  });
});

describe("notice.mfr_source (step 4): the reader accepts exactly Notice.mfr_source", () => {
  const read1 = (v: unknown) => readExtraction({ rows: [], notice: { mfr_source: v } })?.manufacturer_source;
  it("reads each snapshot value and nulls an out-of-set one", () => {
    for (const v of snapshotEnum(bff, "Notice", "mfr_source")) expect(read1(v), v).toBe(v);
    expect(read1(OUT_OF_SET)).toBeNull();
  });
  it("liveness: a new mfr_source reaches the generated constant", () => {
    const doc = withExtra(bff, "Notice", "mfr_source", "document");
    expect(gen(doc, "cortex-bff.openapi.json")).toContain('Notice_mfr_source = ["header","identity","document"]');
  });
});
