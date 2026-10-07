/**
 * ADR-0055 §2 — the package, assembled. This default export is the whole of what the registry
 * (`src/archetypes/registry.ts`) sees; `defineArchetype` validates it at module-load time.
 *
 * `reads` is `CONTRIBUTION_RANKING_ENVELOPE_FIELDS`, not `row.passthrough` — the interpreter
 * gives the card exactly the 5 fields it reads today, never `verdict`/`method`, which the card
 * does not consume (see `contract.ts`'s note). `valid_as_of`/`state_version` are not part of
 * `reads` either — they are the universal envelope pair, passed explicitly by the dispatch case,
 * same as before this move. That is what keeps this extraction at ZERO visual change.
 */
import { defineArchetype } from "@/archetypes/defineArchetype";
import { ContributionRanking } from "./Card";
import { CONTRIBUTION_RANKING_CONTRACT, CONTRIBUTION_RANKING_ENVELOPE_FIELDS } from "./contract";
import { CONTRIBUTION_RANKING_ABSENCES, CONTRIBUTION_RANKING_FIXTURES } from "./fixtures";
import { CONTRIBUTION_RANKING_ROW } from "./row";

export default defineArchetype({
  id: "CONTRIBUTION_RANKING",
  contract: CONTRIBUTION_RANKING_CONTRACT,
  Card: ContributionRanking,
  row: CONTRIBUTION_RANKING_ROW,
  reads: CONTRIBUTION_RANKING_ENVELOPE_FIELDS,
  absences: CONTRIBUTION_RANKING_ABSENCES,
  fixtures: CONTRIBUTION_RANKING_FIXTURES,
});
