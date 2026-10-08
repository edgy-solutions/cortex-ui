/**
 * ADR-0055 §2 — the package, assembled. This default export is the whole of what the registry
 * (`src/archetypes/registry.ts`) sees; `defineArchetype` validates it at module-load time.
 *
 * `reads` is `VARIANCE_TREE_ENVELOPE_FIELDS`, not `row.passthrough` — the card never consumes
 * the envelope `verdict` (its verdict is per node, `favourable`). `valid_as_of`/`state_version`
 * are passed explicitly by the dispatch case, outside `reads`, same as CONTRIBUTION_RANKING.
 */
import { defineArchetype } from "@/archetypes/defineArchetype";
import { VarianceTree } from "./Card";
import { VARIANCE_TREE_CONTRACT, VARIANCE_TREE_ENVELOPE_FIELDS } from "./contract";
import { VARIANCE_TREE_ABSENCES, VARIANCE_TREE_FIXTURES } from "./fixtures";
import { VARIANCE_TREE_ROW } from "./row";

export default defineArchetype({
  id: "VARIANCE_TREE",
  contract: VARIANCE_TREE_CONTRACT,
  Card: VarianceTree,
  row: VARIANCE_TREE_ROW,
  reads: VARIANCE_TREE_ENVELOPE_FIELDS,
  absences: VARIANCE_TREE_ABSENCES,
  fixtures: VARIANCE_TREE_FIXTURES,
});
