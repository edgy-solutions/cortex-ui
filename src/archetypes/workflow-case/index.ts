import { defineArchetype } from "@/archetypes/defineArchetype";
import { WorkflowCase } from "./Card";
import { WORKFLOW_CASE_CONTRACT } from "./contract";
import { WORKFLOW_CASE_ABSENCES, WORKFLOW_CASE_FIXTURES } from "./fixtures";
import { WORKFLOW_CASE_ROW } from "./row";

export default defineArchetype({
  id: "WORKFLOW_CASE",
  contract: WORKFLOW_CASE_CONTRACT,
  Card: WorkflowCase,
  row: WORKFLOW_CASE_ROW,
  reads: [],
  absences: WORKFLOW_CASE_ABSENCES,
  fixtures: WORKFLOW_CASE_FIXTURES,
});
