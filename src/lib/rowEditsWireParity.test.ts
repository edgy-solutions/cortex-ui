/**
 * THE ROW-EDITS WIRE SEAL: what cortex SENDS on `POST /human_tasks/{id}/act` for a grouped review,
 * against the producer's own models in `src/iagent/gateway.py`: `DeletedRow`, `AddedRow`,
 * `CorrectedRow`, `RowEdits`, `HumanTaskActRequest` and the `reason_code` Literal; and both reject
 * code lists (grouped table, promotion card) against the producer's tuples, `_GROUPED_REJECT_CODES`
 * there and `PROMOTION_REJECT_CODES` in `promotion.py` beside it. The comparison
 * is key-set EQUALITY (not containment) for each row-edit entry type: a key cortex omits is a 422
 * (required field missing), a key cortex adds is a 422 (`extra="forbid"`).
 *
 * The send is for BOTH verbs the receiver keeps `row_edits` for (`approved` on a grouped review,
 * `promoted` on a document_promotion task); the keep-condition itself is parsed from gateway.py.
 *
 * HEADER EDITS: `HeaderEdit`'s key set and `field` Literal, `header_edits` declared on the request, and the
 * verb its guard keeps it for, are all parsed from the producer (gateway.py at b7100fda or later).
 *
 * RUN WITH `npm run test`, never bare `npx vitest run` (same reason as taskKindParity.test.tsx).
 * Producer lookup follows the sibling parity tests: `<repo>/../<invincible-agent|ia-01>/src/iagent/
 * gateway.py`, plus `CORTEX_PRODUCER_ROOT` (a dir holding `src/iagent/gateway.py`) when set. The
 * checkout must stand at the pinned ref (`CORTEX_PRODUCER_REF`, echoed in every message); measure
 * from a `git archive` export, not a working tree that may hold WIP.
 *
 * FIELD NOTE. `HumanTaskActRequest` itself inherits plain pydantic `BaseModel` (extra ignored); only
 * the row models are `extra="forbid"`. So the top-level arms assert cortex's keys are a SUBSET of
 * the declared fields (an undeclared key would be dropped silently), and pin the exact top-level
 * key set per scenario.
 */
import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { buildActBody } from "@/api/client";
import { buildHeaderEdits, buildRowEdits, HEADER_EDIT_FIELDS, type RowEditDraft } from "./reviewRowEdits";
import { REJECT_REASONS } from "@/components/GroupedReview/GroupedReviewTable";
import { DEFAULT_REJECT_CODES } from "./promotionReview";

// ── the parser ──────────────────────────────────────────────────────────────────────────────

/** The body of `class <name>(...):`: every line up to the next column-0 non-blank line. */
function classBody(src: string, name: string): string[] {
  const lines = src.split(/\r?\n/);
  const start = lines.findIndex((l) => new RegExp(`^class ${name}\\(`).test(l));
  if (start < 0) throw new Error(`class ${name} not found`);
  const out: string[] = [];
  for (let i = start + 1; i < lines.length; i++) {
    const l = lines[i];
    if (l.trim() !== "" && !/^\s/.test(l)) break;
    out.push(l);
  }
  return out;
}

/** The annotated field names (`    name: type ...`) declared directly in the class body. */
function fieldNames(src: string, name: string): string[] {
  const out: string[] = [];
  for (const l of classBody(src, name)) {
    const m = /^ {4}([a-z_][a-z0-9_]*)\s*:\s*\S/.exec(l);
    if (m) out.push(m[1]);
  }
  if (out.length === 0) throw new Error(`class ${name}: no fields parsed`);
  return out;
}

/** The string members of the `reason_code: Optional[Literal[...]]` annotation, in order. */
function reasonCodeLiteral(src: string): string[] {
  const line = classBody(src, "HumanTaskActRequest").find((l) => /^ {4}reason_code\s*:/.test(l));
  if (!line) throw new Error("HumanTaskActRequest.reason_code not found");
  const lit = /Literal\[([^\]]*)\]/.exec(line);
  if (!lit) throw new Error("reason_code is no longer a Literal[...]");
  return [...lit[1].matchAll(/"([^"]*)"/g)].map((m) => m[1]);
}

/** The verbs in the receiver's keep-condition `self.row_edits is not None and self.decision not in (...)`. */
function rowEditsDecisions(src: string): string[] {
  const m = /self\.row_edits is not None and self\.decision not in \(([^)]*)\)/.exec(src);
  if (!m) throw new Error("row_edits decision guard not found");
  return [...m[1].matchAll(/"([^"]*)"/g)].map((x) => x[1]);
}

/** The members of `field: Literal[...]` in the class body of `className`, in order. */
function classFieldLiteral(src: string, className: string): string[] {
  const line = classBody(src, className).find((l) => /^ {4}field\s*:/.test(l));
  if (!line) throw new Error(`${className}.field not found`);
  const lit = /Literal\[([^\]]*)\]/.exec(line);
  if (!lit) throw new Error(`${className}.field is no longer a Literal[...]`);
  return [...lit[1].matchAll(/"([^"]*)"/g)].map((m) => m[1]);
}

/** The one verb `header_edits` is kept for: `if self.header_edits is not None:` then `if self.decision != "<verb>":`. */
function headerEditsVerb(src: string): string {
  const m = /if self\.header_edits is not None:\s*\n\s*if self\.decision != "([^"]*)"/.exec(src);
  if (!m) throw new Error("header_edits decision guard not found");
  return m[1];
}

/** `<name> = ("a", "b", ...)` at column 0, as a tuple LITERAL (an alias of another name reads as "not found"). */
function codesTuple(src: string, name: string): string[] {
  const m = new RegExp(`^${name}\\s*=\\s*\\(([^)]*)\\)`, "m").exec(src);
  if (!m) throw new Error(`${name} not found`);
  return [...m[1].matchAll(/"([^"]*)"/g)].map((x) => x[1]);
}

describe("the parser, unit-tested on fixtures", () => {
  it("reads a field Literal and the header_edits verb guard, and throws when either is absent", () => {
    const lit = 'class HeaderEdit(_M):\n    field: Literal["mfr", "notice_id"]\n    value: str\n';
    expect(classFieldLiteral(lit, "HeaderEdit")).toEqual(["mfr", "notice_id"]);
    expect(() => classFieldLiteral(lit.replace("Literal", "Str"), "HeaderEdit")).toThrow(/no longer a Literal/);
    expect(() => classFieldLiteral("class Other(_M):\n    x: str\n", "Other")).toThrow(/field not found/);
    const g = '        if self.header_edits is not None:\n            if self.decision != "promoted":\n                raise ValueError("x")\n';
    expect(headerEditsVerb(g)).toBe("promoted");
    expect(() => headerEditsVerb("x = 1\n")).toThrow(/header_edits decision guard not found/);
  });
  it("reads the row_edits decision guard, and throws when the line is absent", () => {
    const ok = '        if self.row_edits is not None and self.decision not in ("approved", "promoted"):\n';
    expect(rowEditsDecisions(ok)).toEqual(["approved", "promoted"]);
    expect(() => rowEditsDecisions("x = 1\n")).toThrow(/row_edits decision guard not found/);
  });
  const fx =
    'class _M(B):\n    model_config = {"extra": "forbid"}\n\n\nclass Row(_M):\n    mpn: str\n    # a comment: here\n' +
    "    reason: str   # trailing: note\n\n    def f(self):\n        x: int = 1\n\nclass Next(_M):\n    other: str\n";
  it("reads annotated top-level names only, stopping at the next class", () => {
    expect(fieldNames(fx, "Row")).toEqual(["mpn", "reason"]);
  });
  it("throws on a missing class and on a field-less class", () => {
    expect(() => fieldNames(fx, "Nope")).toThrow(/not found/);
    expect(() => fieldNames("class E(_M):\n    pass\n", "E")).toThrow(/no fields/);
  });
  it("reads a Literal and throws when it stops being one", () => {
    const ok = 'class HumanTaskActRequest(B):\n    reason_code: Optional[Literal["a", "b"]] = None\n';
    expect(reasonCodeLiteral(ok)).toEqual(["a", "b"]);
    expect(() => reasonCodeLiteral(ok.replace("Literal", "Str"))).toThrow(/no longer a Literal/);
  });
  it("reads a named tuple literal at column 0, and an alias is not one", () => {
    const ok = 'X = 1\nCODES = ("a", "b")\n  NESTED = ("z",)\n';
    expect(codesTuple(ok, "CODES")).toEqual(["a", "b"]);
    expect(() => codesTuple(ok, "NESTED")).toThrow(/NESTED not found/);
    expect(() => codesTuple("CODES = OTHER_CODES\n", "CODES")).toThrow(/CODES not found/);
  });
});

// ── the live comparand ──────────────────────────────────────────────────────────────────────

function findGateway(): string | null {
  const rel = "src/iagent/gateway.py";
  const env = (process.env.CORTEX_PRODUCER_ROOT || "").trim();
  if (env && existsSync(path.join(env, rel))) return path.join(env, rel);
  for (const name of ["invincible-agent", "ia-01"]) {
    const p = path.join(__dirname, "../../..", name, rel);
    if (existsSync(p)) return p;
  }
  return null;
}
const GATEWAY = findGateway();
const REF = (process.env.CORTEX_PRODUCER_REF || "").trim();
const AT = REF ? `producer at ${REF.slice(0, 7)}` : "producer (CORTEX_PRODUCER_REF unset)";

const draft = (): RowEditDraft => ({
  deleted: { "DEL-1": { reason: "dup" } },
  addedMpns: ["ADD-1"],
  corrected: { "COR-1": "COR-1X" },
  overrides: { "ADD-1": { disposition: "dispatchQualification", reason: "missed" } },
  addedEvidence: { "ADD-1": "p.2" },
  correctedEvidence: { "COR-1": "p.3" },
});

describe.skipIf(GATEWAY === null)("cortex's grouped-review send equals the producer's models", () => {
  const src = () => readFileSync(GATEWAY!, "utf8");
  const edits = () => buildRowEdits(draft());
  const sorted = (a: string[]) => [...a].sort();

  it("deleted entries carry exactly DeletedRow's fields", () => {
    expect(sorted(Object.keys(edits().deleted[0]!)), AT).toEqual(sorted(fieldNames(src(), "DeletedRow")));
  });
  it("added entries carry exactly AddedRow's fields", () => {
    expect(sorted(Object.keys(edits().added[0]!)), AT).toEqual(sorted(fieldNames(src(), "AddedRow")));
  });
  it("corrected entries carry exactly CorrectedRow's fields", () => {
    expect(sorted(Object.keys(edits().corrected[0]!)), AT).toEqual(sorted(fieldNames(src(), "CorrectedRow")));
  });
  it("row_edits carries exactly RowEdits' lists", () => {
    expect(sorted(Object.keys(edits())), AT).toEqual(sorted(fieldNames(src(), "RowEdits")));
  });
  it("an approve with edits sends {decision, comment, row_edits}, all declared on HumanTaskActRequest", () => {
    const keys = Object.keys(buildActBody("approved", "", undefined, edits(), "not_a_notice"));
    expect(sorted(keys), AT).toEqual(["comment", "decision", "row_edits"]);
    const declared = fieldNames(src(), "HumanTaskActRequest");
    for (const k of keys) expect(declared, `${AT}: "${k}" is not a declared field, it would be dropped`).toContain(k);
  });
  it("a promote with edits sends {decision, comment, row_edits}, all declared on HumanTaskActRequest", () => {
    const keys = Object.keys(buildActBody("promoted", "", undefined, edits()));
    expect(sorted(keys), AT).toEqual(["comment", "decision", "row_edits"]);
    const declared = fieldNames(src(), "HumanTaskActRequest");
    for (const k of keys) expect(declared, `${AT}: "${k}" is not a declared field, it would be dropped`).toContain(k);
  });
  it("row_edits is sent for exactly the verbs the receiver keeps it for", () => {
    const kept = rowEditsDecisions(src());
    const verbs = [...new Set([...kept, "approved", "promoted", "rejected", "acknowledged", "redriven", "dismissed"])];
    for (const v of verbs) {
      expect("row_edits" in buildActBody(v as never, "", undefined, edits()), `${AT}: verb ${v}`).toBe(kept.includes(v));
    }
  });
  it("header_edits entries carry exactly HeaderEdit's fields", () => {
    const h = buildHeaderEdits({ mfr: { value: "X", evidence_ref: "p1", reason: "r" } }, { mfr: null, notice_id: null, notice_date: null });
    expect(sorted(Object.keys(h[0]!)), AT).toEqual(sorted(fieldNames(src(), "HeaderEdit")));
  });
  it("HeaderEdit.field's Literal is exactly cortex's header fields, in order", () => {
    expect([...HEADER_EDIT_FIELDS], AT).toEqual(classFieldLiteral(src(), "HeaderEdit"));
  });
  it("header_edits is declared on HumanTaskActRequest, and a header-only promote sends no row_edits", () => {
    const h = buildHeaderEdits({ mfr: { value: "X", evidence_ref: "p1", reason: "r" } }, { mfr: null, notice_id: null, notice_date: null });
    const keys = Object.keys(buildActBody("promoted", "", undefined, undefined, undefined, h));
    expect(sorted(keys), AT).toEqual(["comment", "decision", "header_edits"]);
    const declared = fieldNames(src(), "HumanTaskActRequest");
    for (const k of keys) expect(declared, `${AT}: "${k}" is not a declared field, it would be dropped`).toContain(k);
  });
  it("header_edits is sent for exactly the verb the receiver keeps it for", () => {
    const keep = headerEditsVerb(src());
    const h = buildHeaderEdits({ mfr: { value: "X", evidence_ref: "p1", reason: "r" } }, { mfr: null, notice_id: null, notice_date: null });
    for (const v of ["approved", "promoted", "rejected", "acknowledged", "redriven", "dismissed", keep]) {
      expect("header_edits" in buildActBody(v as never, "", undefined, edits(), undefined, h), `${AT}: verb ${v}`).toBe(v === keep);
    }
  });
  it("a reject sends {decision, comment, reason_code} and no row_edits, all declared", () => {
    const keys = Object.keys(buildActBody("rejected", "c", undefined, edits(), "not_a_notice"));
    expect(sorted(keys), AT).toEqual(["comment", "decision", "reason_code"]);
    const declared = fieldNames(src(), "HumanTaskActRequest");
    for (const k of keys) expect(declared, `${AT}: "${k}" is not a declared field`).toContain(k);
  });
  it("the reject reason_code values are exactly the producer's Literal and _GROUPED_REJECT_CODES, in order", () => {
    const ours = REJECT_REASONS.map((r) => r.code);
    expect(ours, AT).toEqual(reasonCodeLiteral(src()));
    expect(ours, AT).toEqual(codesTuple(src(), "_GROUPED_REJECT_CODES"));
  });
  it("the promotion card's codes are exactly promotion.py's PROMOTION_REJECT_CODES, in order", () => {
    // The card dropped its "cortex-proposed" legend on this claim; this arm is what makes it one.
    const promotion = readFileSync(path.join(path.dirname(GATEWAY!), "promotion.py"), "utf8");
    expect(DEFAULT_REJECT_CODES.map((c) => c.code), AT).toEqual(codesTuple(promotion, "PROMOTION_REJECT_CODES"));
  });
});

describe("the seal RAN, or says so", () => {
  it("resolved a producer checkout", () => {
    expect(
      GATEWAY,
      "no invincible-agent checkout found (set CORTEX_PRODUCER_ROOT): this seal SKIPPED ENTIRELY and verified nothing.",
    ).not.toBeNull();
  });
});
