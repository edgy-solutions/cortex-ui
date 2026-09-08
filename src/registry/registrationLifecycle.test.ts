/**
 * THE MONTHS-LONG SYMPTOM, ASSERTED AS A SEQUENCE.
 *
 * "After a full prime the system does not work and I have to reroll the engines, and sometimes
 * I have to reroll all the containers." The reroll never fixed it. The tab reload inside that
 * cycle did, which is why a permanent failure read as an intermittent one.
 *
 * Every test here is a SEQUENCE, because the defect exists in neither state on its own — a
 * session with a menu is fine, a session without one is fine after a reload, and the failure is
 * the move between them with no way back. This is the same shape as the hook-order crash: one
 * state, one assertion, and a defect that lives in the transition.
 */
import { describe, it, expect } from "vitest";
import {
  createRegistrationLifecycle,
  observeArtifactsForMenuLoss,
  BASE_COOLDOWN_MS,
} from "./registrationLifecycle";

const OURS = "cortex-ui-desktop";

/** A clock the test owns. No timers, no waiting — the intervals here are minutes long. */
function clock(start = 1_000_000) {
  let t = start;
  return { now: () => t, advance: (ms: number) => (t += ms) };
}

const make = (c: ReturnType<typeof clock>) =>
  createRegistrationLifecycle({ frontendId: OURS, now: c.now });

/** The post-wipe answer: the registry has entries but none for us. */
const wiped = {
  presentation_source: "default-menu",
  frontend_id: OURS,
  selection_basis: "payload-only (output_uri matched no capability)",
};
/** The worst case: registry empty, union empty. NO `selection_basis` at all. */
const wipedNoBasis = {
  presentation_source: "default-menu",
  frontend_id: OURS,
  reason: "no frontend has registered — union is empty",
};
/** A healthy answer. */
const healthy = {
  presentation_source: "registered",
  frontend_id: OURS,
  selection_basis: "output_uri+payload",
};
/** Menu present, this subject not on it — the cost-bindings case. */
const unbound = {
  presentation_source: "unrenderable",
  frontend_id: OURS,
  selection_basis: "payload-only (output_uri matched no capability)",
};

/** Drive a lifecycle through its opening registration, as the hook does. */
function opened(c: ReturnType<typeof clock>) {
  const l = make(c);
  expect(l.shouldOpen()).toBe(true);
  l.attemptStarted();
  l.attemptSettled(true);
  return l;
}

describe("the opening registration is still once per session", () => {
  it("opens once and never again on its own", () => {
    const c = clock();
    const l = make(c);
    expect(l.shouldOpen()).toBe(true);
    l.attemptStarted();
    l.attemptSettled(true);
    expect(l.shouldOpen()).toBe(false);
    c.advance(60 * 60 * 1000);
    expect(l.shouldOpen()).toBe(false);
  });

  it("costs NOTHING extra while the substrate is stable — the anti-poll control", () => {
    // The whole design rests on this: a session that never sees a wipe must issue exactly one
    // registration, forever. Without this assertion a heartbeat would satisfy every other test
    // in the file.
    const c = clock();
    const l = opened(c);
    let reasserts = 0;
    for (let i = 0; i < 500; i++) {
      c.advance(30_000);
      if (l.observe(healthy)) reasserts++;
    }
    expect(reasserts).toBe(0);
    expect(l.state().reassertions).toBe(0);
  });
});

describe("a wiped menu re-asserts itself", () => {
  it("re-posts on the first answer that says the menu is gone", () => {
    const c = clock();
    const l = opened(c);
    c.advance(10 * 60 * 1000); // the human primes ten minutes in
    expect(l.observe(wiped)).toBe(true);
  });

  it("re-posts on the EMPTY-UNION shape, which carries no selection_basis", () => {
    // The worst case, and the one a basis-requiring reader is blind to: nothing has registered
    // at all, so there is no basis to report. If this returned false the fix would work
    // everywhere except immediately after the wipe it exists for.
    const c = clock();
    const l = opened(c);
    c.advance(10 * 60 * 1000);
    expect(l.observe(wipedNoBasis)).toBe(true);
  });

  it("re-posts on the LIVE-VIEW refusal, stamped in the same anonymous branch", () => {
    // Found by mutation survey, not by design: the selector declines to nominate a live view
    // for a caller it cannot identify, and that check sits inside the same `if anonymous`
    // branch. Without this a post-wipe session that asks for a live view has no way back — the
    // one request shape the fix would still have left broken.
    const c = clock();
    const l = opened(c);
    c.advance(10 * 60 * 1000);
    expect(
      l.observe({
        presentation_source: "refused",
        refusal_code: "live_view_requires_registration",
        frontend_id: OURS,
      }),
    ).toBe(true);
  });

  it("does NOT re-post when the menu is present and the SUBJECT is unbound", () => {
    // The cost-bindings case: seven subjects were undeclared and every answer widened. The
    // repair there is a row in the assembler, not a re-post — and a machine that fired on it
    // would issue a request per unrenderable answer for the life of the session.
    const c = clock();
    const l = opened(c);
    c.advance(10 * 60 * 1000);
    expect(l.observe(unbound)).toBe(false);
    expect(l.state().reassertions).toBe(0);
  });

  it("ignores an answer stamped for a DIFFERENT frontend", () => {
    const c = clock();
    const l = opened(c);
    c.advance(10 * 60 * 1000);
    expect(l.observe({ ...wiped, frontend_id: "some-other-surface" })).toBe(false);
  });

  it("accepts an answer with no frontend_id — the field is optional at those sites", () => {
    const c = clock();
    const l = opened(c);
    c.advance(10 * 60 * 1000);
    const { frontend_id: _omitted, ...anonymous } = wiped;
    expect(l.observe(anonymous)).toBe(true);
  });

  it("says nothing about provenance it cannot read", () => {
    const c = clock();
    const l = opened(c);
    c.advance(10 * 60 * 1000);
    for (const junk of [null, undefined, "default-menu", 42, [], {}, { presentation_source: 7 }]) {
      expect(l.observe(junk), String(junk)).toBe(false);
    }
  });
});

describe("the loop guard — a re-assertion that does not take", () => {
  it("does not re-post while one is in flight, EVEN PAST THE COOLDOWN", () => {
    // Written first without the clock advance, and a mutation survey caught it: the cooldown
    // was doing all the work and the in-flight guard could be deleted with every test still
    // green. The guard earns its place only in the case the first version never reached — a
    // POST that hangs LONGER than the interval, which is exactly when a second one would be
    // fired at a server already struggling to answer the first.
    const c = clock();
    const l = opened(c);
    c.advance(10 * 60 * 1000);
    expect(l.observe(wiped)).toBe(true);
    l.attemptStarted();

    c.advance(60 * 60 * 1000); // an hour: far past any cooldown this machine can reach
    expect(l.observe(wiped)).toBe(false);
    expect(l.observe(wiped)).toBe(false);

    // And once it settles, the cooldown takes over from the in-flight guard.
    l.attemptSettled(true);
    expect(l.observe(wiped)).toBe(true);
  });

  it("BOUNDS a wipe that no POST can repair, instead of one request per answer", () => {
    // The failure mode this guard exists for: the server accepts the rows and does not keep
    // them, so every answer forever says `default-menu`. Unguarded, this machine would turn
    // one wipe into a request per answer — the poll we were avoiding, from the other side.
    const c = clock();
    const l = opened(c);
    c.advance(10 * 60 * 1000);
    let posts = 0;
    // Two hours of answers arriving every five seconds.
    for (let i = 0; i < 1440; i++) {
      c.advance(5_000);
      if (l.observe(wiped)) {
        posts++;
        l.attemptStarted();
        l.attemptSettled(true); // accepted, and still not persisted
      }
    }
    expect(posts).toBeGreaterThan(0);
    // Doubling to a five-minute cap: a handful of early attempts, then one per cap.
    expect(posts).toBeLessThan(35);
    expect(l.state().cooldownMs).toBe(300_000);
  });

  it("holds off for the cooldown, then allows exactly one more", () => {
    const c = clock();
    const l = opened(c);
    c.advance(10 * 60 * 1000);
    expect(l.observe(wiped)).toBe(true);
    l.attemptStarted();
    l.attemptSettled(true);
    c.advance(BASE_COOLDOWN_MS); // the interval has DOUBLED, so this is not yet enough
    expect(l.observe(wiped)).toBe(false);
    c.advance(BASE_COOLDOWN_MS + 1);
    expect(l.observe(wiped)).toBe(true);
  });
});

describe("a session that recovers does not carry the penalty", () => {
  it("a healthy answer resets the backoff AND the clock, so the NEXT wipe is prompt", () => {
    // The human primes more than once. A second wipe deserves the same immediate recovery as
    // the first; without the reset it would wait out an interval earned by an unrelated
    // earlier failure.
    const c = clock();
    const l = opened(c);
    c.advance(10 * 60 * 1000);

    // A wipe that takes several attempts to repair.
    for (let i = 0; i < 3; i++) {
      c.advance(10 * 60 * 1000);
      expect(l.observe(wiped)).toBe(true);
      l.attemptStarted();
      l.attemptSettled(true);
    }
    expect(l.state().cooldownMs).toBeGreaterThan(BASE_COOLDOWN_MS);

    // It finally takes.
    expect(l.observe(healthy)).toBe(false);
    expect(l.state().cooldownMs).toBe(BASE_COOLDOWN_MS);
    expect(l.state().reassertions).toBe(0);

    // The second prime, one second later. No waiting.
    c.advance(1_000);
    expect(l.observe(wiped)).toBe(true);
  });
});

describe("reading provenance off arriving artifacts", () => {
  const artifact = (id: string, provenance: unknown) => ({
    id,
    rendered_output: { presentation_provenance: provenance },
  });

  it("reads the field at the path the producer writes it to", () => {
    // `rendered_output.presentation_provenance`, read from the producer rather than guessed.
    // This field was once written here as `presentation` — a name nothing emits — and the
    // render stayed silent while looking correct. A path typo would fail exactly that way
    // again: no crash, no warning, and the reload ritual back for good.
    const c = clock();
    const l = opened(c);
    c.advance(10 * 60 * 1000);
    expect(observeArtifactsForMenuLoss([artifact("a1", wiped)], new Set(), l)).toBe(true);
  });

  it("is not fooled by provenance at the WRONG path", () => {
    // The positive control for the test above: if the reader looked at the artifact root, or
    // at some other key, this fixture would trigger and the path assertion would be vacuous.
    const c = clock();
    const l = opened(c);
    c.advance(10 * 60 * 1000);
    const misplaced = [
      { id: "b1", presentation_provenance: wiped },
      { id: "b2", rendered_output: { presentation: wiped } },
      { id: "b3", rendered_output: null },
      { id: "b4" },
    ] as Parameters<typeof observeArtifactsForMenuLoss>[0];
    expect(observeArtifactsForMenuLoss(misplaced, new Set(), l)).toBe(false);
  });

  it("treats each artifact as evidence EXACTLY ONCE", () => {
    // The wiped answer stays on the canvas after the repair. Re-reading it would re-post once
    // per cooldown forever, against a menu that is already back — a poll sourced from a stale
    // row, which is the failure this whole design is trying not to become.
    const c = clock();
    const l = opened(c);
    c.advance(10 * 60 * 1000);
    const seen = new Set<string>();
    const batch = [artifact("a1", wiped)];
    expect(observeArtifactsForMenuLoss(batch, seen, l)).toBe(true);
    l.attemptStarted();
    l.attemptSettled(true);
    c.advance(60 * 60 * 1000); // far past any cooldown
    expect(observeArtifactsForMenuLoss(batch, seen, l)).toBe(false);
  });

  it("several wiped answers in one batch are ONE re-post", () => {
    const c = clock();
    const l = opened(c);
    c.advance(10 * 60 * 1000);
    const seen = new Set<string>();
    const batch = [artifact("a1", wiped), artifact("a2", wiped), artifact("a3", wiped)];
    expect(observeArtifactsForMenuLoss(batch, seen, l)).toBe(true);
    expect(l.state().reassertions).toBe(1);
  });

  it("still records a healthy answer sitting BEHIND a wiped one in the same batch", () => {
    // Why the loop does not return early on the first trigger: the healthy answer is what
    // clears the backoff, and discarding it would make the next wipe slower to recover for no
    // reason other than iteration order.
    const c = clock();
    const l = opened(c);
    c.advance(10 * 60 * 1000);
    const batch = [artifact("a1", wiped), artifact("a2", healthy)];
    expect(observeArtifactsForMenuLoss(batch, new Set(), l)).toBe(true);
    expect(l.state().cooldownMs).toBe(BASE_COOLDOWN_MS);
    expect(l.state().reassertions).toBe(0);
  });

  it("ignores artifacts with no id rather than treating them as new every time", () => {
    const c = clock();
    const l = opened(c);
    c.advance(10 * 60 * 1000);
    const seen = new Set<string>();
    const nameless = [{ rendered_output: { presentation_provenance: wiped } }];
    expect(observeArtifactsForMenuLoss(nameless, seen, l)).toBe(false);
    expect(seen.size).toBe(0);
  });
});

describe("evidence before the session ever registered", () => {
  it("does not RE-assert something that was never asserted", () => {
    // An answer can reach a surface whose opening POST has not run or has not landed. There is
    // nothing to re-assert; `shouldOpen` owns that first registration, and a machine that
    // treated this as a re-assertion would spend its backoff before ever registering once.
    const c = clock();
    const l = make(c);
    expect(l.observe(wiped)).toBe(false);
    expect(l.state().reassertions).toBe(0);
    expect(l.shouldOpen()).toBe(true);
  });
});
