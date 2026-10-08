/**
 * ADR-0055 §2 — the package, assembled. This default export is the whole of what the registry
 * (`src/archetypes/registry.ts`) sees; `defineArchetype` validates it at module-load time.
 *
 * `reads` is `DELTA_SET_ENVELOPE_FIELDS` (all of `row.passthrough`). `valid_as_of`/`state_version`
 * are passed explicitly by the dispatch case, outside `reads`, same as CONTRIBUTION_RANKING.
 *
 * `absences` is EMPTY ON PURPOSE and says so: the cortex dispatch of 2026-10-08 ruled that a
 * package with no absence field is still a package. `noAbsence.test.tsx` holds the claim, and
 * `parity.test.tsx`'s arrival arm re-opens it the day a DELTA_SET capture lands.
 */
import { defineArchetype } from "@/archetypes/defineArchetype";
import { DeltaSet } from "./Card";
import { DELTA_SET_CONTRACT, DELTA_SET_ENVELOPE_FIELDS } from "./contract";
import { DELTA_SET_FIXTURES } from "./fixtures";
import { DELTA_SET_ROW } from "./row";

export default defineArchetype({
  id: "DELTA_SET",
  contract: DELTA_SET_CONTRACT,
  Card: DeltaSet,
  row: DELTA_SET_ROW,
  reads: DELTA_SET_ENVELOPE_FIELDS,
  absences: [],
  noAbsence: {
    reason:
      "no data-* attribute rendered at all across 8 fixtures; no capture exists yet (lot 3 pending " +
      "from Lane 1), so the claim is re-opened by the parity arrival arm when one lands",
  },
  fixtures: DELTA_SET_FIXTURES,
});
