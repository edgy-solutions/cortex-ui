import { requestPortfolioCanvasSeed } from "@/api/client";
import { useStageStore } from "@/store/useStageStore";

/**
 * "Make me a portfolio canvas", client side.
 *
 * The server asks the five measures through the GOVERNED path and mints five real answer
 * artifacts. It returns their ids IN SLOT ORDER. This composes that response with the receiver
 * the store already has — and the composition is all it does.
 *
 * ── WHY IT COMPUTES NOTHING ──────────────────────────────────────────────────────────────
 *
 * `seedPortfolioCanvas` is `createCanvas` + `addItemAuto` in a loop; the template applies
 * because `addItemAuto` consults it, exactly as when a user drops a card by hand. So a seeded
 * canvas and a hand-built one are indistinguishable to every consumer, which is what makes
 * seeding a starting point rather than a second kind of object. Nothing here places a card,
 * and nothing here should learn how.
 *
 * ORDER IS THE SERVER'S DECLARATION. Which measure lands in the anchor slot is decided by the
 * order the ids arrive in. This does not sort, filter or reorder them — doing so would move a
 * decision that belongs to the seeding intent into the client, and the two would drift.
 *
 * ── WHAT IT REFUSES TO DO ────────────────────────────────────────────────────────────────
 *
 * A failed or empty seed creates NO canvas. An empty named canvas in the rail is litter the
 * user did not ask for and has to clean up, and it would also assert that a seeding ran and
 * legitimately produced nothing — which is a different claim from "the seeding failed".
 * Returning null lets the caller say which.
 */
export async function seedPortfolioCanvasFromServer(
  name = "Portfolio Planning",
): Promise<string | null> {
  let ids: string[];
  try {
    ids = await requestPortfolioCanvasSeed();
  } catch {
    // No canvas on failure. The caller reports; this does not leave a husk behind.
    return null;
  }
  // Defensive because this crosses the wire: a non-string id would become an item pointing at
  // no artifact, and the canvas would render a slot-shaped hole with nothing explaining it.
  const ordered = ids.filter((id): id is string => typeof id === "string" && id.length > 0);
  if (ordered.length === 0) return null;
  return useStageStore.getState().seedPortfolioCanvas(ordered, name);
}

/**
 * MANUAL TRIGGER, for bring-up only.
 *
 * The phrase does not route yet — no mesh capability exists for the seeding intent, so the
 * router correctly returns NO_VERB_CLASSIFIED. Until the registration lands there is no way to
 * start a seed from the browser at all, which blocks the persistence-across-reload check that
 * does not depend on routing.
 *
 * Exposed on `window` deliberately and named so it reads as scaffolding rather than API. It
 * calls the same function the answer path will, so what it proves is what the real path does —
 * a mock here would prove nothing about the flow it is standing in for.
 *
 * Remove when the phrase routes end to end.
 */
if (typeof window !== "undefined") {
  (window as unknown as Record<string, unknown>).__cortexSeedPortfolioCanvas =
    seedPortfolioCanvasFromServer;
}