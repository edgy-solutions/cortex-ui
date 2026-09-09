/**
 * THE SIGNAL THE SHAS CANNOT GIVE.
 *
 * The build stamp says what is DEPLOYED. It cannot say whether this client and the mesh agree
 * about which archetypes exist, because that is established at runtime by the ADR-0017
 * registration and can fail with both halves perfectly up to date.
 *
 * `sent != accepted` means the server kept fewer rows than were offered, so a later answer
 * selects from a shorter menu and draws a PLAUSIBLE WRONG CARD. Nothing throws, nothing is
 * blank, and the reader cannot tell. It has lived its whole life as a console line, which is
 * read by whoever thinks to open the console — nobody, at the moment the card is wrong.
 *
 * ── THE FOUR STATES MUST STAY FOUR ────────────────────────────────────────────────────────
 *
 * `partial` and `failed` are the pair most tempting to fold: both mean "the menu is not what
 * this client offered". Their repairs are opposite — find which row the server refused, versus
 * retry a request that never landed — and folding exactly this pair cost a person a wrong
 * answer on the version row the same night.
 *
 * The set-level assertion below is the one that catches a collapse. Six single-case assertions
 * can all pass against a component returning a constant, if each case happens to expect that
 * constant; the collapse is a property ABOUT the set, so it needs an assertion about the set.
 * (That framing is the backend lane's, from their own version of this fix.)
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { CapabilityBadge } from "./CapabilityBadge";
import { useRegistrationStore } from "@/store/useRegistrationStore";

const reset = () =>
  useRegistrationStore.setState({ status: "idle", sent: null, accepted: null, reassertions: 0 });

beforeEach(reset);
afterEach(cleanup);

const badge = () => document.querySelector("[data-capability-badge]")!;
const text = () => badge().textContent ?? "";
const status = () => badge().getAttribute("data-capability-status");
const amber = () => (badge().className ?? "").includes("amber");

describe("the store classifies what came back", () => {
  it("equal counts are agreement", () => {
    useRegistrationStore.getState().report({ sent: 24, accepted: 24, reassertion: false });
    expect(useRegistrationStore.getState().status).toBe("agreed");
  });

  it("fewer accepted than sent is the FINDING", () => {
    useRegistrationStore.getState().report({ sent: 24, accepted: 23, reassertion: false });
    expect(useRegistrationStore.getState().status).toBe("partial");
  });

  it("MORE accepted than sent is also a disagreement", () => {
    // Pointing the other way: the menu holds rows this client never offered. Anything but
    // equality is the two halves describing different things, so `>=` would have been wrong.
    useRegistrationStore.getState().report({ sent: 24, accepted: 25, reassertion: false });
    expect(useRegistrationStore.getState().status).toBe("partial");
  });

  it("a failed request is NOT a partial acceptance", () => {
    // Nothing was established either way. Retry is the repair, not a hunt for a refused row.
    useRegistrationStore.getState().reportFailure();
    expect(useRegistrationStore.getState().status).toBe("failed");
  });

  it("a failure records NULL accepted, not zero", () => {
    // Zero accepted is a real and different outcome — the server answered and kept nothing.
    // Writing 0 for a request that never returned states a measurement nobody took.
    useRegistrationStore.getState().report({ sent: 24, accepted: 0, reassertion: false });
    expect(useRegistrationStore.getState().accepted).toBe(0);
    useRegistrationStore.getState().reportFailure();
    expect(useRegistrationStore.getState().accepted).toBeNull();
  });

  it("counts re-assertions only when it was one", () => {
    useRegistrationStore.getState().report({ sent: 2, accepted: 2, reassertion: false });
    expect(useRegistrationStore.getState().reassertions).toBe(0);
    useRegistrationStore.getState().report({ sent: 2, accepted: 2, reassertion: true });
    expect(useRegistrationStore.getState().reassertions).toBe(1);
  });
});

describe("the badge says which of the four it is", () => {
  it("shows the counts when the halves agree, quietly", () => {
    useRegistrationStore.getState().report({ sent: 24, accepted: 24, reassertion: false });
    render(<CapabilityBadge />);
    expect(text()).toContain("24/24");
    // Agreement is the state 99% of days. A badge that took colour every ordinary day is one
    // more thing to stop seeing, and then it is not seen on the day it changes.
    expect(amber()).toBe(false);
  });

  it("takes COLOUR on a mismatch, and shows both numbers", () => {
    // "23/24" is only legible because "24/24" is what the reader has been seeing.
    useRegistrationStore.getState().report({ sent: 24, accepted: 23, reassertion: false });
    render(<CapabilityBadge />);
    expect(text()).toContain("23/24");
    expect(amber()).toBe(true);
  });

  it("says NOT REGISTERED on a failure — never a count", () => {
    useRegistrationStore.getState().reportFailure();
    render(<CapabilityBadge />);
    expect(text()).toContain("not registered");
    expect(text()).not.toMatch(/\d+\/\d+/);
    expect(amber()).toBe(true);
  });

  it("always renders something — the row answers in every state", () => {
    for (const set of [
      () => reset(),
      () => useRegistrationStore.getState().report({ sent: 3, accepted: 3, reassertion: false }),
      () => useRegistrationStore.getState().report({ sent: 3, accepted: 1, reassertion: false }),
      () => useRegistrationStore.getState().reportFailure(),
    ]) {
      reset();
      set();
      const { unmount } = render(<CapabilityBadge />);
      expect(text().trim().length).toBeGreaterThan(0);
      unmount();
    }
  });

  it("the four states render four DIFFERENT things", () => {
    // The assertion that catches a collapse. Each case above could pass against a component
    // returning a constant if each expectation happened to match it; the collapse is a property
    // about the SET, so only an assertion about the set can see it.
    const rendered: string[] = [];
    const statuses: (string | null)[] = [];
    for (const set of [
      () => reset(),
      () => useRegistrationStore.getState().report({ sent: 24, accepted: 24, reassertion: false }),
      () => useRegistrationStore.getState().report({ sent: 24, accepted: 23, reassertion: false }),
      () => useRegistrationStore.getState().reportFailure(),
    ]) {
      reset();
      set();
      const { unmount } = render(<CapabilityBadge />);
      rendered.push(text().trim());
      statuses.push(status());
      unmount();
    }
    expect(new Set(rendered).size).toBe(4);
    expect(new Set(statuses).size).toBe(4);
  });

  it("the TOOLTIP distinguishes them too, not only the label", () => {
    // The label is four words; the tooltip is where a reader learns the repair. Partial says
    // compare the names against the graph; failed says retry. Sharing prose would undo the
    // split at the only place it is explained.
    useRegistrationStore.getState().report({ sent: 24, accepted: 23, reassertion: false });
    const { unmount } = render(<CapabilityBadge />);
    const partialTitle = badge().getAttribute("title") ?? "";
    unmount();
    reset();
    useRegistrationStore.getState().reportFailure();
    render(<CapabilityBadge />);
    const failedTitle = badge().getAttribute("title") ?? "";
    expect(partialTitle).not.toBe(failedTitle);
    expect(partialTitle).toMatch(/plausible but wrong card/i);
    expect(failedTitle).toMatch(/retry/i);
  });
});
