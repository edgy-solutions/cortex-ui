import type { Artifact } from "@/api/types";

/**
 * ONE QUESTION, ONE ITEM — the ask folds into the answer it produced.
 *
 * A reader who asks something, gets asked back, and picks an option produced TWO rail items:
 * the ask, then the answer. From their side that was one exchange, and the ask is the half
 * that is no longer useful — it is a question they have already answered.
 *
 * ── REPLACE, DO NOT PERSIST ───────────────────────────────────────────────────────────────
 *
 * The ask row is dropped and the answer row stands in its place. Keeping the ask card alive
 * and transitioning its contents would mean holding cross-artifact state in a component: it
 * survives a re-render, dies on a remount, and then looks like a bug in the fold rather than
 * what it is. What the reader sees is continuous; how it is built is a swap.
 *
 * The ask is not lost — the answer's decision path carries what was asked and what was chosen,
 * so "what did it ask me" stays answerable without keeping a card alive to answer it.
 *
 * ── FOLD ON THE SERVER'S FIELD, NEVER ON THE CLIENT'S CLAIM ───────────────────────────────
 *
 * `derived_from_artifact_id` is what the SERVER decided, after refusing the claim on any turn
 * that did not actually carry an answer. `answering_artifact_id` is what this client ASKED
 * for. Folding on the claim would hide an ask whose answer never happened — the row vanishes
 * and nothing replaces it, which is worse than two rows by a wide margin.
 */

/** Whether an artifact is an ask — a question the system put to the reader. */
export function isAsk(a: Artifact): boolean {
  const comps = a.rendered_output?.components;
  if (!Array.isArray(comps)) return false;
  return comps.some(
    (c) =>
      typeof c === "object" &&
      c !== null &&
      (c as Record<string, unknown>).archetype === "ELICITATION",
  );
}

/**
 * The ids of ask artifacts that some other artifact has since answered.
 *
 * ONLY ASKS ARE FOLDABLE. Ordinary follow-up lineage — one answer derived from another — is a
 * relationship worth having and NOT a reason to hide the parent: both are answers, both were
 * read, and collapsing them would delete a result nobody replaced. The fold exists because an
 * ask is spent once answered, which is a property of asks and not of lineage.
 */
export function foldedAskIds(artifacts: readonly Artifact[]): Set<string> {
  const asks = new Set<string>();
  for (const a of artifacts) if (isAsk(a)) asks.add(a.id);
  if (asks.size === 0) return asks;

  const folded = new Set<string>();
  for (const a of artifacts) {
    const parent = a.derived_from_artifact_id;
    // A child that IS itself an ask does not fold its parent: two asks in a row is a second
    // question, not an answer to the first.
    if (!parent || !asks.has(parent) || isAsk(a)) continue;
    // AND THE ANSWER HAS TO HAVE ARRIVED. A pending child means the reader is mid-flight; the
    // in-flight card carries the chip and the ask still has the last thing they can read.
    if (a.status === "pending") continue;
    folded.add(parent);
  }
  return folded;
}
