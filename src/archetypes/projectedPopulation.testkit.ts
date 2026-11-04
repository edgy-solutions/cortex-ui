/**
 * Every archetype `_project_planning_archetype` can write, spelled here so a test can walk them.
 * `presentationProvenance.producerSeal.test.ts` compares this list to `_PROJECTED_ARCHETYPES` at
 * the pin, so an archetype the producer adds reds there rather than going unwalked. Test-only.
 */
export const PROJECTED_ARCHETYPES = [
  "INTERVAL_TIMELINE",
  "PERIOD_SERIES",
  "COMPETING_MEASURES",
  "STEP_LADDER",
  "THRESHOLD_GRID",
  "MATRIX_GRID",
  "DELTA_SET",
  "CANVAS_SEED",
  "SHORTFALL_GRID",
  "VARIANCE_TREE",
  "CONTRIBUTION_RANKING",
  "FORECAST_MEASURE",
  "MULTI_SERIES",
  "SOURCE_LEDGER",
  "INSTANCES_BY_PROPERTY",
] as const;
