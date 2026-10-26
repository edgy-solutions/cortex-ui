import { describe, it, expect } from "vitest";
import { readAskBearingRefusal, readSeedConflict } from "./askBearingRefusal";
import {
  SEED_409_ASK,
  SEED_409_ASK_NO_BINDING_SLOT,
  SEED_409_ASK_UNAVAILABLE,
  SEED_409_NO_ASK,
  SEED_409_POLICY,
} from "./financeSeedAskFixture";

describe("readAskBearingRefusal -- the seed 409's detail", () => {
  it("(a) an ask with its option, the slot to re-send under, and the server's line", () => {
    const r = readAskBearingRefusal(SEED_409_ASK)!;
    expect(r.message).toBe(SEED_409_ASK.message);
    expect(r.ask?.binding_slot).toBe("program");
    expect(r.ask?.options).toEqual([{ value: "NP-MERIDIAN", label: "Notional Program Meridian" }]);
    // The ask's own slot is the dispatch identity, a DIFFERENT name from the one to re-send under.
    expect(r.ask?.slot).toBe("program_id");
    expect(r.policy).toBeUndefined();
    expect(r.askUnavailable).toBeUndefined();
  });

  it("(b) a policy inside the ask: the message is the policy's and there is nothing to choose", () => {
    const r = readAskBearingRefusal(SEED_409_POLICY)!;
    expect(r.policy?.message).toBe(SEED_409_POLICY.ask.policy.message);
    expect(r.message).toBe(SEED_409_POLICY.ask.policy.message);
    expect(r.policy?.repair).toBe("switch_cell");
    // An abstain is not an ask validateAsk accepts: no ask key at all.
    expect("ask" in r).toBe(false);
  });

  it("(b2) a policy on the TOP-LEVEL detail is not read: the producer puts it inside ask", () => {
    const top = { ...SEED_409_NO_ASK, policy: { message: "from the wrong place", repair: "x" } };
    const r = readAskBearingRefusal(top)!;
    expect("policy" in r).toBe(false);
    expect(r.message).toBe(SEED_409_NO_ASK.message);
  });

  it("(c) ask_unavailable is carried as its exception type, with no ask", () => {
    const r = readAskBearingRefusal(SEED_409_ASK_UNAVAILABLE)!;
    expect(r.askUnavailable).toBe("TimeoutError");
    expect("ask" in r).toBe(false);
    expect(r.message).toBe(SEED_409_ASK_UNAVAILABLE.message);
  });

  it("(d) no ask is only a message, with no key standing in for the rest", () => {
    const r = readAskBearingRefusal(SEED_409_NO_ASK)!;
    expect(Object.keys(r)).toEqual(["message"]);
    expect(r.message).toBe(SEED_409_NO_ASK.message);
  });

  it("(e) an ask that cannot be re-sent is not an ask", () => {
    const r = readAskBearingRefusal(SEED_409_ASK_NO_BINDING_SLOT)!;
    expect("ask" in r).toBe(false);
    expect(r.message).toBe(SEED_409_ASK_NO_BINDING_SLOT.message);
    // An empty slot name is the same case, not a value.
    const empty = readAskBearingRefusal({
      ...SEED_409_ASK,
      ask: { ...SEED_409_ASK.ask, binding_slot: "" },
    })!;
    expect("ask" in empty).toBe(false);
  });

  it("writes no undefined-valued key on any arm", () => {
    for (const d of [SEED_409_ASK, SEED_409_POLICY, SEED_409_ASK_UNAVAILABLE, SEED_409_NO_ASK]) {
      const r = readAskBearingRefusal(d)!;
      for (const [k, v] of Object.entries(r)) expect(v, k).not.toBeUndefined();
      if (r.policy) for (const [k, v] of Object.entries(r.policy)) expect(v, k).not.toBeUndefined();
    }
  });

  it("another error value, or a non-object, is null", () => {
    expect(readAskBearingRefusal({ ...SEED_409_ASK, error: "something_else" })).toBeNull();
    expect(readAskBearingRefusal({ message: "no error field" })).toBeNull();
    for (const x of [null, undefined, "unbound_required_slot", 409, [SEED_409_ASK]]) {
      expect(readAskBearingRefusal(x)).toBeNull();
    }
  });
});

describe("readSeedConflict -- off an axios error", () => {
  const err = (status: number, data: unknown) => ({ response: { status, data } });
  it("a 409 whose data.detail is the refusal reads", () => {
    expect(readSeedConflict(err(409, { detail: SEED_409_ASK }))?.ask?.binding_slot).toBe("program");
  });
  it("a non-409 is null even with the same body", () => {
    expect(readSeedConflict(err(422, { detail: SEED_409_ASK }))).toBeNull();
    expect(readSeedConflict(err(500, { detail: SEED_409_ASK }))).toBeNull();
  });
  it("a 409 for another reason, a string detail, or no response is null", () => {
    expect(readSeedConflict(err(409, { detail: { error: "duplicate" } }))).toBeNull();
    expect(readSeedConflict(err(409, { detail: "plain" }))).toBeNull();
    expect(readSeedConflict(new Error("network"))).toBeNull();
    expect(readSeedConflict(undefined)).toBeNull();
  });
});
