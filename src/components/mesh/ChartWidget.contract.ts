/**
 * ChartWidget's OWN contract — the single home, per the 2026-08-20 amendment to
 * ADR-0017 ("capability registration is the transport; the component is the home").
 *
 * WHY THIS FILE SITS NEXT TO THE COMPONENT AND NOT IN A REGISTRY. The registration
 * payload is ASSEMBLED FROM component exports; it is never authored beside them. A
 * hand-written registration entry is `presentation_agent/capabilities.py`'s ten copied
 * lists moved onto the wire with a registrar's blessing — the same two-masters defect,
 * looking more authoritative. Keeping the contract in the component's own directory
 * makes divergence a file-move away rather than a discipline.
 *
 * WHAT `expected_fields` COULD NOT SAY, and this can. The published capability list
 * carried field NAMES only (`["dataset_id", "metrics", "viz_type"]`). It could not
 * express that `chart_data` is a JSON-ENCODED STRING rather than an array, nor that the
 * rows must contain at least one NUMERIC column, nor that BAR/LINE/PIE additionally
 * require a CATEGORICAL one. Those are the facts that decide whether a payload renders,
 * and they lived only in `normalizeChartData`.
 *
 * THE REQUIREMENT CONSTANTS BELOW ARE CONSUMED BY `normalizeChartData` ITSELF. That is
 * the binding that makes this a home rather than a description: the component cannot
 * enforce a rule this file does not state, because it reads the rule from here.
 */

/** Chart kinds the widget can render. Mirrors ChartWidgetProps["type"]. */
export const CHART_TYPES = ["BAR", "LINE", "PIE", "SCATTER"] as const;
export type ChartType = (typeof CHART_TYPES)[number];

/**
 * Row-shape requirements, enforced by `normalizeChartData`.
 *
 * Column classification is by the FIRST ROW's value type: `number` -> numeric,
 * `string` -> categorical. Booleans, objects and nulls are IGNORED rather than
 * miscategorised — chart_data is not supposed to carry them, and silently dropping is
 * safer than guessing.
 */
export const CHART_ROW_REQUIREMENTS = {
  /** Fewer than this and the widget renders its empty state, not a chart. */
  minRows: 1,
  /** Every chart kind needs at least one numeric column to plot. */
  minNumericColumns: 1,
  /** BAR/LINE/PIE need a categorical column for the x-axis / slice labels. */
  minCategoricalColumnsForCategoricalAxis: 1,
  categoricalAxisTypes: ["BAR", "LINE", "PIE"] as readonly ChartType[],
  /** SCATTER plots numeric-vs-numeric, so it needs two. */
  minNumericColumnsForScatter: 2,
} as const;

/**
 * The refusal vocabulary. Every string here is a reason `normalizeChartData` can return
 * with `kind: "empty"`. Registered so the backend can distinguish "this payload cannot
 * render, and here is which requirement it missed" from a generic failure — the same
 * discipline as the resolver's provider-empty vs not-specific split.
 */
export const CHART_REFUSAL_REASONS = [
  "no rows",
  "rows aren't objects",
  "no numeric column",
  "no categorical column",
  "scatter requires 2 numeric columns (x and y)",
  "no series values in scatter data",
  "JSON parse failure",
  "not an array",
] as const;

/**
 * The exported capability contract. This object IS what the registration payload
 * carries for this archetype — assembled, not retyped.
 */
export const CHART_WIDGET_CONTRACT = {
  archetype: "CHART_WIDGET",
  component: "ChartWidget",
  layout: "full-width",
  fields: {
    chart_data: {
      /**
       * NOT an array. A STRING containing JSON that parses to an array of objects.
       * `ChartWidgetProps["data"]` is `string` and the component calls JSON.parse on it.
       * This is the single most surprising fact in the whole contract and the one a
       * field-name list can never carry.
       */
      encoding: "json-string",
      parsesTo: "array-of-objects",
      required: true,
    },
    chart_type: { type: "enum", values: CHART_TYPES, required: true },
    subject_concept: { type: "string", required: false },
    sql_query: { type: "string", required: false },
  },
  rowRequirements: CHART_ROW_REQUIREMENTS,
  refusalReasons: CHART_REFUSAL_REASONS,
} as const;

export type ChartWidgetContract = typeof CHART_WIDGET_CONTRACT;
