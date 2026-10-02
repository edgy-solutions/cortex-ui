/**
 * ADR-0055 §2 — the package, assembled. This default export is the whole of what the registry
 * (`src/archetypes/registry.ts`) sees; `defineArchetype` validates it at module-load time.
 *
 * `reads` is `COMPETING_MEASURES_ENVELOPE_FIELDS`, not `row.passthrough` — the interpreter gives
 * the card exactly the 10 fields it reads today, never `lowest_eac` / `highest_eac` / `verdict` /
 * `value_label`, which the card does not consume (see `contract.ts`'s `readField` alias note).
 * That is what keeps this extraction at ZERO visual change.
 */
import { defineArchetype } from "@/archetypes/defineArchetype";
import { CompetingMeasures } from "./Card";
import { COMPETING_MEASURES_CONTRACT, COMPETING_MEASURES_ENVELOPE_FIELDS } from "./contract";
import { COMPETING_MEASURES_ABSENCES, COMPETING_MEASURES_FIXTURES } from "./fixtures";
import { COMPETING_MEASURES_ROW } from "./row";

export default defineArchetype({
  id: "COMPETING_MEASURES",
  contract: COMPETING_MEASURES_CONTRACT,
  Card: CompetingMeasures,
  row: COMPETING_MEASURES_ROW,
  reads: COMPETING_MEASURES_ENVELOPE_FIELDS,
  absences: COMPETING_MEASURES_ABSENCES,
  fixtures: COMPETING_MEASURES_FIXTURES,
});
