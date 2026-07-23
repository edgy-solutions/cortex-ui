/**
 * Workflow-observation projection shape — the OBSERVER-FACING view of a running workflow.
 *
 * Mirrors the backend Slice-3 core's `ObservationProjection` (invincible-agent/agent_fleet/
 * restate_analyst/workflow_observation.py), MINUS `redactions`. That omission is deliberate and
 * load-bearing: `redactions` names roles and is countable — it is AUDIT-ONLY and the driver must
 * never hand it to a non-participant observer (slice-3 §6, the observer_view / audit_record split).
 * The observer view is exactly what is modeled here: what the observer MAY see, nothing about what
 * was hidden. An other-party step that was redacted simply is not in `steps`.
 *
 * Hand-written until the contract lands in @platform/iagent-contracts.
 */
export interface ObservedStep {
  id: string;
  /** spo_operation | direct_call | human_await | … — presented via lib/workflowVocab. */
  kind: string;
  /** pending | running | suspended | done | failed. */
  status: string;
  /** agent-action clearance subject (present only when the observer can view it). */
  subject?: string | null;
  /** human-action actor — "you" for self, a granted identity, or null. */
  actor?: string | null;
}

export interface ObservedParticipant {
  role: string;
  /** "you" for self, or a granted identity. Never another party's identity without the grant. */
  identity: string;
}

export interface ObservationProjection {
  workflow_id: string;
  /** false => the observer is neither a participant nor classification-cleared (deny; reveals nothing else). */
  visible: boolean;
  classification?: string | null;
  /** author-declared domain-vocabulary stages (only present if on the observable surface). */
  domain_stages: string[];
  current_stage?: string | null;
  steps: ObservedStep[];
  participants: ObservedParticipant[];
}
