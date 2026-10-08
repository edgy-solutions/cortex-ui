/**
 * ADR-0055 §2 — the package, assembled. This default export is the whole of what the registry
 * (`src/archetypes/registry.ts`) sees; `defineArchetype` validates it at module-load time.
 *
 * `reads` is `MULTI_SERIES_ENVELOPE_FIELDS` — here the whole of the producer's tuple.
 * `valid_as_of`/`state_version` are passed explicitly by the dispatch case, outside `reads`.
 */
import { defineArchetype } from "@/archetypes/defineArchetype";
import { MultiSeries } from "./Card";
import { MULTI_SERIES_CONTRACT, MULTI_SERIES_ENVELOPE_FIELDS } from "./contract";
import { MULTI_SERIES_ABSENCES, MULTI_SERIES_FIXTURES } from "./fixtures";
import { MULTI_SERIES_ROW } from "./row";

export default defineArchetype({
  id: "MULTI_SERIES",
  contract: MULTI_SERIES_CONTRACT,
  Card: MultiSeries,
  row: MULTI_SERIES_ROW,
  reads: MULTI_SERIES_ENVELOPE_FIELDS,
  absences: MULTI_SERIES_ABSENCES,
  fixtures: MULTI_SERIES_FIXTURES,
});
