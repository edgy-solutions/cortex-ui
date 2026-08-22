/**
 * DeltaSet's own contract (DELTA_SET) — INV-3's card.
 *
 * Consequences grouped by direction: what improved, what degraded, each with a magnitude and
 * the things it touched. **It renders a COMPARISON, never a state.** That distinction is the
 * whole product thesis: a before-and-after of two states shows a room what changed; a delta
 * set shows it the PRICE of the change alongside the benefit, which is the thing a
 * before-and-after leaves the reader to work out.
 *
 * THE MAGNITUDE IS A STRING AND THE COMPONENT MUST NOT REBUILD IT. `magnitude` arrives
 * pre-formatted from computed values by the verb ("-$1.00M in FY26-Q3", "1 dependency violated
 * (D4)"). The renderer displays it verbatim. Re-deriving a magnitude here from `delta` would
 * put a second formatter in the system, and the two would disagree about rounding on the day
 * it mattered — the plan's highest-severity correctness risk is "diff magnitudes wrong in the
 * room", and the mitigation is that exactly one place formats them.
 *
 * DIRECTION IS UPSTREAM TOO. "Cost went down is good" is a judgement the measure owns, not a
 * sign test the renderer performs — a renderer inferring direction from the sign of `delta`
 * would call a rising capability level a degradation.
 *
 * AN EMPTY DELTA SET IS A REAL ANSWER, and the most easily mis-rendered one. A scenario with
 * no material effects is "this changes nothing that matters", which is genuinely useful in a
 * room considering a move. It is NOT an error, NOT a spinner, and NOT a blank card.
 */

export const DELTA_SET_DIRECTIONS = ["improved", "degraded", "neutral"] as const;
export type DeltaDirection = (typeof DELTA_SET_DIRECTIONS)[number];

export const DELTA_SET_ROW_REQUIREMENTS = {
  /**
   * ZERO IS VALID. Unlike every other planning archetype, an empty payload here is a
   * meaningful answer — "nothing material changed" — so `minRows` is 0 and the empty case is
   * an acceptance shape rather than a refusal.
   */
  minRows: 0,
  /** Every effect names its metric and its direction; neither has a default. */
  requiresMetricAndDirection: true,
  /** `magnitude` is pre-formatted upstream and displayed verbatim. Never recomputed here. */
  magnitudeIsUpstream: true,
  /** `direction` is a judgement the measure owns. Never inferred from the sign of `delta`. */
  directionIsUpstream: true,
} as const;

/**
 * Reasons THIS COMPONENT can emit. Note what is NOT here: there is no "no effects" refusal,
 * because an empty effect list is an ANSWER rather than a failure to produce one. Publishing
 * one would tell the backend that a clean comparison is unrenderable, and the selector would
 * start routing "nothing changed" to a different archetype.
 */
export const DELTA_SET_REFUSAL_REASONS = [
  "effects is not a list",
  "effect is missing its metric",
  "effect has an unknown direction",
] as const;

export const DELTA_SET_CONTRACT = {
  archetype: "DELTA_SET",
  component: "DeltaSet",
  layout: "full-width",
  /** ADR-0042 Ruling 9's discriminant — a contract FIELD, never a refusal reason. */
  recomputes: true,
  fields: {
    /** Effects: metric, direction, magnitude, affected[], delta. */
    effects: { encoding: "array", parsesTo: "array-of-objects", required: true },
    /** What is being compared against what. Supplied; the renderer invents no framing. */
    scope_label: { type: "string", required: false },
    baseline_label: { type: "string", required: false },
    /** A one-sentence headline the LLM MAY write from the effect rows, under the narration
     *  contract and its number-check. Optional by design: the card is complete without it. */
    headline: { type: "string", required: false },
  },
  rowRequirements: DELTA_SET_ROW_REQUIREMENTS,
  refusalReasons: DELTA_SET_REFUSAL_REASONS,
} as const;

export type DeltaSetContract = typeof DELTA_SET_CONTRACT;

export interface DeltaEffect {
  metric: string;
  direction: DeltaDirection;
  /** Pre-formatted upstream. Displayed verbatim. */
  magnitude: string;
  affected: string[];
  /** The raw number behind the magnitude. Present for sorting; NEVER for re-formatting. */
  delta?: number;
}

export type DeltaSetRefusal = (typeof DELTA_SET_REFUSAL_REASONS)[number];

export function validateDeltaSet(
  effects: unknown,
): { kind: "ok"; effects: DeltaEffect[] } | { kind: "empty"; reason: DeltaSetRefusal } {
  if (!Array.isArray(effects)) {
    return { kind: "empty", reason: "effects is not a list" };
  }
  // An empty list is ACCEPTED — see minRows. "Nothing material changed" is an answer.
  const objects = effects.filter((e): e is Record<string, unknown> =>
    typeof e === "object" && e !== null && !Array.isArray(e));
  if (objects.length !== effects.length) {
    return { kind: "empty", reason: "effect is missing its metric" };
  }
  if (objects.some((e) => typeof e.metric !== "string" || e.metric.length === 0)) {
    return { kind: "empty", reason: "effect is missing its metric" };
  }
  if (objects.some((e) => !DELTA_SET_DIRECTIONS.includes(e.direction as DeltaDirection))) {
    return { kind: "empty", reason: "effect has an unknown direction" };
  }
  return { kind: "ok", effects: objects as unknown as DeltaEffect[] };
}

/**
 * Group by direction, preserving upstream order within each group.
 *
 * DEGRADED FIRST, deliberately. A room reading a proposal needs the cost before the benefit —
 * leading with what improved is how a trade-off gets approved without its price being read.
 */
export function groupByDirection(effects: DeltaEffect[]): Array<{
  direction: DeltaDirection;
  effects: DeltaEffect[];
}> {
  const order: DeltaDirection[] = ["degraded", "improved", "neutral"];
  return order
    .map((direction) => ({ direction, effects: effects.filter((e) => e.direction === direction) }))
    .filter((g) => g.effects.length > 0);
}
