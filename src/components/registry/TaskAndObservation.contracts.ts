/**
 * Contracts for the task/observation archetypes: APPROVAL_TASK, WORKFLOW_OBSERVATION,
 * INSTANCES_BY_PROPERTY.
 *
 * NONE OF THESE ARE SemanticArchetype MEMBERS. All three are dispatched by
 * SemanticInterpreter and absent from BAML's enum (enumeration finding D4). The backend
 * validator admits them through its union vocabulary, deliberately, under a `trigger:` to
 * tighten when the enum is repaired.
 *
 * GROUPED IN ONE FILE, unlike the others. Each is a single field handed straight to a view
 * component — there is no per-component shape logic to sit beside, and three files each
 * declaring one field would be ceremony. The rule is that the contract lives with what it
 * describes; for these, what it describes is the interpreter's dispatch itself.
 */

import { DISPOSITION_TASK_FIELD } from "./disposition.contract";

/** Empty vocabularies: each view renders whatever object it is handed. */
const NO_REFUSALS = [] as const;

export const APPROVAL_TASK_CONTRACT = {
  archetype: "APPROVAL_TASK",
  component: "ApprovalTaskCard",
  layout: "grid-col-1",
  fields: {
    /** The HumanTask. Approve/Reject are its verbs — see triage-card-archetype for why a
     *  wrong verb is REFUSED rather than stored.
     *
     *  SHARED BY REFERENCE, not restated. This field used to be
     *  `{encoding:"object", required:true}` — declaring nothing about its own payload, so
     *  the HumanTask shape lived only in ApprovalTaskCard's destructuring. It is now the
     *  imported `DISPOSITION_TASK_FIELD`, which DECISION_RECORD composes too; changing the
     *  keys there changes both, and a test asserts they remain the same object.
     *
     *  A TIGHTENING, not a behaviour change: `expected_fields` is `Object.keys(fields)` and
     *  is still `["task"]`, and `requiredKeys` is read by nothing at runtime. */
    task: DISPOSITION_TASK_FIELD,
  },
  rowRequirements: {},
  refusalReasons: NO_REFUSALS,
} as const;

export const WORKFLOW_OBSERVATION_CONTRACT = {
  archetype: "WORKFLOW_OBSERVATION",
  component: "WorkflowObservationView",
  layout: "full-width",
  fields: {
    /** The observer-facing ObservationProjection — what a watcher may see of a workflow. */
    projection: { encoding: "object", required: true },
  },
  rowRequirements: {},
  refusalReasons: NO_REFUSALS,
} as const;

export const INSTANCES_BY_PROPERTY_CONTRACT = {
  archetype: "INSTANCES_BY_PROPERTY",
  component: "InstancesByPropertyView",
  layout: "full-width",
  fields: {
    /**
     * THE WHOLE COMPONENT PAYLOAD. Unlike every other archetype, the interpreter passes
     * `payload={comp}` rather than a named field — so this contract's "field" is the
     * envelope itself. Recorded because a reader expecting a named field would look for one
     * and find nothing.
     */
    __payload: { encoding: "object", required: true, isWholeComponentPayload: true },
  },
  rowRequirements: {},
  refusalReasons: NO_REFUSALS,
} as const;
