/**
 * Normalize a HumanTask's `payload` across its two producers.
 *
 * The projection column is `jsonb`, and the two paths that read it disagree: Electric's
 * replication stream delivers it as a JSON **string**, while the REST seed (`/me/human_tasks`)
 * returns it already parsed. Left unnormalized, the triage card's warnings render on one path
 * and silently vanish on the other — which presents as an intermittent UI bug rather than a
 * shape mismatch, and is the resolution-discard pattern arriving at a second producer.
 *
 * Never throws: a malformed payload degrades to `null` (the card simply shows no warnings)
 * rather than taking down the task list. The payload is clearance-safe metadata, not the
 * task's meaning — the title and summary carry that.
 */
export function parseTaskPayload(raw: unknown): Record<string, unknown> | null {
  if (raw == null) return null;
  if (typeof raw === "object") return raw as Record<string, unknown>;
  if (typeof raw === "string") {
    const s = raw.trim();
    if (!s) return null;
    try {
      const parsed = JSON.parse(s);
      return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : null;
    } catch {
      return null;
    }
  }
  return null;
}
