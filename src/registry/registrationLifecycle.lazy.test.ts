/**
 * F. REGISTRATION IS NOT DRIVEN BY LOAD, and the single-flight guard holds from the DECISION.
 *
 * Before: every artifact of a 1,000-answer load was observed, and the POST path awaited a
 * freshness check before it marked the flight started, so concurrent triggers each saw
 * `inFlight === false` and a burst of parallel POSTs went out.
 */
import { describe, it, expect } from "vitest";
import {
  createRegistrationLifecycle,
  observeArtifactsForMenuLoss,
  openedArtifacts,
} from "./registrationLifecycle";

const OURS = "cortex-ui-desktop";
const wiped = { presentation_source: "default-menu", frontend_id: OURS, selection_basis: "payload-only" };
let t = 1_000_000;
const make = () => {
  t = 1_000_000;
  return createRegistrationLifecycle({ frontendId: OURS, now: () => t });
};
const art = (i: number, withBody = true) => ({
  id: `a${i}`,
  rendered_output: withBody ? { presentation_provenance: wiped } : null,
});

describe("a load does not register", () => {
  it("1,000 wiped answers loaded, none opened: 0 re-assertions beyond the open", () => {
    const lc = make();
    expect(lc.shouldOpen()).toBe(true);
    lc.attemptStarted();
    lc.attemptSettled(true);
    t += 60_000;
    const all = Array.from({ length: 1000 }, (_, i) => art(i));
    const seen = new Set<string>();
    const fired = observeArtifactsForMenuLoss(openedArtifacts(all, []), seen, lc);
    expect(fired).toBe(false);
    expect(lc.state().reassertions).toBe(0);
    expect(seen.size).toBe(0);
  });

  it("opening one wiped answer fires exactly 1 re-assert", () => {
    const lc = make();
    lc.shouldOpen();
    lc.attemptStarted();
    lc.attemptSettled(true);
    t += 60_000;
    const all = Array.from({ length: 1000 }, (_, i) => art(i));
    const fired = observeArtifactsForMenuLoss(openedArtifacts(all, ["a42"]), new Set(), lc);
    expect(fired).toBe(true);
    expect(lc.state().reassertions).toBe(1);
  });

  it("a summary row with no body is not evidence and is not marked seen", () => {
    const rows = [art(1, false), art(2)];
    expect(openedArtifacts(rows, ["a1", "a2"]).map((a) => a.id)).toEqual(["a2"]);
  });
});

describe("single flight holds from the decision, not from the POST", () => {
  it("4 concurrent triggers: only the first is allowed through", () => {
    const lc = make();
    // four callers decide before any of them has reached attemptStarted (the freshness await)
    const decisions = [lc.shouldOpen(), lc.shouldOpen(), lc.shouldOpen(), lc.shouldOpen()];
    expect(decisions.filter(Boolean)).toHaveLength(1);
    expect(lc.state().inFlight).toBe(true);
  });

  it("a re-assert arriving during the OPEN's freshness await is refused", () => {
    // The HAR's parallel POSTs: `open` decided, then awaited /version.json; the first Electric
    // batch landed in that window and a re-assert went out beside the open.
    const lc = make();
    expect(lc.shouldOpen()).toBe(true);
    // no attemptStarted yet
    expect(lc.observe(wiped)).toBe(false);
  });

  it("a re-assert decided during the await refuses a second one", () => {
    const lc = make();
    lc.shouldOpen();
    lc.attemptStarted();
    lc.attemptSettled(true);
    t += 60_000;
    expect(lc.observe(wiped)).toBe(true);
    // no attemptStarted yet: the second trigger arrives in the await window
    expect(lc.observe(wiped)).toBe(false);
  });

  it("settling releases the reservation, including a refused (stale) attempt", () => {
    const lc = make();
    lc.shouldOpen();
    lc.attemptSettled(false);
    expect(lc.state().inFlight).toBe(false);
  });
});
