/**
 * THE ROW-EDITS WIRE SEAL: what cortex SENDS on `POST /human_tasks/{id}/act` for a grouped review,
 * against the producer's own models in `src/iagent/gateway.py`: `DeletedRow`, `AddedRow`,
 * `CorrectedRow`, `RowEdits`, `HumanTaskActRequest` and the `reason_code` Literal. The comparison
 * is key-set EQUALITY (not containment) for each row-edit entry type: a key cortex omits is a 422
 * (required field missing), a key cortex adds is a 422 (`extra="forbid"`).
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
import { buildRowEdits, type RowEditDraft } from "./reviewRowEdits";
import { REJECT_REASONS } from "@/components/GroupedReview/GroupedReviewTable";

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

/** `_GROUPED_REJECT_CODES = ("a", "b", ...)`. */
function rejectCodesTuple(src: string): string[] {
  const m = /^_GROUPED_REJECT_CODES\s*=\s*\(([^)]*)\)/m.exec(src);
  if (!m) throw new Error("_GROUPED_REJECT_CODES not found");
  return [...m[1].matchAll(/"([^"]*)"/g)].map((x) => x[1]);
}

describe("the parser, unit-tested on fixtures", () => {
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
  it("a reject sends {decision, comment, reason_code} and no row_edits, all declared", () => {
    const keys = Object.keys(buildActBody("rejected", "c", undefined, edits(), "not_a_notice"));
    expect(sorted(keys), AT).toEqual(["comment", "decision", "reason_code"]);
    const declared = fieldNames(src(), "HumanTaskActRequest");
    for (const k of keys) expect(declared, `${AT}: "${k}" is not a declared field`).toContain(k);
  });
  it("the reject reason_code values are exactly the producer's Literal and _GROUPED_REJECT_CODES, in order", () => {
    const ours = REJECT_REASONS.map((r) => r.code);
    expect(ours, AT).toEqual(reasonCodeLiteral(src()));
    expect(ours, AT).toEqual(rejectCodesTuple(src()));
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
