import { assembleDerivedCapabilities } from "./assembleCapabilities";

/**
 * Archetypes whose answer is ACTED ON rather than DRAWN.
 *
 * The registry already knows this. A binding declares `component` (drawn) or `consumer`
 * (acted on) and never both, and the dispatch seals check whichever was declared. What was
 * missing is that the RENDERER was never told the category existed — so a seed answer, whose
 * contract says in as many words that "nothing renders that answer as a card", fell through
 * `SemanticInterpreter`'s default branch and reported itself as a missing component.
 *
 * That warning fired on a fully successful operation: the ids were projected, the consumer
 * read them, five cards landed on a canvas, and the card on screen said the UI was broken.
 *
 * DERIVED, NOT LISTED. A hand-written set here would be a second place the category is
 * decided, and it would drift the first time a binding changes treatment — the same failure
 * the contract's own header refuses when it declines to invent a placeholder component. This
 * reads the declaration that already exists.
 */
export const ACTED_ON_ARCHETYPES: ReadonlySet<string> = new Set(
  assembleDerivedCapabilities()
    .filter((c) => c.consumer)
    .map((c) => c.archetype),
);

/** Does the registry say nothing draws this archetype? */
export function isActedOn(archetype: unknown): boolean {
  return typeof archetype === "string" && ACTED_ON_ARCHETYPES.has(archetype);
}
