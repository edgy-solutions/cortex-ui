/**
 * DELTA_SET contract tests.
 *
 * The union check, plus the three claims that make this archetype different from every other
 * planning one: an EMPTY payload is an answer rather than a refusal, the magnitude is
 * upstream, and degraded is listed before improved.
 */
import { describe, expect, it } from "vitest";
import {
  DELTA_SET_CONTRACT,
  DELTA_SET_REFUSAL_REASONS,
  groupByDirection,
  validateDeltaSet,
  type DeltaEffect,
} from "./DeltaSet.contract";

const effects: DeltaEffect[] = [
  { metric: "plan_cost_curve", direction: "improved",
    magnitude: "-$1.00M in FY26-Q3", affected: ["FY26-Q3"], delta: -1_000_000 },
  { metric: "plan_dependency_violations", direction: "degraded",
    magnitude: "1 dependency violated (D4)", affected: ["D4"], delta: 1 },
];

describe("DELTA_SET contract — the refusal vocabulary fires", () => {
  it("refuses a non-list", () => {
    expect(validateDeltaSet(null)).toEqual({ kind: "empty", reason: "effects is not a list" });
  });

  it("refuses an effect with no metric", () => {
    expect(validateDeltaSet([{ direction: "improved", magnitude: "x", affected: [] }]))
      .toEqual({ kind: "empty", reason: "effect is missing its metric" });
  });

  it("refuses non-object effects", () => {
    expect(validateDeltaSet(["improved"]))
      .toEqual({ kind: "empty", reason: "effect is missing its metric" });
  });

  it("refuses an unknown direction", () => {
    expect(validateDeltaSet([{ metric: "m", direction: "sideways", magnitude: "x", affected: [] }]))
      .toEqual({ kind: "empty", reason: "effect has an unknown direction" });
  });
});

describe("DELTA_SET contract — an EMPTY set is an ANSWER", () => {
  it("ACCEPTS zero effects", () => {
    // The claim that separates this archetype from every other planning one. "This changes
    // nothing that matters" is genuinely useful to a room considering a move — it is not an
    // error, not a spinner, and not a blank card.
    const r = validateDeltaSet([]);
    expect(r.kind).toBe("ok");
    if (r.kind === "ok") expect(r.effects).toEqual([]);
  });

  it("publishes NO 'no effects' refusal reason", () => {
    // Publishing one would tell the backend a clean comparison is unrenderable, and the
    // selector would start routing "nothing changed" to a different archetype.
    const joined = (DELTA_SET_REFUSAL_REASONS as readonly string[]).join(" ");
    expect(joined).not.toContain("no effects");
    expect(DELTA_SET_CONTRACT.rowRequirements.minRows).toBe(0);
  });
});

describe("DELTA_SET contract — magnitude and direction are UPSTREAM", () => {
  it("accepts a magnitude string that the renderer could not derive from delta alone", () => {
    // "1 dependency violated (D4)" cannot be rebuilt from delta=1. The string IS the fact.
    const r = validateDeltaSet(effects);
    expect(r.kind).toBe("ok");
    if (r.kind === "ok") {
      expect(r.effects[1].magnitude).toBe("1 dependency violated (D4)");
      expect(r.effects[1].delta).toBe(1);
    }
    expect(DELTA_SET_CONTRACT.rowRequirements.magnitudeIsUpstream).toBe(true);
  });

  it("direction is not inferable from the sign of delta", () => {
    // A renderer inferring direction from sign would call a RISING capability level a
    // degradation. Both of these are negative deltas and only one is an improvement.
    const tricky: DeltaEffect[] = [
      { metric: "cost", direction: "improved", magnitude: "-$1M", affected: [], delta: -1 },
      { metric: "maturity", direction: "degraded", magnitude: "-1 level", affected: [], delta: -1 },
    ];
    const r = validateDeltaSet(tricky);
    expect(r.kind).toBe("ok");
    if (r.kind === "ok") {
      expect(r.effects[0].delta).toBe(r.effects[1].delta);
      expect(r.effects[0].direction).not.toBe(r.effects[1].direction);
    }
    expect(DELTA_SET_CONTRACT.rowRequirements.directionIsUpstream).toBe(true);
  });
});

describe("DELTA_SET contract — degraded is read first", () => {
  it("groups with degraded ahead of improved", () => {
    // A room reading a proposal needs the COST before the benefit. Leading with what improved
    // is how a trade-off gets approved without its price being read.
    const groups = groupByDirection(effects);
    expect(groups.map((g) => g.direction)).toEqual(["degraded", "improved"]);
  });

  it("omits a direction with no effects rather than rendering an empty heading", () => {
    const groups = groupByDirection([effects[0]]);
    expect(groups.map((g) => g.direction)).toEqual(["improved"]);
  });
});

describe("DELTA_SET contract — the contract and the component cannot disagree", () => {
  it("every refusal reason the contract publishes is one the validator can emit", () => {
    const emitted = new Set<string>();
    for (const probe of [
      null,
      [{ direction: "improved", magnitude: "x", affected: [] }],
      [{ metric: "m", direction: "sideways", magnitude: "x", affected: [] }],
    ] as unknown[]) {
      const r = validateDeltaSet(probe);
      if (r.kind === "empty") emitted.add(r.reason);
    }
    for (const reason of DELTA_SET_REFUSAL_REASONS) {
      expect(emitted, `contract publishes "${reason}" but nothing emitted it`).toContain(reason);
    }
  });

  it("does NOT publish live_view_requires_registration", () => {
    expect(DELTA_SET_REFUSAL_REASONS as readonly string[])
      .not.toContain("live_view_requires_registration");
  });

  it("declares recomputes:true", () => {
    expect(DELTA_SET_CONTRACT.recomputes).toBe(true);
  });

  it("names a STRUCTURAL archetype carrying no domain vocabulary", () => {
    expect(DELTA_SET_CONTRACT.archetype).toBe("DELTA_SET");
    for (const w of ["COST", "SCENARIO", "PLAN", "PORTFOLIO", "FUNDING"]) {
      expect(DELTA_SET_CONTRACT.archetype).not.toContain(w);
      expect(DELTA_SET_CONTRACT.component.toUpperCase()).not.toContain(w);
    }
  });
});
