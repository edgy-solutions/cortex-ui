import type { AnsweredWith } from "@/api/types";
import { BOUND_SLOTS_FIELD, toBoundSlots } from "@/api/boundSlots";
import { SPOKEN_ANSWER_FIELD, SPOKEN_SLOT_FIELD, type SpokenAnswer } from "@/api/spokenAnswer";
import { BIND, type AskCardPayload, type Reroute } from "./Elicitation.contract";

/**
 * Where an answered ask goes. BOTH PATHS REACH THE SERVER NOW.
 *
 * ── RESPEAK: THE ANSWER RIDES BESIDE THE PHRASE TOO ───────────────────────────────────────
 *
 * The phrase is the ORIGINAL `sub_query`, byte-equal, and the typed answer travels in its own
 * pair of fields. It used to be concatenated — `"<sub_query> (<slot>: meridian)"` — and that
 * composed string reached the rail and was displayed as the user's question. Machine syntax on
 * top of a paraphrase, presented as something a person said.
 *
 * ITS FIELDS ARE NOT `bound_slots`, AND THE SEPARATION IS THE SAFETY. A RESPEAK ask had no
 * menu by construction, so `validate_bound_slots` refuses its slot as `no_menu` by design —
 * see the last section. The answer is unvalidatable words and travels under a name that says
 * so, where the server merges it into `spoken` and runs the ordinary resolution ladder.
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

/**
 * The send seam. An answer is an ARGUMENT, never a phrase this function assembles — a pick in
 * the second, typed words in the third. The two are separate parameters rather than one
 * because they are separate wire fields for a reason: a pick is validated against a recomputed
 * menu and unvalidatable words are refused by that same validator.
 */
export type SendTurn = (
  query: string,
  boundSlots?: Record<string, string>,
  spoken?: SpokenAnswer,
  /**
   * PRESENTATION ONLY, AND NEVER POSTED. The in-flight card needs the LABEL the reader clicked
   * — "Inventory Visibility" — and the wire carries the id it stands for. This is the only
   * place both are in hand, so it is built here and travels beside the send rather than
   * through it. A seal asserts no label reaches the request body.
   */
  answeredWith?: AnsweredWith,
  /**
   * FALSE MEANS THE TURN DID NOT GO OUT. The send path has guards of its own — an in-flight
   * turn is not queued — and they used to be invisible here, so this function reported success
   * by saying nothing while nothing had been sent. `void` is still accepted and still means
   * "went": a test double that reports nothing is not claiming a drop.
   */
) => boolean | void;

/**
 * Said when the send path refused the turn rather than this function. The reason belongs to the
 * seam that dropped it, so it is worded for a reader who is about to click again.
 */
const NOT_SENT = "Another turn is still in flight, so nothing was sent — try again once it settles.";

/**
 * Said when the ask carries no phrase to re-ask with. BOTH ARMS NEED IT, and one of them is not
 * obvious: `resolveAsk` sets a RESPEAK's `query` to `ask.sub_query` too, so a refusal-born ask
 * answered in WORDS lands in exactly the same empty turn as one answered from the menu.
 */
const NO_PHRASE =
  "This card arrived without the question it came from, so the answer had nothing to re-ask and nothing was sent.";

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
    // ── NO PHRASE, NO RE-ASK, AND IT IS REPORTED ─────────────────────────────────────────
    //
    // The RESPEAK arm below has always refused an empty payload rather than sending one blind.
    // THIS ARM GUARDED THE SLOTS AND NOT THE QUESTION, and the asymmetry was the defect: a BIND
    // sends `sub_query` as the turn's whole phrase, the send path drops an empty phrase, and
    // nothing said so. Measured at the producer 2026-09-26 — `_render_refusal_menu` and
    // `_render_abstain_menu` emit `slot`/`options`/`option_source`/`reason`/`message` and no
    // `sub_query` at all, so EVERY refusal-born ask took this path. Composing a phrase here is
    // the one thing this module forbids (see the header), so the honest move is to say so.
    if (!ask.sub_query.trim()) return { blocked: NO_PHRASE };
    // The original phrase, verbatim. See the header: composing one here would re-parse.
    const value = String(bound[ask.slot] ?? "");
    const chosen = ask.options.find((o) => o.value === value);
    const went = send(ask.sub_query, bound, undefined, {
      slot: ask.slot,
      // The label the reader actually saw. Falling back to the id is honest when the pick did
      // not come from this menu — it says the id, rather than inventing a name for it.
      label: chosen ? chosen.label : value,
      value,
    });
    if (went === false) return { blocked: NOT_SENT };
    return {};
  }
  // The phrase, verbatim, with the typed answer BESIDE it. A RESPEAK whose answer went missing
  // would re-ask the identical question with nothing added, which reads to the reader as their
  // answer having been ignored — so an empty one is reported rather than sent blind.
  if (!reroute.spoken_answer.trim()) {
    return { blocked: "That answer carried no words, so nothing was sent." };
  }
  // AND THE PHRASE, for the same reason the BIND arm checks it. The words are not the turn — they
  // ride BESIDE it — so words with no phrase is still an empty turn the send path will drop.
  if (!reroute.query.trim()) return { blocked: NO_PHRASE };
  const went = send(
    reroute.query,
    undefined,
    { slot: reroute.slot, answer: reroute.spoken_answer },
    // NO VALUE. The resolver has not run on typed words, so there is no id they stand for, and
    // a chip claiming one would assert a narrowing that has not happened.
    { slot: reroute.slot, label: reroute.spoken_answer.trim(), value: "" },
  );
  if (went === false) return { blocked: NOT_SENT };
  return {};
}

/** Re-exported so a test can assert the posted keys without reaching past this module. */
export { BOUND_SLOTS_FIELD, SPOKEN_SLOT_FIELD, SPOKEN_ANSWER_FIELD };
