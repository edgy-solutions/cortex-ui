/**
 * MatrixGrid's own contract (MATRIX_GRID) — the third planning renderer.
 *
 * Rows × columns of a LEVEL against a TARGET, with the provenance of when each cell was
 * assessed and by whom. Structural: it draws "these things, across these things, at a level
 * versus a goal." Its first consumer is capability maturity by site; nothing here knows that.
 *
 * WHY THIS IS NOT THRESHOLD_GRID, and the distinction is load-bearing rather than cosmetic.
 * A threshold grid asks *is this over a line* — the answer is a breach, and the line belongs
 * to the subject. A matrix grid asks *how far from the goal* — the answer is a DISTANCE, and
 * the goal is per cell because different sites are held to different targets for the same
 * capability. Collapsing them would force one renderer to mean both, and the colour ramp
 * alone would have to serve "danger" and "progress", which are opposite readings of the same
 * hue. Two archetypes, because they answer two questions.
 *
 * THE FACT A FIELD-NAME LIST COULD NOT CARRY — a cell that was NEVER ASSESSED is ABSENT, and
 * absent is not level 0. "We have never measured this" and "we measured this and it is at
 * zero" are different facts with different next actions (go assess it / go fix it), and a
 * grid that renders both as an empty-looking cell has destroyed the distinction. The verb
 * already declines to emit the unassessed cell; this is the clause that stops a renderer
 * backfilling it.
 *
 * ASSESSMENT PROVENANCE IS PART OF THE PAYLOAD, not decoration. A maturity level with no
 * as-of date is a number with no shelf life, and a room reading a two-year-old assessment as
 * current is the failure this whole model's append-only history exists to prevent.
 */

export const MATRIX_GRID_ROW_REQUIREMENTS = {
  /** Fewer than this renders the deliberate-empty state, not an empty matrix. */
  minCells: 1,
  /** Every cell names both axes — categorical, no fallback. */
  requiresRowAndColumn: true,
  /** The target is PER CELL: different subjects are held to different goals. */
  targetIsPerCell: true,
  /** Never assessed => ABSENT. Never backfilled as level 0. */
  absentCellsAreNotZero: true,
  /** `gap` is computed by the verb; re-deriving it here is a second place to disagree. */
  gapIsUpstream: true,
} as const;

/**
 * Reasons THIS COMPONENT can emit. `live_view_requires_registration` is deliberately absent:
 * the SELECTOR emits that at menu-scoping time and this component never reaches it
 * (ADR-0042 Ruling 9).
 */
export const MATRIX_GRID_REFUSAL_REASONS = [
  "no cells",
  "cell is missing its row or column",
  "no cell carries a numeric level",
] as const;

export const MATRIX_GRID_CONTRACT = {
  archetype: "MATRIX_GRID",
  component: "MatrixGrid",
  layout: "full-width",
  /** ADR-0042 Ruling 9's discriminant — a contract FIELD, never a refusal reason. */
  recomputes: true,
  fields: {
    /** Cells: row_id, column_id, level, target_level, gap, assessed_at, assessed_by. */
    rows: { encoding: "array", parsesTo: "array-of-objects", required: true },
    /** What the level MEANS. Supplied by the payload; the renderer invents no scale. */
    level_label: { type: "string", required: false },
    scope_label: { type: "string", required: false },
    /** The as-of the caller asked for, echoed so the card can say what it is showing. */
    as_of: { type: "string", required: false },
  },
  rowRequirements: MATRIX_GRID_ROW_REQUIREMENTS,
  refusalReasons: MATRIX_GRID_REFUSAL_REASONS,
} as const;

export type MatrixGridContract = typeof MATRIX_GRID_CONTRACT;

export interface MatrixCell {
  row_id: string;
  row_name?: string;
  column_id: string;
  column_name?: string;
  level: number;
  /** THIS cell's goal. Per cell, never per grid. */
  target_level: number;
  /** target - level. Computed upstream. */
  gap: number;
  assessed_at?: string;
  assessed_by?: string;
  /** How many assessments stand behind this cell — 1 means no trajectory exists yet. */
  assessment_count?: number;
}

export type MatrixGridRefusal = (typeof MATRIX_GRID_REFUSAL_REASONS)[number];

export function validateMatrixGrid(
  rows: unknown,
): { kind: "ok"; cells: MatrixCell[] } | { kind: "empty"; reason: MatrixGridRefusal } {
  if (!Array.isArray(rows) || rows.length < MATRIX_GRID_ROW_REQUIREMENTS.minCells) {
    return { kind: "empty", reason: "no cells" };
  }
  const objects = rows.filter((r): r is Record<string, unknown> =>
    typeof r === "object" && r !== null && !Array.isArray(r));
  if (objects.length !== rows.length) {
    return { kind: "empty", reason: "cell is missing its row or column" };
  }
  const named = objects.every(
    (r) => typeof r.row_id === "string" && r.row_id.length > 0
        && typeof r.column_id === "string" && r.column_id.length > 0,
  );
  if (!named) return { kind: "empty", reason: "cell is missing its row or column" };

  if (!objects.some((r) => typeof r.level === "number")) {
    return { kind: "empty", reason: "no cell carries a numeric level" };
  }
  return { kind: "ok", cells: objects as unknown as MatrixCell[] };
}

/**
 * Axes derived from the cells, NOT from a payload field — the same reasoning as
 * THRESHOLD_GRID: a pair with no cell never enters the product, so the gap stays a gap and
 * nothing invites the renderer to fill the intersection.
 */
export function matrixAxes(cells: MatrixCell[]): { rows: string[]; columns: string[] } {
  const rows: string[] = [];
  const columns: string[] = [];
  for (const c of cells) {
    if (!rows.includes(c.row_id)) rows.push(c.row_id);
    if (!columns.includes(c.column_id)) columns.push(c.column_id);
  }
  return { rows, columns };
}
