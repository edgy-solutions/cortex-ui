/**
 * PCN/PDN disposition vocabulary — the actions an approver can take on an affected part.
 *
 * Mirrors the backend bulk-resolve core (invincible-agent/agent_fleet/restate_analyst/
 * workflow_bulk_resolve.py): a disposition is the mesh verb a resolved item dispatches. Kept as a
 * closed union + an exhaustive presenter (guarded by `never`, the codebase idiom from lib/routing.ts)
 * so adding a disposition without a presented label fails `tsc` — the review UI is never allowed to
 * render a raw enum at a human deciding real obsolescence actions.
 */
export type Disposition =
  | "dispatchLTB"
  | "dispatchQualification"
  | "dispatchAltSourcing"
  | "archive";

export const DISPOSITIONS: readonly Disposition[] = [
  "dispatchLTB",
  "dispatchQualification",
  "dispatchAltSourcing",
  "archive",
] as const;

export interface DispositionPresentation {
  label: string;
  detail: string;
  /** severity drives the row accent — how consequential / irreversible the action is. */
  tone: "action" | "caution" | "muted";
}

export function presentDisposition(d: Disposition): DispositionPresentation {
  switch (d) {
    case "dispatchLTB":
      return {
        label: "Last-time buy",
        detail: "Place a final purchase before the last-order date to bridge to a replacement.",
        tone: "caution",
      };
    case "dispatchQualification":
      return {
        label: "Qualify replacement",
        detail: "Open a qualification task for the recommended replacement part.",
        tone: "action",
      };
    case "dispatchAltSourcing":
      return {
        label: "Alternate sourcing",
        detail: "Find and evaluate an alternate source or substitute for the affected part.",
        tone: "action",
      };
    case "archive":
      return {
        label: "Archive (no action)",
        detail: "Acknowledge the notice; no engineering action required for this part.",
        tone: "muted",
      };
    default: {
      // Exhaustiveness guard: a new Disposition without a case fails to compile.
      const _exhaustive: never = d;
      return { label: String(_exhaustive), detail: "", tone: "muted" };
    }
  }
}
