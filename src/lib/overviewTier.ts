/**
 * Overview-zoom presentation TIER for a canvas citizen.
 *
 * The citizen SHELL (StageCard) owns the fixed frame; each archetype DECLARES how
 * its content ADAPTS to that frame — the frame dictates the content, never the
 * reverse. Scale-to-fit breaks that downward (a 19-row review shrinks to nothing);
 * corner-anchoring breaks it upward (a two-button approve rattles in a grid cell).
 * The tier is the two clauses of the one rule, declared in ONE place.
 *
 *  - "dense"   — tabular content. The shell shows a CAPPED preview (first N rows +
 *                a count-remaining affordance), so the frame scales by WIDTH
 *                (readable) instead of by HEIGHT (the extra shrink that made long
 *                lists illegible), and the status footer stays above the fold.
 *  - "compact" — sparse content (a couple of actions / a short block). Centered in
 *                the minimum frame — a small COMPLETE thing, not a postage stamp.
 *  - "visual"  — a diagram/chart whose whole point IS scale-to-fit. Keeps the
 *                FitBox scale: the one place shrink-to-fit is correct, so charts
 *                do not move.
 *
 * Domain-agnostic BY CONSTRUCTION: keyed on archetype, never on a domain term
 * (no "PCN"/"approval"/"obsolescence") — deletion-test safe (AGENTS.md).
 */
export type OverviewTier = "dense" | "compact" | "visual";

const TIER: Record<string, OverviewTier> = {
  // dense — tables/lists: cap + preview so height never dictates scale.
  GROUPED_REVIEW: "dense",
  INSTANCES_BY_PROPERTY: "dense",
  ASSET_STATE_METRIC: "dense",
  // compact — sparse cards: centered in the minimum frame.
  APPROVAL_TASK: "compact",
  HAZARD_DECLARATION: "compact",
  // visual — scale-to-fit is the point; keep FitBox.
  CHART_WIDGET: "visual",
  PROCESS_TOPOLOGY: "visual",
  WORKFLOW_OBSERVATION: "visual",
  KNOWLEDGE_DOCUMENT: "visual",
};

/**
 * The tier for an archetype, or `null` when the archetype is UNREGISTERED. The
 * shell treats null as a LOUD fallback (a small centered "unregistered" frame),
 * not a silent grid-default — because the next unregistered archetype would
 * otherwise produce its own differently-shaped accident (the corner-stamp bug was
 * never a sizing bug: it was an unregistered archetype falling through defaults).
 */
export function overviewTier(archetype: string | undefined | null): OverviewTier | null {
  if (!archetype) return null;
  return TIER[archetype] ?? null;
}

/**
 * Rows a "dense" citizen previews at overview before the "⌄ N more" affordance.
 * A DECLARED default with a count-remaining tell — "first 6 · ⌄ 13 more" reads as
 * designed; first-6-then-silence reads as truncation. Tunable in one place.
 */
export const DENSE_PREVIEW_ROWS = 6;
