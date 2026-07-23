/**
 * Workflow-observation vocabulary — step status + step-kind presentation.
 *
 * Mirrors the backend Slice-3 observation core (invincible-agent/agent_fleet/restate_analyst/
 * workflow_observation.py). Closed unions + exhaustive presenters (never-guarded, the lib/routing.ts
 * idiom) so a new status/kind without a label fails `tsc` — an observer never sees a raw enum.
 */
export type StepStatus = "pending" | "running" | "suspended" | "done" | "failed";

export interface StatusPresentation {
  label: string;
  /** dotClass drives the status dot color; pulse marks in-flight states. */
  dotClass: string;
  pulse: boolean;
}

export function presentStepStatus(s: StepStatus): StatusPresentation {
  switch (s) {
    case "pending":
      return { label: "Pending", dotClass: "bg-slate-500", pulse: false };
    case "running":
      return { label: "Running", dotClass: "bg-neon-cyan", pulse: true };
    case "suspended":
      return { label: "Awaiting", dotClass: "bg-amber-400", pulse: true };
    case "done":
      return { label: "Done", dotClass: "bg-neon-green", pulse: false };
    case "failed":
      return { label: "Failed", dotClass: "bg-red-500", pulse: false };
    default: {
      const _exhaustive: never = s;
      return { label: String(_exhaustive), dotClass: "bg-slate-500", pulse: false };
    }
  }
}

/** Coerce an arbitrary status string to a known StepStatus (unknown -> "pending"). */
export function asStepStatus(s: string): StepStatus {
  return (["pending", "running", "suspended", "done", "failed"] as const).includes(s as StepStatus)
    ? (s as StepStatus)
    : "pending";
}

const AGENT_KINDS = new Set(["spo_operation", "direct_call", "service_task", "service"]);

/** Whether a step is an agent action (clearance-bounded) vs a human action. */
export function isAgentKind(kind: string): boolean {
  return AGENT_KINDS.has(kind);
}
