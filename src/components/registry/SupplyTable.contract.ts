/**
 * SupplyTable's own contract (ASSET_STATE_METRIC).
 *
 * THE FACT A FIELD-NAME LIST COULD NEVER CARRY: **row 0 defines the schema.** The component
 * computes its columns as `Object.keys(data[0])`, so a heterogeneous row set SILENTLY LOSES
 * every column absent from the first row. That is not a rendering preference; it is a
 * constraint on what the backend may send, and it lived only inside the component.
 */

export const SUPPLY_ROW_REQUIREMENTS = {
  /** Fewer than this renders NO_TELEMETRY_DATA_AVAILABLE, not a table. */
  minRows: 1,
  /** Columns come from row 0. Rows must be homogeneous or later columns vanish. */
  schemaFromRowIndex: 0,
  requiresHomogeneousRows: true,
} as const;

export const SUPPLY_REFUSAL_REASONS = [
  "no rows",
] as const;

export const SUPPLY_TABLE_CONTRACT = {
  archetype: "ASSET_STATE_METRIC",
  component: "SupplyTable",
  layout: "full-width",
  fields: {
    /** Record<string, any>[] — arbitrary columns, but see requiresHomogeneousRows. */
    metrics: { encoding: "array", required: true, parsesTo: "array-of-objects" },
    subject_concept: { encoding: "string", required: false },
  },
  rowRequirements: SUPPLY_ROW_REQUIREMENTS,
  refusalReasons: SUPPLY_REFUSAL_REASONS,
} as const;
