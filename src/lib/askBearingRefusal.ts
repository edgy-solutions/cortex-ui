import { validateAsk, type AskCardPayload } from "@/components/elicitation/Elicitation.contract";

/**
 * A REFUSAL THAT CARRIES AN ASK, as one first-class message.
 *
 * `POST /canvas/seed` with a required shared slot unbound answers 409, and the body can say
 * WHICH value would unblock it. That is a question with candidates, not an error: drawn as red
 * text it hands a reader a dead end and keeps the way out to itself.
 *
 * ⛔ THE FIELD NAMES BELOW ARE THE PRODUCER'S, AT AN UNMERGED HEAD (invincible-agent #97,
 * 473f9c40). They are spelled HERE and nowhere else, each marked, so the day #97 changes shape
 * this is the one file that moves. The 409 body and the 200 body are undeclared in the pinned
 * snapshot, which is why this reader is defensive rather than typed off a schema.
 *
 * ABSENT IS ABSENT. No key is written with an `undefined` value: a key that is present and
 * undefined passes every containment check while the consumer takes its absent-value fallback.
 */

export interface RefusalPolicy {
  cell?: unknown;
  groups?: unknown;
  repair?: unknown;
  message: string;
}

/** The ask, normalised by `validateAsk`, plus the slot NAME to re-send the pick under. */
export type SeedAsk = AskCardPayload & { binding_slot: string };

export interface AskBearingRefusal {
  /** The line to show. The server already chose it (policy, else ask, else the plain refusal). */
  message: string;
  ask?: SeedAsk;
  /** The ask builder threw server-side; the exception TYPE, verbatim. */
  askUnavailable?: string;
  policy?: RefusalPolicy;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

const nonEmpty = (v: unknown): string => (typeof v === "string" ? v : "");

/**
 * The ask inside a refusal, through the same validation the chat path uses.
 *
 * Returns null when it is not an ask `validateAsk` accepts (an ABSTAIN is refused here on
 * purpose: nothing to choose from). `binding_slot` is NOT required here, because the chat-path
 * envelope has no re-send; `readAskBearingRefusal` adds that requirement itself.
 */
export function readEmbeddedAsk(raw: unknown): AskCardPayload | null {
  if (!isRecord(raw)) return null;
  const v = validateAsk(raw);
  return v.kind === "ok" ? v.ask : null;
}

export function readAskBearingRefusal(detail: unknown): AskBearingRefusal | null {
  if (!isRecord(detail)) return null;
  // #97 (unmerged, 473f9c40): detail.error
  if (detail.error !== "unbound_required_slot") return null;
  // #97 (unmerged, 473f9c40): detail.message
  const out: AskBearingRefusal = { message: nonEmpty(detail.message) };

  // #97 (unmerged, 473f9c40): detail.ask
  const rawAsk = detail.ask;
  if (isRecord(rawAsk)) {
    // #97 (unmerged, 473f9c40): ask.error === "ask_unavailable", ask.detail
    if (rawAsk.error === "ask_unavailable") {
      out.askUnavailable = nonEmpty(rawAsk.detail);
    } else {
      const ask = readEmbeddedAsk(rawAsk);
      // #97 (unmerged, 473f9c40): ask.binding_slot -- no slot name, nothing can be re-sent.
      const bindingSlot = nonEmpty(rawAsk.binding_slot);
      if (ask && bindingSlot !== "") out.ask = { ...ask, binding_slot: bindingSlot };
    }
    // #97 (unmerged, 473f9c40): ask.policy -- INSIDE ask, not top-level detail.
    const p = rawAsk.policy;
    if (isRecord(p)) {
      const policy: RefusalPolicy = { message: nonEmpty(p.message) };
      for (const k of ["cell", "groups", "repair"] as const) {
        if (p[k] !== undefined) policy[k] = p[k];
      }
      out.policy = policy;
      // The server already put the policy's line in `message`; hold the reader to it even if a
      // producer sent the two apart.
      if (out.policy.message !== "") out.message = out.policy.message;
    }
  }
  return out;
}

/** An axios error that is a seed 409 carrying an ask-bearing refusal, else null. */
export function readSeedConflict(err: unknown): AskBearingRefusal | null {
  if (!isRecord(err)) return null;
  const response = err.response;
  if (!isRecord(response) || response.status !== 409) return null;
  const data = response.data;
  if (!isRecord(data)) return null;
  // #97 (unmerged, 473f9c40): response.data.detail
  return readAskBearingRefusal(data.detail);
}
