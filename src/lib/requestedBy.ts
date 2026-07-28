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

export function isServiceIdentity(id: string | null | undefined): boolean {
  return typeof id === "string" && id.startsWith(SERVICE_PREFIX);
}

/** Human-readable requester. Services -> "<name> (automated)"; humans -> the id verbatim. */
export function formatRequestedBy(id: string | null | undefined): string {
  if (!id) return "";
  if (isServiceIdentity(id)) {
    const name = id.slice(SERVICE_PREFIX.length) || id;
    return `${name} (automated)`;
  }
  return id;
}
