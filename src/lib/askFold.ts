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
    // A child that IS itself an ask does not fold its parent: two asks in a row is a second
    // question, not an answer to the first.
    if (isAsk(a)) continue;
    // AND THE ANSWER HAS TO HAVE ARRIVED. A pending child means the reader is mid-flight; the
    // in-flight card carries the chip and the ask still has the last thing they can read.
    if (a.status === "pending") continue;
    // EVERY parent is considered, because the edge is becoming multi-valued and only one of
    // several can be the ask. See `lineageParentIds`.
    for (const parent of lineageParentIds(a)) {
      if (asks.has(parent)) folded.add(parent);
    }
  }
  return folded;
}

/**
 * For each folded ask, the answer that superseded it — `askId → answerId`.
 *
 * ── WHY A MAP AND NOT JUST THE SET ────────────────────────────────────────────────────────
 *
 * The rail only needs to know WHICH rows to drop, because its order is computed and the answer
 * already has a row of its own. A CANVAS is different: a card there sits at coordinates a
 * person chose, and dropping it would leave a HOLE in a board someone arranged. What that slot
 * should show is the answer — the same position, the same size, the question become its result.
 * That needs the pairing, not the set.
 */
export function foldedAskAnswers(artifacts: readonly Artifact[]): Map<string, string> {
  const asks = new Set<string>();
  for (const a of artifacts) if (isAsk(a)) asks.add(a.id);
  const out = new Map<string, string>();
  if (asks.size === 0) return out;

  for (const a of artifacts) {
    if (isAsk(a)) continue;
    if (a.status === "pending") continue;
    for (const parent of lineageParentIds(a)) {
      if (!asks.has(parent)) continue;
      // FIRST ANSWER WINS. A second child of one ask would be a re-ask, and letting it
      // overwrite would make the slot flip between two answers depending on array order.
      if (!out.has(parent)) out.set(parent, a.id);
    }
  }
  return out;
}

/**
 * THE PARENTS AN ARTIFACT DECLARES — one, several, or none.
 *
 * ── WHY THIS TOLERATES A SHAPE IT HAS NEVER SEEN ──────────────────────────────────────────
 *
 * `derived_from_artifact_id` is `Optional[str]` on the writer today and every reader here
 * treats it as one string. ADR-0050 §6.2 requires it to become MULTI-VALUED — a canvas artifact
 * carries one edge per panel — and that change is taken and scheduled by the engine lane.
 *
 * THE DAY IT LANDS, A STRING READER GOES QUIETLY WRONG. `asks.has(["q1"])` is false, so the fold
 * stops folding and two cards come back; `find((a) => a.id === parentId)` misses, so the
 * collapsed offer and the "asked first" line vanish. Nothing throws and no test that mounts one
 * artifact notices — the failure is a feature silently reverting, which is the shape this repo
 * has spent the week closing.
 *
 * So the read is normalised in ONE place and every consumer goes through it. A scalar stays a
 * scalar's meaning; an array is accepted before it exists. This costs nothing today and makes
 * the producer's change a non-event on this side, which is the point: the two lanes should not
 * have to land in the same hour.
 */
export function lineageParentIds(a: Artifact | null | undefined): string[] {
  const raw = (a as { derived_from_artifact_id?: unknown } | null | undefined)
    ?.derived_from_artifact_id;
  if (typeof raw === "string") {
    const id = raw.trim();
    return id ? [id] : [];
  }
  if (Array.isArray(raw)) {
    // ORDER IS PRESERVED. §6.2's edges are per panel and the projection is forbidden from
    // reordering, so the first is the first the producer wrote — not an arbitrary pick.
    return raw.filter((v): v is string => typeof v === "string" && v.trim().length > 0).map((v) => v.trim());
  }
  return [];
}

/**
 * The ASK among an artifact's parents, if one of them is an ask.
 *
 * With several parents only one can be the question that was answered — the rest are panels or
 * prior answers — so "the parent" stops being a well-formed idea the moment the edge is
 * multi-valued. Asking for the ask by name survives that.
 */
export function askParentOf(
  artifact: Artifact | null | undefined,
  artifacts: readonly Artifact[],
): Artifact | null {
  for (const id of lineageParentIds(artifact)) {
    const parent = artifacts.find((a) => a.id === id);
    if (parent && isAsk(parent)) return parent;
  }
  return null;
}
