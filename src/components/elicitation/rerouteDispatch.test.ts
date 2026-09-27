/**
 * The dispatch seam, at its own boundary.
 *
 * `dispatchReroute` is this module's public function, so its guards are reachable by any
 * caller and not only by a click on a rendered button. The empty-pick branch below is the one
 * a mutation run found blind: nothing exercised it, because the card cannot produce it — and
 * "the current caller happens not to reach it" is not the same as "it is unreachable".
 */
import { describe, it, expect, vi } from "vitest";
import { dispatchReroute } from "./rerouteDispatch";
import { BIND, RESPEAK, type AskCardPayload, type Reroute } from "./Elicitation.contract";

const ask = (over: Partial<AskCardPayload> = {}): AskCardPayload => ({
  slot: "capability_id",
  options: [{ value: "C1", label: "Data Governance" }],
  option_source: "enumeration",
  free_text_reason: null,
  spoken: "",
  found: "",
  sub_query: "what is the capability path",
  accepted_slots: {},
  message: "",
  reason: "",
  truncated_from: 0,
  total_count: 0,
  ...over,
});

const bind = (slots: Record<string, unknown>): Reroute => ({
  action: BIND,
  slots,
  query: "",
  slot: "capability_id",
  spoken_answer: "",
});

describe("a BIND with nothing to bind is refused, not posted", () => {
  it("sends nothing when the merged slots are empty", () => {
    // `{bound_slots: {}}` is a CLAIM that a menu was answered. The server branches on the
    // field being absent and validates whatever it finds against a recomputed menu, so an
    // empty claim is a refusal waiting to happen with the reader's click behind it.
    const send = vi.fn();
    const result = dispatchReroute(bind({}), ask(), send);
    expect(send).not.toHaveBeenCalled();
    expect(result.blocked).toMatch(/no slot to bind/);
  });

  it("sends nothing when every slot carried a null", () => {
    // The same case arriving through the coercion rather than through an empty literal.
    const send = vi.fn();
    const result = dispatchReroute(bind({ capability_id: null }), ask(), send);
    expect(send).not.toHaveBeenCalled();
    expect(result.blocked).toBeTruthy();
  });

  it("DOES send when there is a real pick, so the two above are not a dead path", () => {
    // Red-proofs the refusals: a function that blocked everything would pass them both.
    const send = vi.fn();
    const result = dispatchReroute(bind({ capability_id: "C1" }), ask(), send);
    expect(result.blocked).toBeUndefined();
    // The fourth argument is PRESENTATION ONLY — the label the reader clicked, for the
    // in-flight card. It travels beside the send rather than through it, and the seal that it
    // never reaches the request body is in `boundSlots.test.ts`.
    expect(send).toHaveBeenCalledWith(
      "what is the capability path",
      { capability_id: "C1" },
      undefined,
      { slot: "capability_id", label: "Data Governance", value: "C1" },
    );
  });
});

describe("the phrase and the pick stay separate", () => {
  it("a BIND sends the ORIGINAL sub_query, with the pick in the second argument", () => {
    // Composing `"<sub_query> (<slot>: C1)"` would send the choice back through the filler and
    // the resolver. A menu whose selections get re-interpreted is a menu whose selections are
    // suggestions.
    const send = vi.fn();
    dispatchReroute(bind({ capability_id: "C1" }), ask(), send);
    const [query, bound] = send.mock.calls[0];
    expect(query).toBe("what is the capability path");
    expect(query).not.toMatch(/C1|capability_id/);
    expect(bound).toEqual({ capability_id: "C1" });
  });

  it("a RESPEAK sends the phrase UNCOMPOSED, with the words in the THIRD argument", () => {
    // THIS ASSERTION USED TO PIN THE OPPOSITE — the composed phrase, and a call of length one.
    // Composing `"<sub_query> (<slot>: Integration Platform)"` put machine syntax on top of
    // the question and that string reached the rail, where it was displayed as what the person
    // asked. The phrase now goes byte-equal and the typed words ride beside it, which is the
    // shape BIND has always had.
    const send = vi.fn();
    const reroute: Reroute = {
      action: RESPEAK,
      slots: { horizon: "FY26" },
      query: "what is the capability path",
      slot: "capability_id",
      spoken_answer: "Integration Platform",
    };
    dispatchReroute(reroute, ask({ options: [] }), send);
    expect(send).toHaveBeenCalledWith(
      "what is the capability path",
      undefined,
      { slot: "capability_id", answer: "Integration Platform" },
      // NO VALUE. The resolver has not run on typed words, so there is no id they stand for,
      // and a chip claiming one would assert a narrowing that has not happened.
      { slot: "capability_id", label: "Integration Platform", value: "" },
    );
    const [query, bound] = send.mock.calls[0];
    expect(query).not.toMatch(/Integration Platform|capability_id/);
    // NOT in `bound_slots`, and this is the half that would fail silently. A RESPEAK ask had
    // no menu by construction, so `validate_bound_slots` refuses its slot as `no_menu`; the
    // words belong under a name that says they are words.
    expect(bound).toBeUndefined();
  });

  it("a RESPEAK carrying no words is refused rather than sent blind", () => {
    // `resolveAsk` rejects an empty answer before this point, so the guard is only reachable
    // by another caller — the same reason the empty-BIND branch above exists. Sending it would
    // re-ask the identical question with nothing added, which reads as the answer being
    // ignored rather than as an error.
    const send = vi.fn();
    const reroute: Reroute = {
      action: RESPEAK,
      slots: {},
      query: "what is the capability path",
      slot: "capability_id",
      spoken_answer: "   ",
    };
    const result = dispatchReroute(reroute, ask({ options: [] }), send);
    expect(send).not.toHaveBeenCalled();
    expect(result.blocked).toMatch(/no words/);
  });
});

/**
 * AN ASK WITH NO QUESTION BEHIND IT — the walk of 2026-09-26, lot 3.
 *
 * Picking a vintage recorded the choice under the menu that says what this one accepts, and no
 * new question ever arrived. Nothing was broken in the click, the resolve or the post: a BIND
 * sends `sub_query` AS THE TURN'S WHOLE PHRASE, and the ask that raised it had none.
 *
 * ── WHY EVERY SEAL IN THIS DIRECTORY WAS GREEN ────────────────────────────────────────────
 *
 * Measured across the elicitation suite: every fixture that gets CLICKED carries a non-empty
 * `sub_query`, and the one fixture without it — the refusal ask in `askFromRefusal.test.tsx`,
 * the only shape matching what the producer actually emits — is rendered and read and never
 * clicked. Two disjoint populations, so no case existed where the phrase was absent AND a pick
 * was made. The fixture covered what it tripped over.
 *
 * ── AND IT IS THE PRODUCER'S SHAPE, NOT AN INVENTED ONE ───────────────────────────────────
 *
 * Read at `agent_fleet/presentation_agent/main.py` on 2026-09-26, not from a message:
 * `_render_refusal_menu` returns `slot`, `options`, `option_source`, `reason`, `message`. No
 * `sub_query`, and no `accepted_slots` either — see the note on the last case, which is the
 * quieter defect this loud one was hiding.
 */
describe("an ask that carries no phrase cannot be re-asked, and says so", () => {
  /** The refusal ask as the producer projects it. Byte-for-byte the fields it emits, no more. */
  const REFUSAL = ask({
    slot: "rate_vintage",
    options: [{ value: "2022-02-01", label: "2022-02-01" }],
    option_source: "refusal",
    reason: "not_in_model",
    message: "no rate set for fiscal year 2022 at vintage 2021-02-01",
    sub_query: "",
  });

  it("refuses a BIND whose ask has no sub_query, instead of posting an empty turn", () => {
    const send = vi.fn();
    const result = dispatchReroute(bind({ rate_vintage: "2022-02-01" }), REFUSAL, send);
    // NOT SENT, and this is the part that was happening anyway: the send path drops an empty
    // phrase, so the post was made and discarded one layer down with nothing said.
    expect(send).not.toHaveBeenCalled();
    expect(result.blocked).toMatch(/without the question it came from/);
  });

  it("refuses a RESPEAK the same way — the words are not the turn", () => {
    // `resolveAsk` sets a RESPEAK's query to `ask.sub_query` too, so answering a refusal ask in
    // WORDS lands in the identical empty turn. Guarding only the menu path would have left half
    // the defect in place, on the arm a reader falls back to when the menu does not fit.
    const send = vi.fn();
    const result = dispatchReroute(
      { action: RESPEAK, slots: {}, query: "", slot: "rate_vintage", spoken_answer: "2022-02-01" },
      REFUSAL,
      send,
    );
    expect(send).not.toHaveBeenCalled();
    expect(result.blocked).toMatch(/without the question it came from/);
  });

  it("still sends when the phrase IS there — the guard is on the phrase, not on refusal asks", () => {
    // THE NEAR SIDE OF THE BRANCH, on purpose. A guard keyed on `option_source === "refusal"`
    // would pass every case above and silence a refusal ask the day the producer starts
    // carrying the phrase. The subject is the phrase; who raised the ask is not the question.
    const send = vi.fn();
    const result = dispatchReroute(
      bind({ rate_vintage: "2022-02-01" }),
      ask({ ...REFUSAL, sub_query: "what rate applies for fiscal year 2022" }),
      send,
    );
    expect(result.blocked).toBeUndefined();
    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0][0]).toBe("what rate applies for fiscal year 2022");
  });
});

describe("a turn the send path drops is reported, not assumed", () => {
  it("reports a BIND the send path refused", () => {
    // `sendMessage` returns false while a turn is in flight. The card's options are live during
    // a stream, so this is reachable by an ordinary click and not only by another caller — and
    // before the send reported it, the pick vanished and the card locked on it.
    const result = dispatchReroute(bind({ capability_id: "C1" }), ask(), () => false);
    expect(result.blocked).toMatch(/still in flight/);
  });

  it("reports a RESPEAK the send path refused", () => {
    const result = dispatchReroute(
      { action: RESPEAK, slots: {}, query: "what is the capability path", slot: "capability_id", spoken_answer: "meridian" },
      ask({ options: [] }),
      () => false,
    );
    expect(result.blocked).toMatch(/still in flight/);
  });

  it("treats a send that reports NOTHING as having gone", () => {
    // `void` is the test-double case and the pre-existing callers. Only `false` is a claim of a
    // drop, so a send with no opinion must not be read as one — otherwise every unwired mount
    // in this suite would start reporting a failure that did not happen.
    expect(dispatchReroute(bind({ capability_id: "C1" }), ask(), vi.fn()).blocked).toBeUndefined();
  });
});
