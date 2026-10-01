/**
 * THE KIND/STATUS PARITY SEAL — cortex's closed `INGEST_KINDS`/`INGEST_STAGES`/
 * `INGEST_DUPLICATE_STATUS` against `ingest_status.py`'s own `KINDS`/`STAGES`/`DUPLICATE`.
 * Every arm below reads `src/iagent/ingest_status.py` — none of them reads `gateway.py`.
 *
 * ⚠ RUN WITH `npm run test`, NEVER BARE `npx vitest run` — same false-red reason as
 * `src/lib/taskKindParity.test.tsx`'s header: under vitest 4 a bare invocation loads none of
 * this project's config, and `describe.skipIf` below evaluates against an undefined config, so
 * the file fails to collect rather than running or being skipped cleanly.
 *
 * ── PARSE WHAT THE CODE IS FORCED TO SPELL, NOT A GREP FOR "pdf" ──────────────────────────
 *
 * `ingest_status.py` writes its closed sets as the Python idiom this repo has already met in
 * `OBTAINED_VIA`/`INGEST_STAGES`: `NAME, NAME = "value", "value"` on one line, then
 * `TUPLE = (NAME, NAME)` on another, in the TUPLE's own order — not necessarily the assignment's.
 * A parser that read the assignment line's value order and called it done would be blind to the
 * tuple later being reordered independently (the two lines are edited separately; nothing forces
 * them to stay in step). `resolveTuple` below resolves each name in the TUPLE's order through a
 * separate lookup into the assignment map, which is the only reading that is forced to notice a
 * reorder. `resolveTuple`'s own unit tests, further down, fire exactly that drift on two small
 * fixture strings — one clean, one with the tuple's order deliberately unequal to the
 * assignment's — so the parser's name-resolving behaviour is proven before it is ever pointed at
 * the real file.
 */
import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { INGEST_KINDS, INGEST_STAGES, INGEST_DUPLICATE_STATUS } from "./ingestWire";

// ── the parser ──────────────────────────────────────────────────────────────────────────────

/** Collapses a `NAME = (\n    "a", "b")`-style multi-line tuple onto one line, so the line-based
 *  reader below does not need to track paren state across newlines. Parens here never nest. */
function flattenParens(src: string): string {
  return src.replace(/\(([^()]*)\)/gs, (_m, inner: string) => `(${inner.replace(/\s+/g, " ").trim()})`);
}

/** `NAME[, NAME...] = "value"[, "value"...]` lines → a map from each name to its own string
 *  value. Lines of any other shape (imports, function calls, `ALL_STATUSES = STATUSES + (...)`)
 *  are silently not-matched here, which is safe because this map is only ever consulted by name
 *  — an unresolved name throws in `resolveTuple`, it does not fall back to a wrong value. */
function parseNameAssignments(src: string): Map<string, string> {
  const out = new Map<string, string>();
  for (const raw of flattenParens(src).split(/\r?\n/)) {
    const line = raw.trim();
    const m = /^([A-Z][A-Z0-9_]*(?:\s*,\s*[A-Z][A-Z0-9_]*)*)\s*=\s*\(?\s*((?:"[^"]*"\s*,?\s*)+)\)?\s*$/.exec(
      line,
    );
    if (!m) continue;
    const names = m[1].split(",").map((s) => s.trim());
    const values = [...m[2].matchAll(/"([^"]*)"/g)].map((v) => v[1]);
    if (names.length !== values.length) continue;
    names.forEach((n, i) => out.set(n, values[i]));
  }
  return out;
}

/** `VARNAME = (NAME, NAME, ...)` — the tuple's own NAME order (not string values). */
function parseNameTuple(src: string, varName: string): string[] {
  const pattern = new RegExp(
    `^${varName}\\s*=\\s*\\(\\s*([A-Z][A-Z0-9_]*(?:\\s*,\\s*[A-Z][A-Z0-9_]*)*)\\s*\\)\\s*$`,
  );
  for (const raw of flattenParens(src).split(/\r?\n/)) {
    const m = pattern.exec(raw.trim());
    if (m) return m[1].split(",").map((s) => s.trim());
  }
  throw new Error(`${varName}: no "${varName} = (NAME, ...)" line found`);
}

/**
 * Resolves `varName`'s tuple to its string values, name by name, IN THE TUPLE'S OWN ORDER —
 * never by reading the assignment line's value order directly. This is the property mutant (c)
 * (see the coordinator's mutation list) removes: a parser that instead returned
 * `[...assignments.values()]` would read the ASSIGNMENT's order and silently ignore what the
 * tuple itself says, which is exactly the DRIFTED fixture below.
 */
function resolveTuple(src: string, varName: string): string[] {
  const assignments = parseNameAssignments(src);
  const names = parseNameTuple(src, varName);
  return names.map((n) => {
    if (!assignments.has(n)) throw new Error(`${varName}: no assignment resolves ${n}`);
    return assignments.get(n)!;
  });
}

// ── parser unit tests — fixtures, not the live file, and always run (no skip) ─────────────

describe("resolveTuple — unit-tested on fixtures before it ever touches the real file", () => {
  const CLEAN = 'PDF, CAD = "pdf", "cad"\nKINDS = (PDF, CAD)\n';
  // The TUPLE's order (CAD, PDF) deliberately disagrees with the ASSIGNMENT's order (PDF, CAD).
  const DRIFTED = 'PDF, CAD = "pdf", "cad"\nKINDS = (CAD, PDF)\n';

  it("resolves a clean tuple by name", () => {
    expect(resolveTuple(CLEAN, "KINDS")).toEqual(["pdf", "cad"]);
  });

  it("the drift fixture actually diverges from its own assignment order — the control", () => {
    expect(resolveTuple(DRIFTED, "KINDS")).not.toEqual(["pdf", "cad"]);
  });

  it("resolves a DRIFTED tuple in the TUPLE's own order, not the assignment's", () => {
    expect(resolveTuple(DRIFTED, "KINDS")).toEqual(["cad", "pdf"]);
  });

  it("throws, rather than silently omits, a tuple name with no assignment", () => {
    expect(() => resolveTuple("KINDS = (PDF, CAD)", "KINDS")).toThrow(/no assignment resolves/);
  });
});

// ── the live comparand ──────────────────────────────────────────────────────────────────────

const CANDIDATE_ROOTS = ["invincible-agent", "ia-01"];

interface Producer {
  root: string;
  file: string;
}

function resolveProducers(): Producer[] {
  const found: Producer[] = [];
  for (const name of CANDIDATE_ROOTS) {
    const file = path.join(__dirname, "../../..", name, "src/iagent/ingest_status.py");
    if (existsSync(file)) found.push({ root: name, file });
  }
  return found;
}

const PRODUCERS = resolveProducers();
const HAVE_PRODUCER = PRODUCERS.length > 0;
const PRODUCER_REF = (process.env.CORTEX_PRODUCER_REF || "").trim();
const PRODUCER_AT = PRODUCER_REF
  ? `producer at ${PRODUCER_REF.slice(0, 7)}`
  : "producer at the local checkout (UNPINNED — this is CI-pinned only)";

describe.skipIf(!HAVE_PRODUCER)(
  "INGEST_KINDS / INGEST_STAGES / INGEST_DUPLICATE_STATUS against ingest_status.py",
  () => {
    const src = () => readFileSync(PRODUCERS[0].file, "utf8");

    it("INGEST_KINDS matches KINDS, resolved by name", () => {
      expect([...INGEST_KINDS], PRODUCER_AT).toEqual(resolveTuple(src(), "KINDS"));
    });

    it("INGEST_STAGES matches STAGES, resolved by name", () => {
      expect([...INGEST_STAGES], PRODUCER_AT).toEqual(resolveTuple(src(), "STAGES"));
    });

    it("INGEST_DUPLICATE_STATUS matches DUPLICATE", () => {
      const assignments = parseNameAssignments(src());
      expect(assignments.get("DUPLICATE"), PRODUCER_AT).toBe(INGEST_DUPLICATE_STATUS);
    });
  },
);

describe("the seal RAN, or says so", () => {
  it("resolved a producer checkout", () => {
    expect(
      PRODUCERS.length,
      `no producer checkout found under any of ${CANDIDATE_ROOTS.join(", ")} — this seal ` +
        `SKIPPED ENTIRELY and verified nothing.`,
    ).toBeGreaterThan(0);
  });
});
