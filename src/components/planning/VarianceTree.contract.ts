/**
 * VARIANCE_TREE — a quantity decomposed into what produced it, recursively.
 *
 * Structural: it draws "this total, and beneath it the things that account for it, and beneath
 * those the things that account for THOSE." Its first consumer is a cost/schedule variance
 * decomposition; nothing here knows those words.
 *
 * THE FIRST ARCHETYPE WITH DEPTH, which is why it needed minting rather than mapping. Every
 * existing archetype in the projection arm is flat — a series, a grid, a ranking, a set — and
 * nesting is not a field that can be added to any of them. The producer's own docstring settles
 * it: "THE NESTING IS THE ANSWER. A variance stated without what produced it is a number nobody
 * can act on, so the decomposition is the output type rather than a rendering choice."
 *
 * ── TWO DIFFERENT TRUNCATIONS, AND CONFLATING THEM WOULD BE THE WHOLE BUG ──────────────────
 *
 * The producer stops recursing for a reason it REPORTS on every node — `leaf`, `explained`,
 * `depth`, or `decomposed` — precisely because "a truncated tree that looks complete is the
 * failure this field exists to prevent."
 *
 * This card ALSO stops, at `MAX_RENDER_DEPTH`, and that is a completely different claim. One
 * says the analysis ended; the other says the card is not drawing the rest of it right now.
 * A reader who cannot tell them apart has been told the analysis was shallower than it was —
 * which is the producer's own failure mode, reproduced one layer down by the renderer that was
 * supposed to honour it. So the two are rendered as distinct statements, never as one
 * "nothing further" line, and that distinction is what these tests are mostly for.
 *
 * ── WHY THE RENDER DEPTH IS A LEGIBILITY JUDGEMENT AND NOT A DATA BOUND ────────────────────
 *
 * The producer's recursion is bounded by MATERIALITY, not by depth — it drills until the
 * remainder stops mattering against the root. That is the verb's contract and the card must not
 * second-guess it: the payload carries the whole tree.
 *
 * What the card owns is how much is visible at once. Four levels is where a nested list stops
 * being readable in a card-sized frame — program, control account, work package, one more —
 * and deeper nodes are carried, counted, and offered rather than drawn.
 *
 * ANYONE RAISING THIS IS CHANGING A LEGIBILITY JUDGEMENT, NOT A DATA BOUND. Stated here so
 * that is obvious at the point of the edit, because the two are easy to confuse and only one of
 * them is safe to change without asking the producer.
 */

/** How many levels this card draws at once. See the header — legibility, not data. */
export const MAX_RENDER_DEPTH = 4;

/**
 * Why the producer stopped recursing at a node. Read VERBATIM and rendered as itself; an
 * unknown value is shown as the unknown string rather than mapped onto a neighbour, the same
 * rule IntervalTimeline follows for `risk_flag`.
 */
export const VARIANCE_STOP_REASONS = ["decomposed", "leaf", "explained", "depth"] as const;
export type VarianceStopReason = (typeof VARIANCE_STOP_REASONS)[number];

export const VARIANCE_TREE_ROW_REQUIREMENTS = {
  /** One root. The payload is a one-element list holding a tree, not a flat row set. */
  singleRoot: true,
  /**
   * `share_of_root` is a fraction OF THE ROOT, never of the parent — the producer says so and
   * the label must too. Against its parent a $1,000 variance inside a $2,000 account is 50%;
   * against the root it is noise. A card labelling it "share" without saying of what invites
   * the reading that makes a trivial node look like half the problem.
   */
  shareIsOfRoot: true,
  /**
   * `residual` is the immaterial remainder the producer chose not to enumerate, and it is
   * REPORTED rather than dropped. Contributors that do not sum to their parent is "the
   * arithmetic lie this engine is most likely to tell" — so a node carrying one must show it.
   */
  residualIsRendered: true,
  /** Depth of the RENDER, not of the analysis. The two are distinct claims. */
  maxRenderDepth: MAX_RENDER_DEPTH,
} as const;

export const VARIANCE_TREE_REFUSAL_REASONS = [
  "no decomposition recorded",
  "root carries no variance",
  "root is missing its name",
] as const;

export const VARIANCE_TREE_CONTRACT = {
  archetype: "VARIANCE_TREE",
  component: "VarianceTree",
  layout: "full-width",
  /** ADR-0042 Ruling 9's discriminant: a decomposition moves as the facts beneath it move. */
  recomputes: true,
  fields: {
    /**
     * ONE root node, nested. Node: level, entity_id, entity_name, variance_kind, variance,
     * share_of_root, bcws, bcwp, acwp, period_count, stop_reason, contributors[], residual,
     * residual_note.
     */
    rows: { encoding: "array", parsesTo: "array-of-objects", required: true },
    value_label: { type: "string", required: false },
    value_unit: { type: "string", required: false },
    scope_label: { type: "string", required: false },
  },
  rowRequirements: VARIANCE_TREE_ROW_REQUIREMENTS,
  refusalReasons: VARIANCE_TREE_REFUSAL_REASONS,
} as const;

export type VarianceTreeContract = typeof VARIANCE_TREE_CONTRACT;
export type VarianceTreeRefusal = (typeof VARIANCE_TREE_REFUSAL_REASONS)[number];

export interface VarianceNode {
  /** What kind of thing this is — the producer's word, rendered as given. */
  level: string;
  entity_id: string;
  entity_name: string;
  variance_kind?: string;
  /**
   * Whether this node's variance is a GOOD one. Optional, and never inferred from the sign.
   *
   * A positive cost variance is favourable and a positive schedule variance is not, so a card
   * colouring from `variance > 0` would be right on one `variance_kind` and wrong on the next
   * — the identical trap the ranking refuses for its own `favourable`. Absent means the bar is
   * drawn neutral: a share is still a share when nobody has said whether it is welcome.
   *
   * The producer does not send this today. The rendering waits for it rather than guessing.
   */
  favourable?: boolean;
  variance: number;
  /** Fraction OF THE ROOT. Null when the root variance was zero — absent, never 0%. */
  share_of_root?: number | null;
  bcws?: number;
  bcwp?: number;
  acwp?: number;
  period_count?: number;
  /** Why the producer stopped here. Never inferred from an empty `contributors`. */
  stop_reason?: string;
  contributors?: VarianceNode[];
  /** The immaterial remainder, when the producer declined to enumerate some children. */
  residual?: number;
  /** The producer's own sentence about that remainder. Rendered verbatim. */
  residual_note?: string;
}

/** How many levels of tree exist beneath a node, so the card can say what it is not drawing. */
export function depthBelow(node: VarianceNode): number {
  const kids = Array.isArray(node.contributors) ? node.contributors : [];
  if (kids.length === 0) return 0;
  return 1 + Math.max(...kids.map(depthBelow));
}

/** How many nodes exist beneath a node — the count offered alongside the depth. */
export function countBelow(node: VarianceNode): number {
  const kids = Array.isArray(node.contributors) ? node.contributors : [];
  return kids.reduce((n, k) => n + 1 + countBelow(k), 0);
}

export function validateVarianceTree(
  rows: unknown,
): { kind: "ok"; root: VarianceNode } | { kind: "empty"; reason: VarianceTreeRefusal } {
  if (!Array.isArray(rows) || rows.length === 0) {
    return { kind: "empty", reason: "no decomposition recorded" };
  }
  const r = rows[0];
  if (typeof r !== "object" || r === null || Array.isArray(r)) {
    return { kind: "empty", reason: "no decomposition recorded" };
  }
  const root = r as Record<string, unknown>;
  if (typeof root.entity_name !== "string" || !root.entity_name) {
    return { kind: "empty", reason: "root is missing its name" };
  }
  if (typeof root.variance !== "number" || !Number.isFinite(root.variance)) {
    return { kind: "empty", reason: "root carries no variance" };
  }
  return { kind: "ok", root: root as unknown as VarianceNode };
}
