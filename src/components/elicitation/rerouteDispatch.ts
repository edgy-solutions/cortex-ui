import { BOUND_SLOTS_FIELD, toBoundSlots } from "@/api/boundSlots";
import { BIND, type AskCardPayload, type Reroute } from "./Elicitation.contract";

/**
 * Where an answered ask goes. BOTH PATHS REACH THE SERVER NOW.
 *
 * ── RESPEAK: WORDS RE-ENTER AS WORDS ──────────────────────────────────────────────────────
 *
 * The phrase the producer composes goes to the ordinary send path and is filled and resolved
 * like any question. Nothing rides beside it, because there is no pick to carry.
 *
 * ── BIND: THE PICK RIDES BESIDE THE PHRASE, NEVER INSIDE IT ───────────────────────────────
 *
 * The message is the ORIGINAL `sub_query`, unmodified, and the choice travels in its own
 * field. Encoding it into the phrase — `"<sub_query> (<slot>: C7)"` — would send it back
 * through the filler and the resolver, and re-parsing is the one thing this path exists to
 * forbid: a menu whose selections get re-interpreted is a menu whose selections are
 * suggestions. That is why `resolve_ask` returns an empty query on BIND, and why this does
 * not compose one.
 *
 * ── THE FIELD NAME IS THE WHOLE RISK ──────────────────────────────────────────────────────
 *
 * The gateway reads `request.bound_slots`. A body posting `slots` — the name this module's own
 * `Reroute` type uses, mirroring the producer's Python — is NOT rejected: `bound_slots` parses
 * as None, the supervisor sees no pick, and the turn proceeds AS IF THE READER HAD NOT
 * ANSWERED. No 422, no log line, a wrong answer with nothing anywhere saying so. The rename
 * happens HERE, once, from a constant, and a test asserts the posted key against the name the
 * gateway model declares.
 *
 * ── WHAT IS STILL REFUSED, AND WHY THAT IS NOT A GAP ──────────────────────────────────────
 *
 * A slot the provider reported as `too_many` had NO MENU, so there is nothing a pick could
 * have been chosen from and `validate_bound_slots` refuses it as `no_menu` by design. Such an
 * ask carries no options, so this never sends one: the card renders a text field and the
 * answer takes the RESPEAK path, which is where an unvalidatable value belongs.
 */

export interface DispatchResult {
  /**
   * Present when the answer was valid but could not be carried. Shown to the reader.
   *
   * THERE IS NO `sent` FLAG BESIDE IT, and there was one until a mutation run showed nothing
   * read it: flipping it to `true` on the blocked path left every test green. An unconsumed
   * field that looks authoritative is the shape this codebase keeps filing against, so absence
   * of `blocked` IS the report that it went — one fact, one place.
   */
  blocked?: string;
}

/** The send seam. A pick is a SECOND ARGUMENT, never a phrase this function assembles. */
export type SendTurn = (query: string, boundSlots?: Record<string, string>) => void;

export function dispatchReroute(
  reroute: Reroute,
  ask: AskCardPayload,
  send: SendTurn,
): DispatchResult {
  if (reroute.action === BIND) {
    // A BIND with nothing to bind would post `{}` — which is not "no pick" but a CLAIM that a
    // menu was answered, against a server that branches on the field being absent.
    const bound = toBoundSlots(reroute.slots);
    if (Object.keys(bound).length === 0) {
      return { blocked: "That pick carried no slot to bind, so nothing was sent." };
    }
    // The original phrase, verbatim. See the header: composing one here would re-parse.
    send(ask.sub_query, bound);
    return {};
  }
  send(reroute.query);
  return {};
}

/** Re-exported so a test can assert the posted key without reaching past this module. */
export { BOUND_SLOTS_FIELD };
