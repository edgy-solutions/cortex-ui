/**
 * ShortfallGrid's own contract (SHORTFALL_GRID) — subjects × periods, secured against needed.
 *
 * Structural: it draws "these parties, across these periods, have committed THIS much of what
 * they owe." Its first consumer is org funding gaps; nothing here knows that word.
 *
 * ── WHY THIS IS NOT `THRESHOLD_GRID`, AND NOT `MATRIX_GRID` ─────────────────────────────────
 *
 * Both were read against the real payload before this file was written, and each fails on the
 * SAME axis — what its colour ramp means — which is the distinction MatrixGrid's own contract
 * already draws between itself and ThresholdGrid.
 *
 *   THRESHOLD_GRID asks *is this OVER a line* — a breach, read as danger. Its cell is
 *   `{value, threshold, over_threshold}`, and its component reads exactly those three. A
 *   shortfall is the INVERSE: the bad case is committed BELOW required, so `over_threshold`
 *   would have to carry `true` for "under". A field that means the opposite of its name is the
 *   borrowed-name defect in miniature, and the renderer styling it red would be right for the
 *   wrong reason.
 *
 *   MATRIX_GRID asks *how far from the GOAL* — a distance, read as PROGRESS. Structurally it
 *   fits (`{row_id, column_id, level, target_level, gap}` maps cleanly), but a funding
 *   shortfall is a DEFICIT read as RISK, not a distance read as progress. Binding would also
 *   force the producer to rename money to `level`/`target_level` — a borrowed name in the
 *   other direction — and would drop `secured` and `at_risk`.
 *
 * ── WHY `secured` AND `at_risk` ARE NOT DROPPABLE, even though they look droppable ──────────
 *
 * MEASURED on the current seed: `committed == secured` on every row, and `at_risk == gap`
 * wherever it is non-zero. So today they carry no independent information, and an archetype
 * that discarded them would lose nothing OBSERVABLE.
 *
 * They stay because `FundingCommitment.status` models `pending | committed | approved`. The
 * degeneracy is a property of THIS SEED, not of the model — one pending commitment and
 * `committed` diverges from `secured`, at which point the card must be able to say "this party
 * has pledged enough, but not all of it is firm." That is a different sentence from "this party
 * is short", and a room deciding who to chase needs the difference.
 *
 * Dropping a field because today's data makes it redundant is the evacuated-population error:
 * the check passes over a population that happens to be uniform.
 */

/** What a cell's verdict can be. Structural — no money words, no domain vocabulary. */
export const SHORTFALL_STATES = ["met", "short", "pledged-not-firm"] as const;
export type ShortfallState = (typeof SHORTFALL_STATES)[number];

export const SHORTFALL_GRID_ROW_REQUIREMENTS = {
  /** A grid with no cells has nothing to compare. */
  minRows: 1,
  /**
   * A cell with no requirement is ABSENT, never a zero-need cell. "Nobody owes anything here"
   * and "somebody owes zero here" are different claims, and only the second is a measurement.
   * Same rule MatrixGrid states for never-assessed cells, for the same reason.
   */
  absentIsNotZero: true,
  /** `shortfall` is COMPUTED UPSTREAM. Two places subtracting is two places to disagree. */
  shortfallIsUpstream: true,
} as const;

export const SHORTFALL_GRID_REFUSAL_REASONS = [
  "no funding rows recorded",
  "cell is missing its subject",
  "cell has no required amount",
] as const;

export const SHORTFALL_GRID_CONTRACT = {
  archetype: "SHORTFALL_GRID",
  component: "ShortfallGrid",
  layout: "full-width",
  /** ADR-0042 Ruling 9's discriminant — a contract FIELD, never a refusal reason. */
  recomputes: true,
  fields: {
    /** Cells: subject_id, subject_name, period, required, committed, secured, shortfall, state. */
    rows: { encoding: "array", parsesTo: "array-of-objects", required: true },
    /** What the amounts MEAN. Supplied; the renderer invents no unit. */
    value_label: { type: "string", required: false },
    /** The unit the amounts are in. Absent means silent — see PeriodSeries.contract.ts. */
    value_unit: { type: "string", required: false },
    scope_label: { type: "string", required: false },
  },
  rowRequirements: SHORTFALL_GRID_ROW_REQUIREMENTS,
  refusalReasons: SHORTFALL_GRID_REFUSAL_REASONS,
} as const;

export type ShortfallGridContract = typeof SHORTFALL_GRID_CONTRACT;
export type ShortfallGridRefusal = (typeof SHORTFALL_GRID_REFUSAL_REASONS)[number];

/**
 * One cell. THREE QUANTITIES, not two — which is the whole reason this archetype exists.
 *
 * `required` is what is owed, `committed` is what has been pledged, `secured` is the firm
 * subset of that pledge. A renderer showing only required-vs-committed cannot distinguish a
 * party that is short from one that has pledged enough on paper.
 */
export interface ShortfallCell {
  subject_id: string;
  subject_name: string;
  period: string;
  required: number;
  committed: number;
  /** The FIRM subset of `committed`. Equals it whenever nothing is pending. */
  secured: number;
  /** required − committed, floored at zero. COMPUTED UPSTREAM, never re-derived here. */
  shortfall: number;
  /** The verdict, stated by the producer. A renderer must not infer it from the numbers —
   *  "pledged-not-firm" is invisible to any comparison of required against committed. */
  state: ShortfallState;
}

export function validateShortfallGrid(
  rows: unknown,
): { kind: "ok"; rows: ShortfallCell[] } | { kind: "empty"; reason: ShortfallGridRefusal } {
  if (!Array.isArray(rows) || rows.length < SHORTFALL_GRID_ROW_REQUIREMENTS.minRows) {
    return { kind: "empty", reason: "no funding rows recorded" };
  }
  const cells = rows.filter((r): r is Record<string, unknown> =>
    typeof r === "object" && r !== null && !Array.isArray(r));
  if (cells.length !== rows.length) {
    return { kind: "empty", reason: "cell is missing its subject" };
  }
  if (cells.some((c) => typeof c.subject_id !== "string" || !c.subject_id)) {
    return { kind: "empty", reason: "cell is missing its subject" };
  }
  if (cells.some((c) => typeof c.required !== "number")) {
    return { kind: "empty", reason: "cell has no required amount" };
  }
  return { kind: "ok", rows: cells as unknown as ShortfallCell[] };
}
