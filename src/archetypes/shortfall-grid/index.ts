/**
 * ADR-0055 §2 — the package, assembled. This default export is the whole of what the registry
 * (`src/archetypes/registry.ts`) sees; `defineArchetype` validates it at module-load time.
 *
 * `reads` is `SHORTFALL_GRID_ENVELOPE_FIELDS`, not `row.passthrough` — the card never consumes
 * the envelope `verdict` (its verdict is per cell, `state`). `valid_as_of`/`state_version` are
 * passed explicitly by the dispatch case, outside `reads`, same as CONTRIBUTION_RANKING.
 *
 * `absences` was empty (`noAbsence`, cortex dispatch of 2026-10-08) until #528 (80dcbbae, 2026-11-23): the
 * producer's `data_provenance` sentence is a payload-flippable `data-served-provenance`, so the
 * no-absence claim became false and the package declares that one absence (the seal's own remedy).
 */
import { defineArchetype } from "@/archetypes/defineArchetype";
import { ShortfallGrid } from "./Card";
import { SHORTFALL_GRID_CONTRACT, SHORTFALL_GRID_ENVELOPE_FIELDS } from "./contract";
import { SHORTFALL_GRID_ABSENCES, SHORTFALL_GRID_FIXTURES } from "./fixtures";
import { SHORTFALL_GRID_ROW } from "./row";

export default defineArchetype({
  id: "SHORTFALL_GRID",
  contract: SHORTFALL_GRID_CONTRACT,
  Card: ShortfallGrid,
  row: SHORTFALL_GRID_ROW,
  reads: SHORTFALL_GRID_ENVELOPE_FIELDS,
  absences: SHORTFALL_GRID_ABSENCES,
  fixtures: SHORTFALL_GRID_FIXTURES,
});
