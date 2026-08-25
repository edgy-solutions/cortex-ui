/**
 * PeriodSeries' own contract (PERIOD_SERIES) — the first planning renderer.
 *
 * WHY THIS FILE EXISTS BEFORE THE WIDGET IT DESCRIBES IS FINISHED. Probed 2026-08-21 against
 * the live selector: a planning cost series (`[{period, total}]`) sent with
 * `output_uri: mesh:PeriodCostSeries` was **absorbed by CHART_WIDGET**, with
 * `presentation_source: "registered"` and `selection_basis: "payload-only (output_uri matched
 * no capability)"`. `select_presentation` treats `output_uri` as a HINT, so a miss widens the
 * search to the whole menu, and a period/total series satisfies the chart contract.
 *
 * The card drew. It looked plausible. It was the wrong archetype.
 *
 * So a contract is not a tidying step that follows a widget — it is what makes the widget
 * ADDRESSABLE. Until this file is registered, every planning payload of this shape is
 * absorbed by whatever else happens to fit. See ADR-0042 §5's 2026-08-21 amendment.
 *
 * WHAT A FIELD-NAME LIST COULD NEVER CARRY, and this can:
 *   - `cap` is NULLABLE and null means UNCAPPED, not zero. A zero cap paints every uncapped
 *     period red. The engine already refuses to default it; the contract says why, so a
 *     future payload-shaper cannot "helpfully" coalesce it.
 *   - the series is ORDERED and the order is the fiscal calendar's, not the array's. A
 *     renderer that trusts array order will draw FY27-Q1 before FY26-Q3 the moment a caller
 *     filters periods.
 *   - `over_cap` is COMPUTED UPSTREAM and must not be re-derived here. Two places computing
 *     "is this over the line" is two places to disagree about `>` versus `>=`, and the
 *     threshold semantics belong to governance, not to a chart.
 */

/** Both funding kinds are stacked; the split is the answer to "capex or expense?" (Q17). */
export const PERIOD_SERIES_KINDS = ["capex", "expense"] as const;

export const PERIOD_SERIES_ROW_REQUIREMENTS = {
  /** Fewer than this renders the deliberate-empty state, not an axis with no bars. */
  minRows: 1,
  /** Every row must name its period — the x-axis is categorical and has no fallback. */
  requiresPeriodLabel: true,
  /**
   * Rows arrive in fiscal order and are drawn in the order given. The renderer does NOT
   * sort: it cannot, because it does not know the fiscal calendar and inventing one here
   * would be a second place for the convention to live.
   */
  trustsRowOrder: true,
  /**
   * `cap` may be null on any row and null means "no cap recorded". NEVER coalesce to 0.
   */
  capIsNullable: true,
  /** `over_cap` and `overage` are computed by the verb. Re-deriving them here is forbidden. */
  overCapIsUpstream: true,
} as const;

/**
 * The refusal vocabulary — reasons THIS COMPONENT can emit when a payload cannot draw.
 *
 * NOT PUBLISHED HERE, deliberately: `live_view_requires_registration`. That refusal fires in
 * `select_presentation` at menu-scoping time, before any payload is evaluated, so this
 * component can never emit it. Publishing an unemittable reason makes the backend wait on a
 * discriminant that never arrives — the defect `ChartWidget.contract.ts` records for its
 * unreachable scatter branch, and the reason ADR-0042 Ruling 9 puts that refusal in the
 * `presentation_source` vocabulary instead.
 */
export const PERIOD_SERIES_REFUSAL_REASONS = [
  "no periods",
  "row is missing its period label",
  "no numeric amount on any row",
] as const;

export const PERIOD_SERIES_CONTRACT = {
  archetype: "PERIOD_SERIES",
  component: "PeriodSeries",
  layout: "full-width",
  /**
   * ADR-0042 Ruling 9. The selector reads this to decide what an ANONYMOUS caller asking for
   * a live view gets: a labelled refusal, not a best-effort render. A one-shot answer's
   * mis-render is bounded — once, one payload; a subscription's COMPOUNDS for as long as it
   * lives, which is why the two are treated differently.
   *
   * It is a contract FIELD, like `layout` — a fact about the component — and emphatically not
   * a refusal reason, which is a fact about a payload.
   */
  recomputes: true,
  fields: {
    /** The ordered series. Each row: period, capex, expense, total, cap, over_cap, overage —
     *  plus an optional nested `baseline`, see PeriodSeriesRow. */
    rows: { encoding: "array", parsesTo: "array-of-objects", required: true },
    /** Echoed so the card can label its own scope without a second lookup. */
    scope_label: { type: "string", required: false },
    /**
     * THE UNIT THE NUMBERS ARE IN, declared by the producer and NEVER inferred here.
     *
     * `total` is dollars in this payload and a count in `plan_site_load`, so a renderer that
     * guessed money-ness from a field name would be right until it wasn't. ABSENT MEANS
     * SILENT: with no `value_unit` the axis reads `1.5M` — correct, just not money-flavoured
     * — rather than inventing a `$` the payload never sent.
     *
     * Producer side: `measures.VALUE_UNIT`, attached to the response envelope.
     */
    value_unit: { type: "string", required: false },
  },
  rowRequirements: PERIOD_SERIES_ROW_REQUIREMENTS,
  refusalReasons: PERIOD_SERIES_REFUSAL_REASONS,
} as const;

export type PeriodSeriesContract = typeof PERIOD_SERIES_CONTRACT;

/**
 * THE BASELINE SERIES — the ghost bars, and its three invariants live HERE because this file
 * is the mirror both sides project from.
 *
 * 1. **ABSENT, NOT NULL, when the card is not a comparison.** A `baseline: null` on every row
 *    would tell the renderer a comparison EXISTS and is empty; the key's absence says the card
 *    is not a comparison at all. The ghost's presence keys on the key's presence — so a
 *    renderer must test `"baseline" in row`, never `row.baseline != null`.
 * 2. **ALL ROWS OR NO ROWS.** A payload where some periods carry it and some do not would draw
 *    a ghost that appears and vanishes across the axis. The producer emits it for every row in
 *    a comparison scope.
 * 3. **NESTED, because the three numbers move together.** As three sibling columns
 *    (`baseline_total`, `baseline_capex`, `baseline_expense`) the "add or drop them as one"
 *    rule would live in a convention nobody enforces. One object cannot half-arrive.
 *
 * WHAT PRODUCES IT: `plan_cost_curve(state, baseline_state=…)`, resolved at the route from the
 * store when `state_ref` names a scenario. It is the diff machinery reaching this payload —
 * `plan_diff` pairs periods the same way — rather than a bolt-on column.
 *
 * WHAT WILL NOT MOVE IT: a bare project drag. Funding requirements are period-keyed and never
 * re-derived from a project's interval, so `MoveProject` alone leaves both series identical
 * and the ghost renders exactly behind its own bar. A visible cost comparison needs a funding
 * op (`set_cost`) in the scenario.
 */
export interface PeriodSeriesBaseline {
  capex: number;
  expense: number;
  total: number;
}

/** One row of the series, as the verb emits it. */
export interface PeriodSeriesRow {
  period: string;
  capex: number;
  expense: number;
  total: number;
  /** null means UNCAPPED. Not zero. See capIsNullable. */
  cap: number | null;
  over_cap: boolean;
  /** null unless over_cap. */
  overage: number | null;
  /**
   * The ghost. ABSENT — not null — when the card is not a comparison. See
   * PeriodSeriesBaseline for the three invariants a renderer must honour.
   */
  baseline?: PeriodSeriesBaseline;
}

export type PeriodSeriesRefusal = (typeof PERIOD_SERIES_REFUSAL_REASONS)[number];

/**
 * The acceptance check, and it is the BINDING that makes this file a home rather than a
 * description: the component cannot enforce a rule this file does not state, because it reads
 * the rule from here. Mirrors `normalizeChartData`'s relationship to its own contract.
 */
export function validatePeriodSeries(
  rows: unknown,
): { kind: "ok"; rows: PeriodSeriesRow[] } | { kind: "empty"; reason: PeriodSeriesRefusal } {
  if (!Array.isArray(rows) || rows.length < PERIOD_SERIES_ROW_REQUIREMENTS.minRows) {
    return { kind: "empty", reason: "no periods" };
  }
  const objects = rows.filter((r): r is Record<string, unknown> =>
    typeof r === "object" && r !== null && !Array.isArray(r));
  if (objects.length !== rows.length) {
    return { kind: "empty", reason: "row is missing its period label" };
  }
  if (objects.some((r) => typeof r.period !== "string" || r.period.length === 0)) {
    return { kind: "empty", reason: "row is missing its period label" };
  }
  // "no numeric amount on ANY row" — a series of all-zero periods is legitimate data (a
  // quarter with nothing planned), so this refuses only when no row carries a number at all,
  // which means the payload is not a cost series.
  const hasNumber = objects.some(
    (r) => typeof r.total === "number" || typeof r.capex === "number" || typeof r.expense === "number",
  );
  if (!hasNumber) {
    return { kind: "empty", reason: "no numeric amount on any row" };
  }
  return { kind: "ok", rows: objects as unknown as PeriodSeriesRow[] };
}
