import { existsSync, readFileSync } from "node:fs";
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
  it("sources its slots from the three keys the producer WRITES, and nowhere else", () => {
    // THIS PINNED `resolved_intent?.parameters` — a key no writer in the engine produces,
    // under either write site. The strip therefore rendered no slots on any card, and the
    // note filed against that blankness named a cause that had since been fixed. These three
    // are the supervisor's own `subtask_slots_decision` metadata keys.
    expect(SRC).toMatch(/slot_resolution/);
    expect(SRC).toMatch(/accepted_slots/);
    expect(SRC).toMatch(/refused_slots/);
    // And the dead key is gone rather than kept beside them: an orphan that looks
    // authoritative is exactly what the next reader would source from.
    expect(SRC).not.toMatch(/resolved_intent\?\.parameters/);
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
    expect(SRC).toMatch(/slots\.map\(\(row\)/);
    expect(SRC).toMatch(/key=\{row\.slot\}/);
    expect(SRC).toMatch(/data-slot=\{row\.slot\}/);
  });

  it("a REFUSED slot is a TREATMENT, never a filter", () => {
    // The row explaining why the answer did not reflect what the person said is the most
    // useful one on the strip. Filtering it out is the omission-leaves-no-trace shape — and
    // rendering it like an accepted one is worse, because it claims the system used a value
    // it discarded. A presence that misrepresents beats an absence for damage. So rows are
    // built without reference to refusal, and refusal only changes how a row is DRAWN.
    expect(SRC).toMatch(/data-slot-refused/);
    expect(SRC).toMatch(/not used/);
    // The row builder must not drop anything: no filtering on the refusal map.
    const builder = SRC.slice(
      SRC.indexOf("export function interpretationRows"),
      SRC.indexOf("export function InterpretationStrip"),
    );
    expect(builder).not.toMatch(/\.filter\(/);
    // Positive control that we sliced the function we think we did.
    expect(builder).toMatch(/refusedBy/);
  });

  it("the refusal's reason is a FIELD on the row, never parsed out of prose", () => {
    // It arrived as a sentence once — `"program_id='meridian' refused (undeclared)"` — so a
    // surface wanting the slot name had to read English. The producer now sends
    // `{name, reason, spoken}` and this side reads the fields; a regex over the reason string
    // here would re-import the defect on the consumer side.
    expect(SRC).toMatch(/data-refused-reason/);
    expect(SRC).toMatch(/typeof r\.name === "string"/);
    const builder = SRC.slice(
      SRC.indexOf("export function interpretationRows"),
      SRC.indexOf("export function InterpretationStrip"),
    );
    expect(builder).not.toMatch(/\.match\(|\.split\(/);
  });

  it("does not print [object Object] at a reader", () => {
    // An object-valued slot has no agreed one-line rendering. Saying so is honest; printing
    // the default coercion is the chrome equivalent of a synthesized answer.
    expect(SRC).not.toMatch(/String\(v\)\s*;\s*\/\/ object/);
    expect(SRC).toMatch(/return "…";/);
  });
});

describe("the three keys are the PRODUCER'S, read from its own declaration", () => {
  /**
   * The seal that would have caught this years earlier.
   *
   * `parameters` was declared on cortex's `Artifact` type, sourced by this strip, and written
   * by nobody — and nothing failed, because a strip with no slots looks exactly like a card
   * with no interpretation. Asserting cortex against cortex could never have found it. So the
   * names are checked against the supervisor's OWN materialization, live.
   *
   * Skipped rather than faked when the sibling checkout is absent: a green run on a machine
   * that cannot see the producer must not be mistaken for agreement with it.
   */
  const SUPERVISOR = path.join(__dirname, "../../../../invincible-agent/src/iagent/defs/dynamic_supervisor.py");
  const HAVE_SUPERVISOR = existsSync(SUPERVISOR);

  it.skipIf(!HAVE_SUPERVISOR)("are emitted by subtask_slots_decision, all three", () => {
    const src = readFileSync(SUPERVISOR, "utf8");
    for (const key of ["slot_resolution", "accepted_slots", "refused_slots"]) {
      expect(src, `${key} is not a metadata key on subtask_slots_decision`).toMatch(
        new RegExp('"' + key + '": MetadataValue'),
      );
      expect(SRC, `the strip stopped reading ${key}`).toContain(key);
    }
  });

  it.skipIf(!HAVE_SUPERVISOR)("refused_slots is RECORDS there, not the prose it once was", () => {
    // It serialized as `[str(r) for r in refusals]`, so the slot name was only recoverable by
    // parsing an English sentence. If it ever regresses, this side is reading `.name` off a
    // string and every refusal silently loses its row.
    const src = readFileSync(SUPERVISOR, "utf8");
    expect(src).not.toMatch(/\[str\(r\) for r in accepted\.refusals\]/);
    expect(src).toMatch(/"name": r\.name/);
  });

  it("`parameters` is not read anywhere in this repo any more", () => {
    // The dead key, gone from the type as well as the strip. Left in place it would be the
    // obvious thing for the next surface to source from — an orphan that looks authoritative.
    const types = readFileSync(path.join(__dirname, "../../api/types.ts"), "utf8");
    const block = types.slice(types.indexOf("resolved_intent: {"));
    expect(block.slice(0, block.indexOf("};"))).not.toMatch(/^\s*parameters\??:/m);
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
