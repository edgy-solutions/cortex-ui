/**
 * THE SERVED TASK-KIND DECLARATION — what a species renders as, and what it accepts.
 *
 * ── WHY THIS REPLACES A HARDCODED TABLE ───────────────────────────────────────────────────
 *
 * `taskKindRegistry` holds five kinds. The deployment declares eight, six of them APPROVAL_TASK,
 * and cortex had never heard of the six `risk_acceptance_*` species — so every one of them drew
 * "unknown species here" with no buttons. The default-deny was correct and it was also the ONLY
 * behaviour available, because the table was the only thing being asked.
 *
 * Worse, the table could not have been right even if extended: a High acceptance takes
 * `accepted` and the gate now REFUSES `approved`. An approval says the artifact is in order; an
 * acceptance says a named authority is taking the residual risk onto themselves. Two different
 * acts, and a card offering the generic verb offers one nobody can submit.
 *
 * ── THE TWO ORDERS ARE DIFFERENT ON PURPOSE, AND BOTH ARE HONOURED ────────────────────────
 *
 * `accepts` is a LIST IN THE DECLARATION'S ORDER. Button order is a contract now: the producer
 * emits `list(...)` and not `sorted(...)`, sealed against re-sorting, because re-sorting is the
 * defect the SDK's v0.8.0 ordering fix was cut to close and it arrives disguised as tidiness.
 * So this reader preserves order and never sorts.
 *
 * `reason_required` is SORTED, and that asymmetry is deliberate rather than an oversight: it is
 * a MEMBERSHIP TEST and a membership test has no order to carry. Read as a set here, so nothing
 * downstream can start depending on its sequence.
 *
 * ── `declared: false` IS A FACT, NOT AN ERROR ─────────────────────────────────────────────
 *
 * An undeclared kind returns `declared: false` with `accepts: []`. That is different from a
 * declared species that accepts nothing, and the card can now say WHICH — "this species takes
 * no decisions" versus "nothing has declared this species". Same split as absent-versus-refused,
 * and the same reason: the two have different repairs.
 */

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

const str = (v: unknown): string => (typeof v === "string" ? v.trim() : "");

/** Non-empty strings only, order preserved, duplicates dropped. */
function strList(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  const out: string[] = [];
  for (const x of v) {
    const s = str(x);
    if (s && !out.includes(s)) out.push(s);
  }
  return out;
}

export interface TaskDeclaration {
  kind: string;
  /** FALSE means nothing declared this species — not that it accepts nothing. */
  declared: boolean;
  archetype: string;
  badge: string;
  title: string;
  /** ORDER-BEARING. The declaration's own order; never sorted here. */
  accepts: string[];
  /** A MEMBERSHIP SET. Order is not meaningful and is not relied on. */
  reasonRequired: Set<string>;
}

/**
 * Read a served declaration, or null when there isn't one.
 *
 * NULL IS NOT `declared: false`. Null means this client has no declaration to read — the
 * endpoint has not rolled, the row predates it, the request failed. `declared: false` means the
 * server looked and there is no such species. A card that folded them together would report
 * "nothing has declared this" during a deploy window, which is a claim about the mesh made from
 * the absence of a field.
 */
export function readTaskDeclaration(raw: unknown): TaskDeclaration | null {
  if (!isRecord(raw)) return null;
  const kind = str(raw.kind);
  // A declaration that cannot name its own species is not one.
  if (!kind) return null;
  // `declared` is the field that distinguishes the two absences, so its ABSENCE is fatal to
  // reading the record: guessing `true` would claim a declaration nobody sent, and guessing
  // `false` would report a species as unknown on the strength of a missing boolean.
  if (typeof raw.declared !== "boolean") return null;

  const accepts = strList(raw.accepts);
  // INTERSECTED WITH `accepts`, and the producer does this too — their first version returned
  // the kind-blind global set, so a species accepting NOTHING came back requiring a reason for
  // two verbs nobody could submit. Re-applied here rather than trusted: this reader is the
  // thing that would render that field, and a reason box for an unsubmittable verb is the
  // failure. Their own subset seal was green throughout, because it reads the SOURCE and this
  // reads the PROJECTION — an invariant true of a source is not automatically true of every
  // projection of it.
  const reasonRequired = new Set(strList(raw.reason_required).filter((v) => accepts.includes(v)));

  return {
    kind,
    declared: raw.declared,
    archetype: str(raw.archetype),
    badge: str(raw.badge),
    title: str(raw.title),
    accepts,
    reasonRequired,
  };
}

/** A verb's button label — the producer's verb, made readable without being renamed. */
export function verbLabel(verb: string): string {
  // UNDERSCORES TO SPACES AND NOTHING ELSE. `returned_for_rework` reads as "returned for
  // rework"; it does not become "Send back" or "Rework". The verb is what gets POSTED and what
  // an archived decision record will carry, so a reader deciding must see the word they are
  // submitting. This is the same rule that keeps producer field names unprettified on the
  // ranking card.
  const s = verb.trim().replace(/_/g, " ");
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : verb;
}
