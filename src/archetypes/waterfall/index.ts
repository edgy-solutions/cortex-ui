/**
 * The WATERFALL package, assembled. cortex-PROPOSED (see `row.ts`). NOT advertised on the
 * capability menu until invincible-agent #553 is deployed (see `advertise.test.ts`).
 */
import { defineArchetype } from "@/archetypes/defineArchetype";
import { Waterfall } from "./Card";
import { WATERFALL_CONTRACT, WATERFALL_ENVELOPE_FIELDS } from "./contract";
import { WATERFALL_ABSENCES, WATERFALL_FIXTURES } from "./fixtures";
import { WATERFALL_ROW } from "./row";

export default defineArchetype({
  id: "WATERFALL",
  contract: WATERFALL_CONTRACT,
  Card: Waterfall,
  row: WATERFALL_ROW,
  reads: WATERFALL_ENVELOPE_FIELDS,
  absences: WATERFALL_ABSENCES,
  fixtures: WATERFALL_FIXTURES,
});
