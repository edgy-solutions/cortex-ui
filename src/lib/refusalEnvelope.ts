/**
 * THE REFUSAL ENVELOPE (invincible-agent PR #13, `lane/01-refusal`).
 *
 * When an engine refuses, the presenter emits the selected projected component with its own
 * payload key as an EMPTY array plus `refusal: {refused, outcome, reason, connector?, fn?}`.
 * A card handed `rows: []` draws its own empty state ("no contributors recorded"), which for
 * FRACAS reads as "no failures" -- worse than nothing. The envelope is keyed on the FIELD, not
 * on an archetype list, so any archetype that ever carries one is covered by default.
 */
export const REFUSAL_FIELD = "refusal";

export type RefusalEnvelope = {
  refused: true;
  outcome: string;
  reason: string | null;
  connector?: string;
  fn?: string;
};

export function readRefusalEnvelope(comp: unknown): RefusalEnvelope | null {
  if (comp === null || typeof comp !== "object") return null;
  const raw = (comp as Record<string, unknown>)[REFUSAL_FIELD];
  if (raw === undefined || raw === null) return null;

  // A PRESENT but malformed `refusal` still yields an envelope. A producer that put the key on
  // a component meant refusal; the failure mode we must never produce is falling through to the
  // card's empty state, which reads as "nothing happened". Malformed degrades to outcome
  // "refused", reason null -- loud and generic, never silent.
  const o: Record<string, unknown> =
    typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  const env: RefusalEnvelope = {
    refused: true,
    outcome: typeof o.outcome === "string" && o.outcome !== "" ? o.outcome : "refused",
    reason: typeof o.reason === "string" ? o.reason : null,
  };
  if (typeof o.connector === "string") env.connector = o.connector;
  if (typeof o.fn === "string") env.fn = o.fn;
  return env;
}
