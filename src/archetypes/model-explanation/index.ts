import { defineArchetype } from "@/archetypes/defineArchetype";
import { ModelExplanation } from "./Card";
import { MODEL_EXPLANATION_CONTRACT } from "./contract";
import { MODEL_EXPLANATION_ABSENCES, MODEL_EXPLANATION_FIXTURES } from "./fixtures";
import { MODEL_EXPLANATION_ROW } from "./row";

export default defineArchetype({
  id: "MODEL_EXPLANATION",
  contract: MODEL_EXPLANATION_CONTRACT,
  Card: ModelExplanation,
  row: MODEL_EXPLANATION_ROW,
  reads: [],
  absences: MODEL_EXPLANATION_ABSENCES,
  fixtures: MODEL_EXPLANATION_FIXTURES,
});
