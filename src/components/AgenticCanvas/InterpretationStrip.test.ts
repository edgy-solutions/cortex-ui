import { readFileSync } from "node:fs";
import path from "node:path";
/**
 * Two claims a live view makes about itself, and the two ways each could lie.
 *
 * The FRESHNESS stamp is ADR-0042 §4's client half — "each evaluation carries its own
 * `valid_as_of` ... and the card displays it", called out in the ADR as the one place a live
 * view could quietly lie. The lie it prevents is a card showing 09:00 while displaying 11:20's
 * numbers. So the two properties: an absent as-of must NOT fall back to now (that manufactures
 * the exact claim the stamp exists to make honest), and the displayed age must be derived from
 * the artifact every render rather than cached.
 *
 * The INTERPRETATION strip claims how the question was read. A fabricated interpretation is
 * worse than none, because it is precisely what a reader would trust — so it renders from
 * `resolved_intent.parameters` and from nowhere else. And it renders slots as DISCRETE
 * elements, because the interpretation card is the view-control surface: rendering them as one
 * interpolated sentence would make editability a re-layout rather than a behaviour change.
 */
import { describe, it, expect } from "vitest";
import { relativeAge } from "./InterpretationStrip";

const SRC = readFileSync(path.join(__dirname, "InterpretationStrip.tsx"), "utf8");
const CARD = readFileSync(path.join(__dirname, "StageCard.tsx"), "utf8");

describe("relativeAge", () => {
  const now = 1_700_000_000_000;

  it("reports the age of the EVALUATION, at the granularity a header can hold", () => {
    expect(relativeAge(now - 10_000, now)).toBe("just now");
    expect(relativeAge(now - 5 * 60_000, now)).toBe("5m");
    expect(relativeAge(now - 3 * 3_600_000, now)).toBe("3h");
    expect(relativeAge(now - 2 * 86_400_000, now)).toBe("2d");
  });

  it("never renders a FUTURE age — clock skew must not print a negative freshness", () => {
    // Server and browser clocks disagree routinely. "-3m" on a freshness stamp reads as a bug
    // in the answer rather than a bug in the clocks, on the surface whose whole job is trust.
    expect(relativeAge(now + 60_000, now)).toBe("just now");
  });
});

describe("the freshness stamp does not manufacture a claim", () => {
  it("an absent or nonsensical as-of renders UNKNOWN, never now", () => {
    // The load-bearing negative. Defaulting a missing timestamp to Date.now() would assert
    // that the card was evaluated this instant — the precise lie ADR-0042 §4 names.
    expect(SRC).toMatch(/as of —/);
    // The guard that produces it, asserted so a "tidy" `?? Date.now()` cannot slip in.
    expect(SRC).toMatch(/!Number\.isFinite\(t\)/);
    expect(SRC).not.toMatch(/valid_as_of\s*\?\?\s*Date\.now\(\)/);
  });

  it("reads the artifact's as-of rather than caching a formatted label", () => {
    // A cached string is how a live view comes to assert a freshness it no longer has: the
    // re-evaluation lands, the artifact updates, and the stale label stays put.
    expect(SRC).toMatch(/artifact\.valid_as_of/);
    expect(SRC).not.toMatch(/useState|useMemo|useRef/);
  });
});

describe("the interpretation strip renders only what was captured", () => {
  it("sources its slots from resolved_intent.parameters and nowhere else", () => {
    expect(SRC).toMatch(/resolved_intent\?\.parameters/);
  });

  it("renders NOTHING when no interpretation was captured", () => {
    // Not an empty box with a heading: the strip is a claim, and a placeholder occupies the
    // space where a real claim belongs while making the card look like it said something.
    expect(SRC).toMatch(/if \(!hasInterpretation\(artifact\)\) return null;/);
  });

  it("that decision is EXPORTED, because the footer sizes itself around it", () => {
    // It was inlined, and the footer beside it reserved half a row for a strip that was not
    // there — truncating the question into the empty space. A call site restating "an action
    // or some slots" would be right today and wrong the day this condition moves; one shared
    // predicate makes the disagreement unrepresentable rather than merely unlikely.
    expect(SRC).toMatch(/export function hasInterpretation\(artifact: Artifact\): boolean/);
  });

  it("renders each slot as its OWN element — editability must not require a re-layout", () => {
    // The B5 seam. One node per slot, keyed by slot name, so the editable version swaps the
    // node and leaves the row's composition untouched. A template literal joining the slots
    // into a sentence would satisfy the mockup and forbid the next step.
    expect(SRC).toMatch(/slots\.map\(\(\[k, v\]\)/);
    expect(SRC).toMatch(/key=\{k\}/);
    expect(SRC).toMatch(/data-slot=\{k\}/);
  });

  it("does not print [object Object] at a reader", () => {
    // An object-valued slot has no agreed one-line rendering. Saying so is honest; printing
    // the default coercion is the chrome equivalent of a synthesized answer.
    expect(SRC).not.toMatch(/String\(v\)\s*;\s*\/\/ object/);
    expect(SRC).toMatch(/return "…";/);
  });
});

describe("both are actually mounted — a helper nothing calls is the card we started with", () => {
  it("the card source is being read — positive control", () => {
    expect(CARD).toContain("export function StageCard");
  });

  it("StageCard mounts the strip and the stamp", () => {
    expect(CARD).toMatch(/<InterpretationStrip artifact=\{artifact\} \/>/);
    expect(CARD).toMatch(/<FreshnessStamp artifact=\{artifact\} \/>/);
  });
});
