import { defineArchetype } from "@/archetypes/defineArchetype";
import { Illustration } from "./Card";
import { ILLUSTRATION_CONTRACT } from "./contract";
import { ILLUSTRATION_ABSENCES, ILLUSTRATION_FIXTURES } from "./fixtures";
import { ILLUSTRATION_ROW } from "./row";

export default defineArchetype({
  id: "ILLUSTRATION",
  contract: ILLUSTRATION_CONTRACT,
  Card: Illustration,
  row: ILLUSTRATION_ROW,
  reads: [],
  absences: ILLUSTRATION_ABSENCES,
  fixtures: ILLUSTRATION_FIXTURES,
});
