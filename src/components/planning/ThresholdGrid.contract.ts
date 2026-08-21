/**
 * ThresholdGrid's own contract (THRESHOLD_GRID) — the second planning renderer.
 *
 * A grid of subject × period cells, each carrying a measured value against a threshold THAT
 * SUBJECT OWNS. Structural, not domain: it draws "these things, over these periods, against
 * their own lines." Its first consumer is site change-load; nothing here knows that.
 *
 * THE FACT THAT MAKES THIS A CONTRACT AND NOT A DESCRIPTION — the threshold is PER CELL, not
 * per grid. A grid-level threshold is the obvious simplification and it is wrong: thresholds
 * are governance judgements attached to the subject (one site absorbs more concurrent change
 * than another), so one line across the grid would paint the tolerant subject red and the
 * fragile one green. A renderer that hoists it to a prop cannot be fixed later without
 * re-reading every payload that relied on the old meaning.
 *
 * ABSENCE IS NOT ZERO, and the contract says so where a field-name list could not. A subject
 * with no activity in a period emits NO CELL. The renderer must render that gap as empty, not
 * as 0 — a 0.0 in a heat grid reads as "measured, and fine", which is a different claim from
 * "nothing was happening." The verb already refuses to emit the zero row; this is the clause
 * that stops a well-meaning renderer from filling it back in.
 */

export const THRESHOLD_GRID_ROW_REQUIREMENTS = {
  /** Fewer than this renders the deliberate-empty state, not an axis with no cells. */
  minCells: 1,
  /** Every cell names its subject and its period — both axes are categorical, no fallback. */
  requiresSubjectAndPeriod: true,
  /**
   * The threshold rides on the CELL. See the header: hoisting it to the grid is the
   * simplification that silently mis-colours every subject whose line differs.
   */
  thresholdIsPerCell: true,
  /** `over_threshold` is computed by the verb. Re-deriving it here is forbidden — two places
   *  computing "over the line" is two places to disagree about > versus >=. */
  overThresholdIsUpstream: true,
  /** A subject/period with no activity is ABSENT. Never backfilled as 0. */
  absentCellsAreNotZero: true,
} as const;

/**
 * Reasons THIS COMPONENT can emit. Not published here, deliberately:
 * `live_view_requires_registration` — the SELECTOR emits that at menu-scoping time and this
 * component can never reach it (ADR-0042 Ruling 9). Publishing an unemittable reason leaves
 * the backend waiting on a discriminant that never arrives.
 */
export const THRESHOLD_GRID_REFUSAL_REASONS = [
  "no cells",
  "cell is missing its subject or period",
  "no cell carries a numeric value",
] as const;

export const THRESHOLD_GRID_CONTRACT = {
  archetype: "THRESHOLD_GRID",
  component: "ThresholdGrid",
  layout: "full-width",
  /** ADR-0042 Ruling 9's discriminant — a contract FIELD, never a refusal reason. */
  recomputes: true,
  fields: {
    /** Cells: subject_id, subject_name, period, value, threshold, over_threshold, contributors. */
    rows: { encoding: "array", parsesTo: "array-of-objects", required: true },
    /** What the value MEANS. Supplied by the payload — the renderer never invents a unit. */
    value_label: { type: "string", required: false },
    scope_label: { type: "string", required: false },
  },
  rowRequirements: THRESHOLD_GRID_ROW_REQUIREMENTS,
  refusalReasons: THRESHOLD_GRID_REFUSAL_REASONS,
} as const;

export type ThresholdGridContract = typeof THRESHOLD_GRID_CONTRACT;

export interface ThresholdCell {
  subject_id: string;
  subject_name?: string;
  period: string;
  value: number;
  /** THIS subject's line. Per cell, never per grid. */
  threshold: number;
  over_threshold: boolean;
  /** What made up the value — the answer to "why is this cell red". */
  contributors?: string[];
}

export type ThresholdGridRefusal = (typeof THRESHOLD_GRID_REFUSAL_REASONS)[number];

export function validateThresholdGrid(
  rows: unknown,
): { kind: "ok"; cells: ThresholdCell[] } | { kind: "empty"; reason: ThresholdGridRefusal } {
  if (!Array.isArray(rows) || rows.length < THRESHOLD_GRID_ROW_REQUIREMENTS.minCells) {
    return { kind: "empty", reason: "no cells" };
  }
  const objects = rows.filter((r): r is Record<string, unknown> =>
    typeof r === "object" && r !== null && !Array.isArray(r));
  if (objects.length !== rows.length) {
    return { kind: "empty", reason: "cell is missing its subject or period" };
  }
  const named = objects.every(
    (r) => typeof r.subject_id === "string" && r.subject_id.length > 0
        && typeof r.period === "string" && r.period.length > 0,
  );
  if (!named) return { kind: "empty", reason: "cell is missing its subject or period" };

  if (!objects.some((r) => typeof r.value === "number")) {
    return { kind: "empty", reason: "no cell carries a numeric value" };
  }
  return { kind: "ok", cells: objects as unknown as ThresholdCell[] };
}

/**
 * Axes, derived from the cells and NOT from a separate payload field.
 *
 * Deriving them is what keeps absence honest: a subject/period pair with no cell simply never
 * enters the axis product, so the grid shows a gap. A payload-supplied axis list would invite
 * the renderer to fill the intersection, which is the backfilled-zero this contract forbids.
 * Period order is the payload's order, deduplicated — the renderer does not know the fiscal
 * calendar and must not invent one.
 */
export function gridAxes(cells: ThresholdCell[]): { subjects: string[]; periods: string[] } {
  const periods: string[] = [];
  const subjects: string[] = [];
  for (const c of cells) {
    if (!periods.includes(c.period)) periods.push(c.period);
    if (!subjects.includes(c.subject_id)) subjects.push(c.subject_id);
  }
  return { subjects, periods };
}
