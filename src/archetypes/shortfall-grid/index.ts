/**
 * ADR-0055 §2 — the package, assembled. This default export is the whole of what the registry
 * (`src/archetypes/registry.ts`) sees; `defineArchetype` validates it at module-load time.
 *
 * `reads` is `SHORTFALL_GRID_ENVELOPE_FIELDS`, not `row.passthrough` — the card never consumes
 * the envelope `verdict` (its verdict is per cell, `state`). `valid_as_of`/`state_version` are
 * passed explicitly by the dispatch case, outside `reads`, same as CONTRIBUTION_RANKING.
 *
 * `absences` is EMPTY ON PURPOSE and says so: the cortex dispatch of 2026-10-08 ruled that a
 * package with no absence field is still a package. `noAbsence.test.tsx` holds the claim.
 */
import { defineArchetype } from "@/archetypes/defineArchetype";
import { ShortfallGrid } from "./Card";
import { SHORTFALL_GRID_CONTRACT, SHORTFALL_GRID_ENVELOPE_FIELDS } from "./contract";
import { SHORTFALL_GRID_FIXTURES } from "./fixtures";
import { SHORTFALL_GRID_ROW } from "./row";

export default defineArchetype({
  id: "SHORTFALL_GRID",
  contract: SHORTFALL_GRID_CONTRACT,
  Card: ShortfallGrid,
  row: SHORTFALL_GRID_ROW,
  reads: SHORTFALL_GRID_ENVELOPE_FIELDS,
  absences: [],
  noAbsence: {
    reason:
      "no payload-flippable data-* across 10 fixtures + 1 capture; data-cell-inspector appears " +
      "only on click (ADR-0055 amendment 2026-09-18 §1)",
  },
  fixtures: SHORTFALL_GRID_FIXTURES,
});
