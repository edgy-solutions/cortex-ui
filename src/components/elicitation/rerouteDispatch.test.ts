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

  it("a RESPEAK sends the composed phrase and NO second argument", () => {
    // Free text has no pick to carry, and posting one would be a claim about a menu that was
    // never offered — `validate_bound_slots` refuses exactly that as `no_menu`.
    const send = vi.fn();
    const reroute: Reroute = {
      action: RESPEAK,
      slots: { horizon: "FY26" },
      query: "what is the capability path (capability_id: Integration Platform)",
      slot: "capability_id",
    };
    dispatchReroute(reroute, ask({ options: [] }), send);
    expect(send).toHaveBeenCalledWith(
      "what is the capability path (capability_id: Integration Platform)",
    );
    expect(send.mock.calls[0]).toHaveLength(1);
  });
});
