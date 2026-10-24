/**
 * THE EMPTY-CONFIRM SEAL (spec 208) — what cortex's `document_empty_confirm` card assumes of the
 * producer, read from the producer's own CODE: `gateway.py` (`EMPTY_CONFIRM_KIND`,
 * `_ADD_MISSED_PART_MSG`, `_file_or_find_empty_confirm_task`, `_empty_account`) and `promotion.py`
 * (`KIND`). Four claims, each a thing a quiet producer edit would break with no cortex test red:
 *
 *   (a) the refusal sentence shown beside the disabled "Add a missed part" is the producer's own;
 *   (b) the kind the card dispatches on is the kind the producer files;
 *   (c) every payload / account key the reader consumes is a key the producer writes (a renamed
 *       key reads as "not reported" forever, and that is a plausible-looking card, not a crash);
 *   (d) the audience the producer files it under is `<promotion.KIND>:<DOMAIN>`, which is the one
 *       fact `AUDIENCE_POOL_OF` exempts from the audience/kind contradiction check.
 *
 * EVERY PARSE IS ANCHORED ON CODE, NOT COMMENTS: the gateway comments above this block mention the
 * same names, and a comment can match first. Column-0 anchors, comment lines stripped, and a NAMED
 * throw when an anchor is absent: an unfound anchor must be a red, never an empty comparison.
 *
 * RUN WITH `npm run test`, never bare `npx vitest run` (same reason as `taskKindParity.test.tsx`).
 * Producer lookup follows `rowEditsWireParity.test.ts`: `CORTEX_PRODUCER_ROOT`, then the sibling
 * `invincible-agent` / `ia-01`. Measure from a `git archive` export at the pinned ref.
 */
import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { ADD_MISSED_PART_NOT_BUILT_MESSAGE, EMPTY_CONFIRM_KIND, readEmptyConfirmTask } from "./emptyConfirm";
import { AUDIENCE_POOL_OF } from "./taskDeclaration";

// ── the parser ──────────────────────────────────────────────────────────────────────────────

/** Whole-line `#` comments blanked (line numbers kept), so no anchor below can match one. */
function stripCommentLines(src: string): string {
  return src
    .split(/\r?\n/)
    .map((l) => (/^\s*#/.test(l) ? "" : l))
    .join("\n");
}

/** `NAME = "a"` or `NAME = ("a" "b" ...)` at column 0: the ADJACENT string literals, concatenated. */
function pyStringConstant(src: string, name: string): string {
  const code = stripCommentLines(src);
  const m = new RegExp(`^${name}\\s*=\\s*\\(?((?:\\s*"[^"\\n]*")+)\\s*\\)?\\s*$`, "m").exec(code);
  if (!m) throw new Error(`${name}: no column-0 string constant found`);
  return [...m[1].matchAll(/"([^"\n]*)"/g)].map((x) => x[1]).join("");
}

/** The body of `def <name>(` / `async def <name>(`: through the line before the next column-0 line
 *  that is not a `)` (a signature may close at column 0). Comment lines are blanked. */
function pyFunctionBody(src: string, name: string): string {
  const lines = stripCommentLines(src).split("\n");
  const start = lines.findIndex((l) => new RegExp(`^(async )?def ${name}\\(`).test(l));
  if (start < 0) throw new Error(`def ${name} not found`);
  const out: string[] = [];
  for (let i = start + 1; i < lines.length; i++) {
    if (/^[^\s)]/.test(lines[i])) break;
    out.push(lines[i]);
  }
  return out.join("\n");
}

/** The top-level string keys of the `{...}` literal opening at `open`, string-aware (a key or value
 *  may hold braces, e.g. an f-string). THROWS when braces never balance. */
function dictKeysAt(src: string, open: number): string[] {
  const keys: string[] = [];
  let depth = 0;
  for (let i = open; i < src.length; i++) {
    const ch = src[i];
    if (ch === '"') {
      let j = i + 1;
      while (j < src.length && src[j] !== '"') j += src[j] === "\\" ? 2 : 1;
      if (depth === 1 && /^\s*:/.test(src.slice(j + 1, j + 8))) keys.push(src.slice(i + 1, j));
      i = j;
    } else if (ch === "{" || ch === "[" || ch === "(") depth++;
    else if (ch === "}" || ch === "]" || ch === ")") {
      depth--;
      if (depth === 0) return keys;
    }
  }
  throw new Error("dict literal never closes");
}

/** Keys of the `<varName> = {...}` literal inside `body`. */
function assignedDictKeys(body: string, varName: string): string[] {
  const m = new RegExp(`^\\s+${varName} = \\{`, "m").exec(body);
  if (!m) throw new Error(`${varName} = {...} not found`);
  return dictKeysAt(body, m.index + m[0].length - 1);
}

/** Keys of the first `return {...}` literal inside `body`. */
function returnedDictKeys(body: string): string[] {
  const m = /\breturn \{/.exec(body);
  if (!m) throw new Error("return {...} not found");
  return dictKeysAt(body, m.index + m[0].length - 1);
}

/** The audience line is built from promotion's KIND: `audience = f"{promotion.KIND}:...`. */
function audienceUsesPromotionKind(body: string): boolean {
  return /^\s+audience = f"\{promotion\.KIND\}:/m.test(body);
}

describe("the parser, unit-tested on fixtures", () => {
  it("joins adjacent literals, reads a single literal, ignores comments, and throws when absent", () => {
    const two = '# M = ("no")\nM = ("a "\n     "b")\nK = "k"\n';
    expect(pyStringConstant(two, "M")).toBe("a b");
    expect(pyStringConstant(two, "K")).toBe("k");
    expect(() => pyStringConstant(two, "Z")).toThrow(/Z: no column-0 string constant/);
    expect(() => pyStringConstant("# K = \"k\"\n", "K")).toThrow(/no column-0/);
  });
  it("reads a function body (closing paren at column 0 is not the end) and throws when absent", () => {
    const src = "async def f(\n    a,\n) -> int:\n    x = 1\n    return x\n\ndef g():\n    y = 2\n";
    expect(pyFunctionBody(src, "f")).toContain("return x");
    expect(pyFunctionBody(src, "f")).not.toContain("y = 2");
    expect(() => pyFunctionBody(src, "nope")).toThrow(/def nope not found/);
  });
  it("reads top-level dict keys, string-aware, skipping nested dicts and values", () => {
    const body = '    payload = {"a": f"/x/{id}/y", "b": {"inner": 1}, "c": 3,\n               "d": [1, {"e": 2}]}\n';
    expect(assignedDictKeys(body, "payload")).toEqual(["a", "b", "c", "d"]);
    expect(returnedDictKeys('    return {"k": 1, "j": 2}\n')).toEqual(["k", "j"]);
    expect(() => assignedDictKeys("    x = 1\n", "payload")).toThrow(/payload = \{\.\.\.\} not found/);
    expect(() => returnedDictKeys("    return 1\n")).toThrow(/return \{\.\.\.\} not found/);
    expect(() => dictKeysAt('{"a": 1', 0)).toThrow(/never closes/);
  });
  it("recognises only a code line building the audience from promotion.KIND", () => {
    expect(audienceUsesPromotionKind('    audience = f"{promotion.KIND}:{x}"\n')).toBe(true);
    expect(audienceUsesPromotionKind('    audience = f"other:{x}"\n')).toBe(false);
    expect(audienceUsesPromotionKind('    # audience = f"{promotion.KIND}:{x}"\n')).toBe(false);
  });
});

// ── the live comparand ──────────────────────────────────────────────────────────────────────

function findIagent(): string | null {
  const env = (process.env.CORTEX_PRODUCER_ROOT || "").trim();
  if (env && existsSync(path.join(env, "src/iagent/gateway.py"))) return path.join(env, "src/iagent");
  for (const name of ["invincible-agent", "ia-01"]) {
    const p = path.join(__dirname, "../../..", name, "src/iagent");
    if (existsSync(path.join(p, "gateway.py"))) return p;
  }
  return null;
}
const IAGENT = findIagent();
const REF = (process.env.CORTEX_PRODUCER_REF || "").trim();
const AT = REF ? `producer at ${REF.slice(0, 7)}` : "producer (CORTEX_PRODUCER_REF unset)";

describe.skipIf(IAGENT === null)("the empty-confirm card against the producer's code", () => {
  const gateway = () => readFileSync(path.join(IAGENT!, "gateway.py"), "utf8");
  const promotion = () => readFileSync(path.join(IAGENT!, "promotion.py"), "utf8");
  const fileBody = () => pyFunctionBody(gateway(), "_file_or_find_empty_confirm_task");

  it("(a) ADD_MISSED_PART_NOT_BUILT_MESSAGE is gateway.py's _ADD_MISSED_PART_MSG", () => {
    expect(ADD_MISSED_PART_NOT_BUILT_MESSAGE, AT).toBe(pyStringConstant(gateway(), "_ADD_MISSED_PART_MSG"));
  });

  it("(b) EMPTY_CONFIRM_KIND is gateway.py's EMPTY_CONFIRM_KIND", () => {
    expect(EMPTY_CONFIRM_KIND, AT).toBe(pyStringConstant(gateway(), "EMPTY_CONFIRM_KIND"));
  });

  it("(c) every payload key the reader consumes is a key the producer writes", () => {
    const written = assignedDictKeys(fileBody(), "payload");
    for (const k of ["review_shape", "ingest_id", "attempt", "account", "add_missed_part", "forced_text_fallback", "content_kind"]) {
      expect(written, `${AT}: the reader consumes payload.${k}, which the producer no longer writes`).toContain(k);
    }
  });

  it("(c) every account key the reader consumes is a key _empty_account returns", () => {
    const written = returnedDictKeys(pyFunctionBody(gateway(), "_empty_account"));
    for (const k of ["n_tables", "grid_no_parts_col", "grid_rows_emitted", "review_reasons", "why"]) {
      expect(written, `${AT}: the reader consumes account.${k}, which _empty_account no longer returns`).toContain(k);
    }
  });

  it("(c) a payload built from the producer's OWN keys reads back through the reader", () => {
    const g = gateway();
    const values: Record<string, unknown> = {
      review_shape: "empty", ingest_id: "sha256:ab", attempt: 2, add_missed_part: true, forced_text_fallback: true, content_kind: "pcn",
    };
    const acct: Record<string, unknown> = { n_tables: 3, grid_no_parts_col: 1, grid_rows_emitted: 0, review_reasons: ["r"], why: "zero_rows" };
    const payload: Record<string, unknown> = { account: Object.fromEntries(returnedDictKeys(pyFunctionBody(g, "_empty_account")).map((k) => [k, acct[k] ?? "x"])) };
    for (const k of assignedDictKeys(fileBody(), "payload")) if (k in values) payload[k] = values[k];
    expect(readEmptyConfirmTask(EMPTY_CONFIRM_KIND, payload), AT).toEqual({
      ingestId: "sha256:ab", attempt: 2, addMissedPart: true, forcedTextFallback: true, contentKind: "pcn",
      account: { nTables: 3, gridNoPartsCol: 1, gridRowsEmitted: 0, reviewReasons: ["r"], why: "zero_rows" },
    });
  });

  it("(d) the producer files the task under f\"{promotion.KIND}:<DOMAIN>\"", () => {
    expect(audienceUsesPromotionKind(fileBody()), `${AT}: _file_or_find_empty_confirm_task no longer builds its audience from promotion.KIND`).toBe(true);
  });

  it("(d) AUDIENCE_POOL_OF.document_empty_confirm is promotion.py's KIND", () => {
    expect(AUDIENCE_POOL_OF[EMPTY_CONFIRM_KIND], AT).toBe(pyStringConstant(promotion(), "KIND"));
  });
});

describe("the seal RAN, or says so", () => {
  it("resolved a producer checkout", () => {
    expect(
      IAGENT,
      "no invincible-agent checkout found (set CORTEX_PRODUCER_ROOT): this seal SKIPPED ENTIRELY and verified nothing.",
    ).not.toBeNull();
  });
});
