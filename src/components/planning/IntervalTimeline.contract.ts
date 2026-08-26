/**
 * IntervalTimeline's own contract (INTERVAL_TIMELINE) — the anchor timeline, Phase 1's marquee.
 *
 * Renders `mesh:IntervalSchedule` from Engine P's `mesh:planSchedule`: three nesting levels
 * (group -> phase -> project) with intervals, a nullable risk flag, and a pivot that changes
 * what the top level MEANS without changing the row shape.
 *
 * ── THE FAN-OUT, and it is the thing a field-name list could never carry ────────────────────
 * Under `group_by: "capability"` ONE PROJECT PRODUCES MULTIPLE ROWS — one per
 * CapabilityContribution, each with its own `group_id` and `group_weight`. Under `"initiative"`
 * it produces exactly one. So `project_id` IS NOT UNIQUE in this payload, and a renderer that
 * keys its bars on it will either draw duplicates or dedupe away real contributions the moment
 * someone pivots. **The row key is (group_id, project_id).**
 *
 * That is not a quirk to paper over: the capability pivot is the marquee feature, and the
 * many-to-many is the model being honest. `CapabilityContribution(project, capability, weight)`
 * is the join, and the fan-out is what it looks like when read through a timeline.
 *
 * ── DRAG IS OPTIMISTIC, THE COMMIT IS REFUSABLE ─────────────────────────────────────────────
 * ADR-0042 §3/§4: during a drag only the BAR moves — arrangement is UI-master and legitimately
 * client-side. On drop the op commits, the verbs re-evaluate SERVER-side, and the strips
 * redraw from server rows.
 *
 * The library expresses this natively, which was established by PROTOTYPE and not by reading:
 *   `drag-task`   {id, left, top, width, inProgress}  — the pixel drag. ALLOWED to proceed.
 *   `update-task` {id, task, inProgress?}             — the DATA COMMIT. Intercepted; returning
 *                                                       false leaves the store untouched.
 * The docs' generic example says to intercept `move-task`; that is WRONG here — `move-task`
 * reorders the tree. Recorded because the wrong name is the plausible one.
 *
 * ── WHAT THE RENDERER MUST NOT DO ───────────────────────────────────────────────────────────
 *   - NOT re-derive `risk_flag`. Its VALUE is domain vocabulary that rides the payload; the
 *     renderer styles whatever string arrives and knows none of them (GENERIC-AT-BIRTH). Today
 *     `funding_risk` is the only producer; the component must not learn that.
 *   - NOT infer grouping from the ids. `group_kind` says what the top level means. Guessing
 *     from whether `group_id` looks like an initiative id is how a capability pivot silently
 *     renders as an initiative one.
 *   - NOT treat `"(none)"` as missing data. A project contributing to no capability is an
 *     ANSWER — the coverage gap the demo is partly about — and it arrives with a real
 *     `group_name` saying so.
 */

/** What the top level MEANS. Rev-3 B4's pivot; the value is stated, never inferred. */
export const INTERVAL_TIMELINE_GROUP_KINDS = ["initiative", "capability", "target"] as const;
export type IntervalGroupKind = (typeof INTERVAL_TIMELINE_GROUP_KINDS)[number];

export const INTERVAL_TIMELINE_ROW_REQUIREMENTS = {
  /** A schedule with no rows is a refusal, not an empty answer — unlike DELTA_SET, where
   *  "nothing changed" is meaningful. A plan with nothing in it is a broken scope filter. */
  minRows: 1,
  /** Every row carries a planned interval. `actual_*` is nullable; `planned_*` never is. */
  requiresPlannedInterval: true,
  /** THE ROW KEY. Not `project_id` alone — see the fan-out note in the header. */
  rowKey: ["group_id", "project_id"],
  /** `risk_flag` is upstream vocabulary. Styled, never interpreted. */
  riskFlagIsUpstream: true,
} as const;

export const INTERVAL_TIMELINE_REFUSAL_REASONS = [
  "no scheduled work in scope",
  "row is missing its planned interval",
  "row has an unknown group kind",
] as const;

export const INTERVAL_TIMELINE_CONTRACT = {
  archetype: "INTERVAL_TIMELINE",
  component: "IntervalTimeline",
  layout: "full-width",
  /** ADR-0042 Ruling 9's discriminant. TRUE — a drop re-evaluates the verbs and the strips
   *  redraw, so this card recomputes and refuses anonymous callers. */
  recomputes: true,
  fields: {
    /** The schedule rows. Three levels flattened: group -> phase -> project. */
    rows: { encoding: "array", parsesTo: "array-of-objects", required: true },
    /** Which pivot produced these rows. Stated by the verb; never inferred. */
    group_kind: { type: "string", required: false },
    /**
     * POINT-IN-TIME MARKERS on the same axis — target dates the intervals are read against.
     * OPTIONAL: a schedule has none, a capability path is meaningless without them.
     *
     * WHY THIS IS A FIELD AND NOT A NEW ARCHETYPE. `ContributionSequence` was ruled into this
     * archetype on 2026-08-25 by the instrument that SPLIT the three grids. Those were
     * structurally interchangeable and semantically disjoint — same cells, different meaning
     * of colour (breach/distance/deficit). This is the inverse: structurally different (two
     * nesting levels, not three) but semantically IDENTICAL — position means time, and the
     * reader asks "does this land before the date?" A milestone adds a reference mark to that
     * reading; it does not change what the encoding means.
     *
     * The confirming evidence is that `PlateauTimeline` needs the same field. A property with
     * two consumers is a family property, not a special case — and had this been built as a
     * second timeline archetype, the third one would have made it three.
     */
    milestones: { encoding: "array", parsesTo: "array-of-objects", required: false },
    /** What the schedule was scoped to. Supplied; the renderer invents no framing. */
    scope_label: { type: "string", required: false },
  },
  rowRequirements: INTERVAL_TIMELINE_ROW_REQUIREMENTS,
  refusalReasons: INTERVAL_TIMELINE_REFUSAL_REASONS,
} as const;

export type IntervalTimelineContract = typeof INTERVAL_TIMELINE_CONTRACT;
export type IntervalTimelineRefusal = (typeof INTERVAL_TIMELINE_REFUSAL_REASONS)[number];

export interface IntervalRow {
  group_kind: IntervalGroupKind;
  group_id: string;
  group_name: string;
  /** Only the capability pivot carries a weight; null elsewhere. */
  group_weight: number | null;
  initiative_id: string;
  initiative_name: string;
  phase_id: string;
  phase_name: string;
  phase_sequence: number;
  project_id: string;
  project_name: string;
  planned_start: string;
  planned_end: string;
  actual_start: string | null;
  actual_end: string | null;
  /** Generic styling key. Value rides the payload; the renderer knows none of them. */
  risk_flag: string | null;
}

/**
 * A point-in-time marker drawn on the shared axis.
 *
 * `flag` is COMPUTED UPSTREAM and must not be re-derived from `date` against "now". Whether a
 * marker is in trouble is a judgement about the PLAN's state, not about the reader's clock —
 * a card opened in January and one opened in July must agree, and only the producer knows
 * which state version it evaluated. Re-deriving it here would also silently outrank the
 * producer's refusal to overclaim: a clock comparison says "missed", which is precisely the
 * claim the verb declines to make.
 */
export interface IntervalMilestone {
  milestone_id: string;
  label: string;
  /** ISO date. The mark's position on the same axis the bars use. */
  date: string;
  /** Which group this marker belongs under, or absent for an axis-wide mark. */
  group_id?: string;
  /**
   * GENERIC STYLING KEY, on the same pattern as `risk_flag` on a row: the VALUE is domain
   * vocabulary riding the payload, and this component styles whatever string arrives while
   * knowing none of them.
   *
   * THIS FIELD WAS `overdue?: boolean` FOR ONE DAY, and the producer is why it is not.
   * `plan_capability_path` computes `last contribution end > target date` and its docstring
   * refuses to call that `missed`, because the model holds no per-plateau maturity
   * REQUIREMENT — a capability can reach the maturity an early plateau needs long before its
   * last contributing project finishes. "Overdue" is that same refused claim wearing a
   * different word, and this field was written a day before anyone read the verb that fills
   * it. The producer was right and the contract was the newer, less-informed artifact.
   *
   * Today's only value is `"contributions-outstanding"`. The component must not learn that.
   */
  flag?: string | null;
}

/** The row key, as a function, so no caller re-invents it. See the fan-out note. */
export function intervalRowKey(row: Pick<IntervalRow, "group_id" | "project_id">): string {
  return `${row.group_id}::${row.project_id}`;
}

export function validateIntervalTimeline(
  rows: unknown,
): { kind: "ok"; rows: IntervalRow[] } | { kind: "empty"; reason: IntervalTimelineRefusal } {
  if (!Array.isArray(rows) || rows.length < INTERVAL_TIMELINE_ROW_REQUIREMENTS.minRows) {
    return { kind: "empty", reason: "no scheduled work in scope" };
  }
  const objects = rows.filter((r): r is Record<string, unknown> =>
    typeof r === "object" && r !== null && !Array.isArray(r));
  if (objects.length !== rows.length) {
    return { kind: "empty", reason: "row is missing its planned interval" };
  }
  if (objects.some((r) => !r.planned_start || !r.planned_end)) {
    return { kind: "empty", reason: "row is missing its planned interval" };
  }
  if (objects.some((r) =>
    !INTERVAL_TIMELINE_GROUP_KINDS.includes(r.group_kind as IntervalGroupKind))) {
    return { kind: "empty", reason: "row has an unknown group kind" };
  }
  return { kind: "ok", rows: objects as unknown as IntervalRow[] };
}
