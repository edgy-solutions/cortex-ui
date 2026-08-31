/**
 * FORECAST_MEASURE — ONE forecast value, and the METHOD that produced it.
 *
 * Structural: it draws "this quantity is forecast to land HERE, by THIS named method, which is
 * THIS formula, from THESE inputs." Its first consumer is an estimate at completion; nothing
 * here knows the phrase.
 *
 * ── THE METHOD IS NOT METADATA, AND THAT IS THE WHOLE ARCHETYPE ─────────────────────────────
 *
 * Engine F refuses a bare "what's the EAC" because the three named formulas disagree
 * materially on the same program — on its own seed they span $13.13M, $14.15M and $14.79M
 * against a $12.00M budget, a spread of about 14% of the budget. The producer therefore makes
 * `method` a mandatory slot with NO DEFAULT, and the router refuses by name before the call is
 * made.
 *
 * A CARD THAT DRAWS 14,152,381 WITHOUT "CPI-BASED · EAC = BAC / CPI" UNDOES THAT REFUSAL AT
 * THE LAST STEP. The engine declined to choose silently and the renderer would have chosen
 * silently on its behalf — the reader sees one number, with no way to know that two other
 * defensible numbers exist a million dollars away. So absence of `method` or `formula` is a
 * REFUSAL here too, not a degraded render. The number is not shown at all.
 *
 * That is the one rule this archetype exists to enforce, and it is why it is not
 * ASSET_STATE_METRIC: that binding dispatches to a BAML renderer, an LLM path whose measured
 * cost was 31–59s per card and whose fallback chain begins at an external provider. Routing a
 * program cost forecast through it is the wrong default for real finance data, and it carries
 * no method slot to drop in the first place.
 *
 * ── WHY THE VOCABULARY IS EARNED-VALUE AND NOT INVENTED ────────────────────────────────────
 *
 * `bac`, `bcwp`, `acwp`, `cpi`, `spi` are IPMDAR terms, adopted deliberately by ADR-0045 so an
 * analyst's own phrasing resolves without translation and a real program system maps
 * field-for-field. Renaming them to local synonyms here would build the translation layer that
 * decision exists to avoid. The archetype's NAME stays structural; the field names are the
 * producer's and are read verbatim.
 */

export const FORECAST_MEASURE_ROW_REQUIREMENTS = {
  /** One forecast. A list of them is a series, which is a different archetype. */
  exactlyOneRow: true,
  /**
   * NO METHOD, NO NUMBER. Not a degraded render — a refusal, for the reason in the header.
   * This is the field the producer made mandatory; the renderer must not be the place it
   * becomes optional again.
   */
  methodIsMandatory: true,
  /** `vac` and `etc` are COMPUTED UPSTREAM. Two places subtracting is two places to disagree. */
  derivationsAreUpstream: true,
} as const;

export const FORECAST_MEASURE_REFUSAL_REASONS = [
  "no forecast row recorded",
  "forecast carries no method — the number alone is ambiguous",
  "forecast carries no value",
] as const;

export const FORECAST_MEASURE_CONTRACT = {
  archetype: "FORECAST_MEASURE",
  component: "ForecastMeasure",
  layout: "full-width",
  /**
   * ADR-0042 Ruling 9's discriminant. TRUE: a forecast is a function of performance reported
   * so far, and more reported periods move it. Re-evaluating gives a different, better number
   * — which is exactly what a live view is.
   */
  recomputes: true,
  fields: {
    /**
     * ONE row: program_id, program_name, method, formula, eac, vac, etc, bac, bcws, bcwp,
     * acwp, cpi, spi, percent_complete, as_of_period, reported_periods.
     */
    rows: { encoding: "array", parsesTo: "array-of-objects", required: true },
    /** The unit the amounts are in. Absent means silent — see PeriodSeries.contract.ts. */
    value_unit: { type: "string", required: false },
    scope_label: { type: "string", required: false },
  },
  rowRequirements: FORECAST_MEASURE_ROW_REQUIREMENTS,
  refusalReasons: FORECAST_MEASURE_REFUSAL_REASONS,
} as const;

export type ForecastMeasureContract = typeof FORECAST_MEASURE_CONTRACT;
export type ForecastMeasureRefusal = (typeof FORECAST_MEASURE_REFUSAL_REASONS)[number];

/** The forecast, as the producer states it. Every field read verbatim, none re-derived. */
export interface ForecastRow {
  program_id?: string;
  program_name?: string;
  /** The named method. MANDATORY — see the header. */
  method: string;
  /** The formula that method applies, stated by the producer beside the number it produced. */
  formula: string;
  /** The forecast itself. */
  eac: number;
  /** Budget minus forecast. COMPUTED UPSTREAM. Negative means the forecast exceeds budget. */
  vac?: number;
  /** Forecast cost of the work remaining. COMPUTED UPSTREAM. */
  etc?: number;
  bac?: number;
  bcws?: number;
  bcwp?: number;
  acwp?: number;
  cpi?: number;
  spi?: number;
  percent_complete?: number;
  as_of_period?: string | null;
  /**
   * How many periods actually reported performance. NOT decoration: a forecast projected from
   * one reported period and one projected from twelve are different claims wearing the same
   * number, and only this says which.
   */
  reported_periods?: number;
}

export function validateForecastMeasure(
  rows: unknown,
): { kind: "ok"; row: ForecastRow } | { kind: "empty"; reason: ForecastMeasureRefusal } {
  if (!Array.isArray(rows) || rows.length === 0) {
    return { kind: "empty", reason: "no forecast row recorded" };
  }
  const r = rows[0];
  if (typeof r !== "object" || r === null || Array.isArray(r)) {
    return { kind: "empty", reason: "no forecast row recorded" };
  }
  const row = r as Record<string, unknown>;
  // METHOD FIRST, before the value is even looked at. The order is the point: there is no
  // state in which this renders a number and omits how it was reached.
  const method = typeof row.method === "string" ? row.method.trim() : "";
  const formula = typeof row.formula === "string" ? row.formula.trim() : "";
  if (!method || !formula) {
    return { kind: "empty", reason: "forecast carries no method — the number alone is ambiguous" };
  }
  if (typeof row.eac !== "number" || !Number.isFinite(row.eac)) {
    return { kind: "empty", reason: "forecast carries no value" };
  }
  return { kind: "ok", row: row as unknown as ForecastRow };
}
