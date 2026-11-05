/**
 * ADR-0055 §2 — the package, assembled. cortex-PROPOSED (see `row.ts`): inert until a component
 * with this archetype arrives. `reads` is the whole of the row's passthrough: the card draws all of it.
 */
import { defineArchetype } from "@/archetypes/defineArchetype";
import { FlowDecomposition } from "./Card";
import { FLOW_DECOMPOSITION_CONTRACT, FLOW_DECOMPOSITION_ENVELOPE_FIELDS } from "./contract";
import { FLOW_DECOMPOSITION_ABSENCES, FLOW_DECOMPOSITION_FIXTURES } from "./fixtures";
import { FLOW_DECOMPOSITION_ROW } from "./row";

export default defineArchetype({
  id: "FLOW_DECOMPOSITION",
  contract: FLOW_DECOMPOSITION_CONTRACT,
  Card: FlowDecomposition,
  row: FLOW_DECOMPOSITION_ROW,
  reads: FLOW_DECOMPOSITION_ENVELOPE_FIELDS,
  absences: FLOW_DECOMPOSITION_ABSENCES,
  fixtures: FLOW_DECOMPOSITION_FIXTURES,
});
