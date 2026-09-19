/**
 * SOURCE_LEDGER — N sources, EVERY ONE ACCOUNTED FOR, each row a finding or a named absence,
 * each linking its own evidence.
 *
 * Structural, and the name is the claim rather than the mechanism: a ledger is the noun that
 * carries *every entry accounted for*. Its first consumers are a program brief and a cost lot
 * review; nothing here knows either word.
 *
 * ── THE PROPERTY THAT MAKES IT AN ARCHETYPE ───────────────────────────────────────────────
 *
 * A ROW IS EMITTED FOR EVERY SOURCE, WHATEVER HAPPENED TO IT. So "three sources, one of which
 * said nothing" is distinguishable from "two sources" — the silently-narrowed answer made
 * visible. Every other decision here follows from protecting that: a row this card cannot
 * classify is NAMED rather than dropped, because dropping it shortens the ledger and a shorter
 * ledger reads as a complete one.
 *
 * ── FIVE DISPOSITIONS, AND `unsummarised` IS NOT A HOLE ───────────────────────────────────
 *
 *   finding       a verdict was emitted                     -> the verdict, with its evidence
 *   unsummarised  content exists, verdict absent            -> a FINDING row, evidence linked,
 *                                                              NEVER a hole. R-073: the caller
 *                                                              IS entitled and the verb DID run
 *   empty         the verb answered and legitimately has
 *                 nothing                                   -> said, evidence still linked
 *   unentitled    the caller may not invoke it              -> a hole
 *   unavailable   failed, timed out, or unreachable         -> a hole
 *
 * Read from the producer's `rows.py` — one vocabulary, two repos, and the terms mean here what
 * they mean there.
 *
 * ⛔ REACHABILITY IS A PROPERTY OF THE PRODUCER, NOT OF THIS CARD. A graph whose `refusal`
 * clause is `fail` RAISES on a refused inner call, so it never returns a row for one: the two
 * hole terms are UNREACHABLE for it, by contract rather than by omission. A ledger with no holes
 * is therefore an ordinary ledger for such a producer, and a card treating a hole-free ledger as
 * suspicious — or drawing a "no absences" affordance keyed on the archetype rather than the
 * payload — is wrong on every cost review. Nothing in this card may key on the SET of
 * dispositions present.
 *
 * ── AN UNKNOWN DISPOSITION IS NAMED, NEVER DROPPED AND NEVER GUESSED ──────────────────────
 *
 * The vocabulary is declared in two repos and will gain a term before both agree. A row whose
 * disposition this card does not know is kept and marked: dropping it breaks the one property
 * above, and guessing it a finding or a hole asserts a decision from not recognising a word —
 * the failure the `disposal` split and `NamedHole` both refuse.
 */

export const LEDGER_DISPOSITIONS = [
  "finding",
  "unsummarised",
  "empty",
  "unentitled",
  "unavailable",
] as const;
export type LedgerDisposition = (typeof LEDGER_DISPOSITIONS)[number];

/** The two the producer's `holes_from` projects. Mirrors `rows.py`'s `HOLE_DISPOSITIONS`. */
export const LEDGER_HOLE_DISPOSITIONS = ["unentitled", "unavailable"] as const;

export interface LedgerRow {
  /** The source verb. `row` on the wire — renamed here because "row.row" reads as a mistake. */
  source: string;
  label: string;
  /** The producer's term, or the raw string when it is one this card does not know. */
  disposition: string;
  /** The hop artifact, or null. PRESENT EVEN WHEN NULL on the wire — a refused verb HAS none. */
  artifact: string | null;
  /** The payload's own verdict. Null exactly when the disposition is not `finding`. */
  verdict: string | null;
  /** Why, on the hole dispositions. */
  reason: string | null;
}

export interface SourceLedgerPayload {
  rows: LedgerRow[];
  /** The producer's prose. Kept because BRIEF replaced a document and losing it is a regression. */
  summary: string;
}

export const SOURCE_LEDGER_REFUSAL_REASONS = [
  "this is not a source ledger",
  "the ledger has no rows",
] as const;
export type SourceLedgerRefusal = (typeof SOURCE_LEDGER_REFUSAL_REASONS)[number];

export const SOURCE_LEDGER_CONTRACT = {
  archetype: "SOURCE_LEDGER",
  component: "SourceLedger",
  layout: "full-width",
  /** Not a live view: a ledger reports one dispatch and does not recompute. */
  recomputes: false,
  fields: {
    /** One entry per source, whatever happened to it. */
    rows: { encoding: "array", parsesTo: "array-of-objects", required: true },
    /** The producer's prose account, rendered above the entries. */
    summary: { type: "string", required: false },
  },
  refusalReasons: SOURCE_LEDGER_REFUSAL_REASONS,
} as const;

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}
const str = (v: unknown): string => (typeof v === "string" ? v.trim() : "");
const strOrNull = (v: unknown): string | null => {
  const t = str(v);
  return t.length > 0 ? t : null;
};

/** Whether this card knows the term. Not whether the term is valid — the producer decides that. */
export function isKnownDisposition(d: string): d is LedgerDisposition {
  return (LEDGER_DISPOSITIONS as readonly string[]).includes(d);
}

/** Whether a KNOWN disposition is one of the producer's hole terms. */
export function isHole(d: string): boolean {
  return (LEDGER_HOLE_DISPOSITIONS as readonly string[]).includes(d);
}

/**
 * Read one entry, or null when it names no source.
 *
 * A row naming nothing cannot be accounted for — there is no source to attribute it to — so it
 * is the ONE case dropped. Everything else, including a disposition this card does not know, is
 * kept: the ledger's property is that every source appears, and a reader cannot be told about
 * an entry that identifies nothing.
 */
function readRow(v: unknown): LedgerRow | null {
  if (!isRecord(v)) return null;
  const source = str(v.row) || str(v.source);
  if (!source) return null;
  return {
    source,
    label: str(v.label) || source,
    disposition: str(v.disposition),
    artifact: strOrNull(v.artifact),
    verdict: strOrNull(v.verdict),
    reason: strOrNull(v.reason),
  };
}

/**
 * Read a ledger, or refuse it.
 *
 * ⛔ AN EMPTY `rows` IS REFUSED, and that is not the same as a ledger of `empty` rows. A ledger
 * with no entries accounts for nothing — it cannot say which sources were consulted, so it
 * cannot support the one claim this archetype makes. A card drawing it would show a heading and
 * a blank space, which reads as "nothing was wrong".
 */
export function validateSourceLedger(
  comp: unknown,
): { kind: "ok"; ledger: SourceLedgerPayload } | { kind: "empty"; reason: SourceLedgerRefusal } {
  if (!isRecord(comp)) return { kind: "empty", reason: "this is not a source ledger" };
  const raw = Array.isArray(comp.rows) ? comp.rows : null;
  if (raw === null) return { kind: "empty", reason: "this is not a source ledger" };
  const rows = raw.map(readRow).filter((r): r is LedgerRow => r !== null);
  if (rows.length === 0) return { kind: "empty", reason: "the ledger has no rows" };
  return { kind: "ok", ledger: { rows, summary: str(comp.summary) } };
}
