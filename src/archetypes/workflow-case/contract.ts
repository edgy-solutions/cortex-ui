/**
 * WORKFLOW_CASE — cortex-proposed; no producer route serves this yet.
 *
 * Nothing at `invincible-agent` origin/master (verified at 65462a42) answers a workflow
 * definition, an instance's live state, its history, its options, or a released artifact over
 * HTTP. Definitions live as git YAML under `policy/workflows/*.yaml`, read against the Pydantic
 * `WorkflowDefinition` model (`agent_fleet/restate_analyst/workflow_definition.py:227`:
 * `id, name, classification, participants[{role}], domain_stages[], steps[], observable_state`).
 *
 * `CaseDefinition` MIRRORS that model's shape, with its placeholders already bound (template
 * tokens such as a level or a subject id resolved to the strings a producer would send for one
 * concrete instance). EVERYTHING ELSE in this file — `CaseInstance`, `CaseHistoryEntry`,
 * `CaseOption`, `CaseApproval`, `CaseArtifact`, `WorkflowCasePayload` — is the shape cortex is
 * asking for, not a shape any producer has declared. `row.ts` says the same thing about the wire
 * tuple; this header says it about the contract.
 *
 * ── WHY `instances: CaseInstance[]`, NOT ONE INSTANCE ─────────────────────────────────────
 *
 * One definition is one act, and a producer case can select between its sibling definitions by
 * a decision-table row keyed on the outcome of the one before it — an observed pair on
 * origin/master chains exactly this way, where the first instance's disposition decides which
 * definition opens next, and a second producer pair, under a different selection rule, runs
 * only the one. So a case's chain of acts can span SEVERAL workflow instances under a single
 * subject, never always just the one — the list is the structural fact a single-instance shape
 * would have hidden, not a convenience added on top of it.
 */
import type { ApprovalTaskPayload } from "@/components/ApprovalTask/ApprovalTaskCard";

/** One step in a definition. Mirrors the producer's `human_await` step shape (and others, by
 *  `kind`), already bound for this instance. */
export interface CaseDefinitionStep {
  id: string;
  kind: string;
  title?: string | null;
  audience?: string | null;
}

/** Mirrors `WorkflowDefinition`, placeholders already bound. */
export interface CaseDefinition {
  id: string;
  name: string;
  participants: { role: string }[];
  domain_stages: string[];
  steps: CaseDefinitionStep[];
}

export interface CaseInstance {
  workflow_id: string;
  definition: CaseDefinition;
  /** Must be ∈ `definition.domain_stages` to be drawn as current — never guessed otherwise. */
  current_stage?: string | null;
  status: "running" | "completed" | "failed" | string;
}

export interface CaseHistoryEntry {
  at: string;
  workflow_id: string;
  event: string;
  stage?: string | null;
  step_id?: string | null;
  actor?: string | null;
}

/** What a workflow produced, with the data it used. */
export interface CaseOption {
  id: string;
  label: string;
  data: Record<string, string | number | boolean | null>;
  /** The artifact the data came from. */
  artifact_uri?: string | null;
}

export interface CaseApproval {
  workflow_id: string;
  /** ∈ that instance's `definition.steps`. */
  step_id: string;
  status: "pending" | "decided";
  decided_by?: string | null;
  decision?: string | null;
  reason?: string | null;
  decided_at?: string | null;
  /** Present iff pending and actionable by the viewer. */
  task?: ApprovalTaskPayload | null;
}

export interface CaseArtifact {
  uri: string;
  label?: string | null;
  /** null/absent on the envelope's `output_artifact` means not released. */
  released_at: string;
}

export interface WorkflowCasePayload {
  subject_ref: string;
  /** Order = chain order. */
  instances: CaseInstance[];
  history?: CaseHistoryEntry[];
  options?: CaseOption[];
  /** Order = chain order. */
  approvals?: CaseApproval[];
  /** null/absent = not released. */
  output_artifact?: CaseArtifact | null;
}

export const WORKFLOW_CASE_CONTRACT = {
  archetype: "WORKFLOW_CASE",
  component: "WorkflowCase",
  // No row space, grid-cell constraint or chart x-axis argument applies here — this matches the
  // repo's own convention (every sibling `*.contract.ts` but COMPETING_MEASURES's `"rows"`), and
  // the card needs the row this archetype's multi-section layout wants on a narrow viewport —
  // see the matching entry added to `isFullWidth` in SemanticInterpreter.tsx.
  layout: "full-width",
  // FALSE, for the same reason as COMPETING_MEASURES: re-fetching a case's current state would
  // return the producer's own fresher answer, not a function of this card's own moving state.
  recomputes: false,
  fields: {
    case: { encoding: "object", parsesTo: "object", required: true },
  },
} as const;

export type WorkflowCaseContract = typeof WORKFLOW_CASE_CONTRACT;

/** Re-exported so a consumer of this contract never needs a second import path for the one
 *  type `CaseApproval.task` actually is — `ApprovalTaskCard`'s own payload type, never copied
 *  here. */
export type { ApprovalTaskPayload };
