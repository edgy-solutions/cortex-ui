/**
 * Species-honest rendering of a task's requester (`requested_by` / `requestedBy`).
 *
 * A requester id is either a HUMAN (email in sandbox, employee-id at work) or a SERVICE
 * identity in `svc:<name>` form (e.g. `svc:review-starter`, the extraction→review sensor —
 * the first non-human actor). The UI must not pretend a pipeline-initiated task was started
 * by a person: a service requester renders "<name> (automated)".
 *
 * This keys off the `svc:` PREFIX as a display RULE — never a hardcoded name check — so the
 * dispatcher and every future service identity render correctly for free (generic-at-birth for
 * identities). The `svc:` format is the mint-contract's service-id convention; this is where it
 * earns its keep. See invincible-agent docs/plans/identity-mint-contract.md.
 */
const SERVICE_PREFIX = "svc:";
/**
 * A HUMAN principal written in `human:<id>` form. The producer's promotion record stamps
 * `promoted_by` / `reviewed_by` as `human:${acted_by}` (invincible-agent src/iagent/promotion.py).
 * The prefix is the record's species tag, not the person's name, so the reader is shown the id
 * alone (Chris, 2026-11-16: drop the "human:" prefix from the promoted-by chip). Keyed on the
 * PREFIX, like `svc:`, so every writer of the form renders the same. A `data-*` attribute keeps
 * the raw id.
 */
const HUMAN_PREFIX = "human:";

export function isServiceIdentity(id: string | null | undefined): boolean {
  return typeof id === "string" && id.startsWith(SERVICE_PREFIX);
}

/** Human-readable requester. Services -> "<name> (automated)"; humans -> the id, without a `human:` species prefix. */
export function formatRequestedBy(id: string | null | undefined): string {
  if (!id) return "";
  if (isServiceIdentity(id)) {
    const name = id.slice(SERVICE_PREFIX.length) || id;
    return `${name} (automated)`;
  }
  if (id.startsWith(HUMAN_PREFIX)) return id.slice(HUMAN_PREFIX.length) || id;
  return id;
}
