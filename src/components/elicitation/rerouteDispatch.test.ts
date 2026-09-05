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
    expect(send).toHaveBeenCalledWith("what is the capability path", { capability_id: "C1" });
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
    expect(send).toHaveBeenCalledWith("what is the capability path", undefined, {
      slot: "capability_id",
      answer: "Integration Platform",
    });
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
