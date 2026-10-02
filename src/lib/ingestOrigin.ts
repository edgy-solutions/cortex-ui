/**
 * ingestOrigin — CORTEX-PROPOSED. Nothing on the real wire sets an ingest row's origin today.
 *
 * Architect ruling 2026-10-02 "ORIGIN, not audience": an origin resolver matches an extracted
 * identity against systems of record; origin is `{owner_domain, program, obtained_via}`; a miss
 * is "origin unresolved, visible to the dropper only". The schema this needs is UNWRITTEN —
 * `GET /ingest/{id}/status` (invincible-agent origin/master 41647787) returns `ingest_id, stage,
 * detail, duplicate, kind, sha256, created_at, updated_at` and NOTHING ELSE. No steward task
 * kind, no dispute route, no unresolved flag on artifacts exist on that producer yet.
 *
 * So every shape below is this client's own proposal, not a measured wire. The one rule every
 * reader here must keep: the field's ABSENCE (today's real server) is a THIRD state, distinct
 * from "unresolved" — absent means "the server reports no origin at all", and must never be
 * drawn as unresolved, nor as resolved. Conflating "no opinion" with "resolver tried and missed"
 * would tell a dropper their document is under steward review when no steward has ever heard of
 * it.
 */

export interface OriginEvidence {
  /** e.g. "title_block" — an opaque source key. The DISPLAY label for it is never hardcoded
   *  here; see `evidence_label` on `IngestOrigin` for the text a reader actually sees. */
  source: string;
  excerpt?: string | null;
}

export interface IngestOrigin {
  status: "resolved" | "unresolved";
  /** Display text, e.g. "engineering drawing". Never a code this client maps. */
  document_type?: string | null;
  owner_domain?: string | null;
  /** e.g. "NP-MERIDIAN". */
  program?: string | null;
  /** What the resolver read, to be shown to a steward with more than the bare verdict. */
  evidence?: OriginEvidence[];
  /** Display text for the evidence, e.g. "from the title block". */
  evidence_label?: string | null;
  /** Set when a steward task exists for this origin already. */
  steward_task_id?: string | null;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function isNonEmptyString(v: unknown): v is string {
  return typeof v === "string" && v.length > 0;
}

const FAILED = Symbol("ingest-origin-field-malformed");

/**
 * A `string | null` field that may also be simply ABSENT. Three outcomes: the field is absent
 * (returns `undefined`, so the caller omits the key entirely), the field is `null` or a string
 * (returns it as-is), or the field is present with the wrong type (returns the `FAILED` sentinel
 * so the caller refuses the whole object — a present-but-wrong-typed field is malformed, not
 * merely absent, and this reader never guesses at what it meant).
 */
function readOptionalString(v: unknown): string | null | undefined | typeof FAILED {
  if (v === undefined) return undefined;
  if (v === null) return null;
  return typeof v === "string" ? v : FAILED;
}

function readEvidence(raw: unknown): OriginEvidence[] | undefined | typeof FAILED {
  if (raw === undefined) return undefined;
  if (!Array.isArray(raw)) return FAILED;
  const out: OriginEvidence[] = [];
  for (const item of raw) {
    if (!isRecord(item) || !isNonEmptyString(item.source)) return FAILED; // malformed — refuse the whole array
    const excerpt = item.excerpt;
    if (excerpt !== undefined && excerpt !== null && typeof excerpt !== "string") return FAILED;
    out.push({
      source: item.source,
      ...(excerpt === undefined ? {} : { excerpt: excerpt as string | null }),
    });
  }
  return out;
}

/**
 * Reads a status row's `origin` field. `null` when absent or malformed — NEVER a default
 * `{status: "unresolved"}`. Absent is its own, third state (see header); a malformed `origin`
 * is refused the same way every other wire reader in this repo refuses rather than guesses.
 */
export function readIngestOrigin(raw: unknown): IngestOrigin | null {
  if (raw === null || raw === undefined) return null;
  if (!isRecord(raw)) return null;
  if (raw.status !== "resolved" && raw.status !== "unresolved") return null;

  const document_type = readOptionalString(raw.document_type);
  const owner_domain = readOptionalString(raw.owner_domain);
  const program = readOptionalString(raw.program);
  const evidence_label = readOptionalString(raw.evidence_label);
  const steward_task_id = readOptionalString(raw.steward_task_id);
  const evidence = readEvidence(raw.evidence);
  if (
    document_type === FAILED ||
    owner_domain === FAILED ||
    program === FAILED ||
    evidence_label === FAILED ||
    steward_task_id === FAILED ||
    evidence === FAILED
  ) {
    return null;
  }

  return {
    status: raw.status,
    ...(document_type === undefined ? {} : { document_type }),
    ...(owner_domain === undefined ? {} : { owner_domain }),
    ...(program === undefined ? {} : { program }),
    ...(evidence === undefined ? {} : { evidence }),
    ...(evidence_label === undefined ? {} : { evidence_label }),
    ...(steward_task_id === undefined ? {} : { steward_task_id }),
  };
}

/**
 * The display line. Resolved: joins whichever of [document_type, program, evidence_label] are
 * present with ", " — NEVER fabricates a missing part (no "unknown"). All three absent on a
 * resolved origin draws "origin resolved" rather than an empty string. Unresolved is always the
 * same fixed sentence, naming no field that is not itself part of the sentence.
 */
export function originSummary(o: IngestOrigin): string {
  if (o.status === "unresolved") return "origin unresolved — awaiting steward";
  const parts = [o.document_type, o.program, o.evidence_label].filter(
    (p): p is string => typeof p === "string" && p.length > 0,
  );
  return parts.length > 0 ? parts.join(", ") : "origin resolved";
}

/** True iff `component.origin?.status === "unresolved"` — malformed/absent is never true. */
export function readComponentOriginUnresolved(component: unknown): boolean {
  if (!isRecord(component)) return false;
  const origin = readIngestOrigin(component.origin);
  return origin?.status === "unresolved";
}
