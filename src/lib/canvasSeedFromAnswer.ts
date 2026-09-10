import { useEffect, useRef } from "react";
import { useCanvasStore } from "@/store/useCanvasStore";
import { useStageStore } from "@/store/useStageStore";
import type { Artifact } from "@/api/types";

/**
 * The client end of "make me a portfolio canvas".
 *
 * The phrase routes, a BFF orchestration asks the five measures through the governed path and
 * mints five real artifacts, and its ANSWER comes back carrying their ids in slot order. This
 * watches for that answer and arranges them. It computes no placement — the template applies
 * inside `addItemAuto`, so a seeded canvas stays the same object a user builds by hand.
 *
 * ── THE PAYLOAD SHAPE IS DECLARED HERE, AND ONLY HERE ────────────────────────────────────
 *
 * No contract for this existed when the client half was written, so rather than let two lanes
 * invent it separately, the expectation is stated in ONE function and nowhere else:
 *
 *     { archetype: "CANVAS_SEED", template_id?: string, canvas_type?: string,
 *       name?: string, artifact_ids: string[] }
 *
 * BOTH TEMPLATE KEYS ARE READ, and that is not indecision. ADR-0050 names the field
 * `template_id`; `CanvasSeed.contract.ts` declares `canvas_type` from before templates had
 * ids. Which one the producer sends is not settled — today it sends NEITHER — and a reader that
 * accepted only one would silently lay a board out with the wrong template the first time the
 * other arrived. `template_id` wins when both are present, because it is the ratified name.
 *
 * `artifact_ids` is ORDERED and the order is the producer's declaration of which measure lands
 * in which slot. If the server half chooses a different shape, `canvasSeedFromArtifact` is the
 * single edit — that is the point of putting it here instead of inline at the call site.
 *
 * ── SEEDS ONCE, AND NOT FROM HISTORY ─────────────────────────────────────────────────────
 *
 * Two ways this could produce canvases nobody asked for, both guarded:
 *
 *  1. Electric re-delivers rows. A subscription that seeded on every delivery of the same
 *     artifact would mint a board per delivery.
 *  2. A session's history contains seed answers from previous sittings. Those already produced
 *     their canvases — and those canvases are durable, synced through /me/canvases. Seeding
 *     from them on every page load would add a duplicate board every time the app opened.
 *
 * So the artifacts present at mount are recorded as SEEN without acting, and only artifacts
 * that arrive afterwards can seed. A historical seed answer is history; a new one is an event.
 */

/** The slot-ordered ids a seed answer carries, or null if this artifact is not one. */
export function canvasSeedFromArtifact(
  a: Artifact,
): { ids: string[]; name?: string; templateId?: string } | null {
  const components = a.rendered_output?.components as
    | Array<Record<string, unknown>>
    | undefined;
  if (!Array.isArray(components)) return null;
  for (const c of components) {
    if (!c || typeof c !== "object") continue;
    if (c.archetype !== "CANVAS_SEED") continue;
    const raw = c.artifact_ids;
    if (!Array.isArray(raw)) continue;
    // Defensive because this crosses the wire: an item pointing at no artifact renders as a
    // slot-shaped hole with nothing explaining it, which is worse than a shorter board.
    const ids = raw.filter((v): v is string => typeof v === "string" && v.length > 0);
    if (ids.length === 0) return null;
    const declared = [c.template_id, c.canvas_type].find(
      (v): v is string => typeof v === "string" && v.trim().length > 0,
    );
    return {
      ids,
      name: typeof c.name === "string" && c.name ? c.name : undefined,
      templateId: declared?.trim(),
    };
  }
  return null;
}

/**
 * Mounted ONCE, in App. Not per card — a per-card watcher on a global store is the fan-out
 * species swept for on 2026-08-25.
 */
export function useCanvasSeedFromAnswers(): void {
  const seen = useRef<Set<string> | null>(null);
  useEffect(() => {
    // Prime SYNCHRONOUSLY from whatever is already loaded. This is a CHURN guard, not the
    // safety one, and saying so matters because it was mistaken for the safety one.
    //
    // It was written to stop history seeding, and it cannot: on a fresh load this set is EMPTY,
    // because artifacts hydrate from Electric AFTER mount. Every historical seed answer then
    // arrived looking brand new and minted another board — one per seed answer, every reload.
    // A guard whose premise is "the data is already here" is worth nothing at the exact moment
    // the data is arriving.
    //
    // The real protection is idempotency in the store: a seed answer that already has a board
    // does not get another, whatever order anything loads in.
    seen.current = new Set(useCanvasStore.getState().artifacts.map((a) => a.id));
    return useCanvasStore.subscribe((state) => {
      const known = seen.current;
      if (!known) return;
      for (const a of state.artifacts) {
        if (known.has(a.id)) continue;
        // NOT YET JUDGEABLE — AND THEREFORE NOT YET SEEN.
        //
        // This is why "make me a portfolio canvas" produced no canvas in the session that
        // asked for it. Every turn appends a PENDING row at submit time, carrying the turn's
        // artifact id and no `rendered_output` at all. That row arrived here first, was marked
        // seen, carried no seed because it carried no content — and when the real answer landed
        // on THE SAME ID moments later it was skipped as already known. The one artifact that
        // was always going to be the seed answer was the one guaranteed to be pre-empted.
        //
        // Marking a row seen is a claim to have JUDGED it, and an empty row cannot be judged.
        // So the set records only rows that had content to read, and the pending row is passed
        // over silently until it has some. Whether that content turns out to be a seed is a
        // different question, and one this loop is now actually allowed to ask.
        if (!a.rendered_output) continue;
        known.add(a.id);
        const seed = canvasSeedFromArtifact(a);
        if (!seed) continue;
        // The seed answer's own id travels with the composition, and it is what stops boards
        // multiplying: a seed that already has a board does not get another.
        //
        // ENTER IS FALSE, AND THAT IS A CHANGE. This ran with `enter: true`, which was
        // harmless only because the bug above meant it never ran on a live turn. Fixed, it
        // fires on every hydrated seed answer too — so a reload would have yanked the view
        // into whichever historical board hydrated last. Building the board is the answer to
        // "make me a portfolio canvas"; GOING there is a navigation, and navigation belongs to
        // the person, via the link on the card.
        useStageStore
          .getState()
          .seedPortfolioCanvas(
            seed.ids,
            seed.name ?? "Portfolio Planning",
            false,
            a.id,
            false,
            seed.templateId,
          );
      }
    });
  }, []);
}
