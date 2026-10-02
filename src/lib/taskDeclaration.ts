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

/**
 * Read `GET /task_kinds`'s response ENVELOPE — not the by-hand array forms this reader used to
 * accept.
 *
 * `kinds` is an OBJECT keyed by kind name (`gateway.py` ~line 840, identical at deployed fleet
 * `700f0bc4` and origin/master). `composed: false` (with `kinds: {}`) means the registry could
 * not be composed — per the docstring, that is NOT an empty menu. So `composed:false`, a missing
 * `composed` flag, and a `kinds` that is not a plain record all have to read as UNREACHABLE
 * (null), never as an empty menu — the same reason `declared: false` has to be READ rather than
 * guessed in `readTaskDeclaration` above.
 *
 * Returns the VALUES of `kinds` whose own `kind` field agrees with the key it is filed under. An
 * entry whose inner `kind` disagrees with its key is DROPPED, not trusted under either name: a
 * declaration filed under another species' name is not that species' declaration.
 *
 * The OLD array forms (`fetchTaskKinds` used to accept a bare array, or `{kinds: [...]}`) are
 * gone on purpose. Nothing serves them, and an accepted shape nobody sends is a hole: the live
 * wire never matched either form, which is why no reason-required gate had ever fired.
 */
export function readTaskKindsResponse(data: unknown): unknown[] | null {
  if (!isRecord(data)) return null;
  if (data.composed !== true) return null;
  if (!isRecord(data.kinds)) return null;
  const out: unknown[] = [];
  for (const [key, value] of Object.entries(data.kinds)) {
    if (!isRecord(value)) continue;
    if (str(value.kind) !== key) continue;
    out.push(value);
  }
  return out;
}

/**
 * Does this task's AUDIENCE contradict its KIND?
 *
 * Audience forms seen on the producer: `<task_kind>:<compartment>` for risk acceptance,
 * `access_grant:<domain>` for access_request, `promotion:<X>` in the ingest mock for
 * document_promotion. The prefix before the first `:` is a task-kind name ONLY for the first
 * form — `access_grant` and `promotion` are not kinds, and treating every prefix as one would
 * make every access_request and document_promotion row misreport itself.
 *
 * So a prefix only COUNTS as a claim when the served menu says it is a declared kind. That is
 * the ONLY thing that can tell `risk_acceptance_medium` (a real kind, so the row above genuinely
 * contradicts) apart from `access_grant` or `stewards` (not kinds, so no claim is being made).
 * `isDeclaredKind` is the caller's `declarationFor(prefix)?.declared === true`, which is why this
 * stays pure here and takes the predicate rather than the store.
 *
 * WHILE THE MENU IS NOT LOADED, `isDeclaredKind` is false for everything a caller can reasonably
 * supply, so this reports no contradiction at all during that window — the check is only as live
 * as the menu, which is why the response reader above has to land first.
 */
export function audienceKindContradiction(
  audience: string,
  kind: string,
  isDeclaredKind: (k: string) => boolean,
): { audienceKind: string; taskKind: string } | null {
  const i = audience.indexOf(":");
  if (i < 0) return null;
  const prefix = audience.slice(0, i);
  if (!prefix || prefix === kind) return null;
  if (!isDeclaredKind(prefix)) return null;
  return { audienceKind: prefix, taskKind: kind };
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
