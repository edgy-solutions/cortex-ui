import { useEffect } from "react";
import { subscribePlanVersion } from "./planVersion";
import { requestReevaluation } from "@/api/client";
import { useCanvasStore } from "@/store/useCanvasStore";
import { useStageStore } from "@/store/useStageStore";
import { assembleDerivedCapabilities } from "@/registry/assembleCapabilities";
import { answerArchetype } from "./answerDisplay";

/**
 * ADR-0042 OQ1's client half: the invalidation travels, the card pulls the recomputation.
 *
 * ── WHAT IT DOES NOT DO, AND WHY THAT IS THE DESIGN ──────────────────────────────────────
 *
 * It does not recompute, and it does not patch rows. It asks the server to re-evaluate, and
 * that is the end of its involvement. The recomputed content returns the way all content
 * returns — the writer persists it, the projector projects it, Electric delivers it — because
 * `rendered_output` and `valid_as_of` are ELECTRIC-COVERED fields that this client is
 * forbidden to write. That prohibition is not an inconvenience routed around here; it is what
 * forces the refresh to be a trigger rather than a second write path.
 *
 * The visible consequence is the good one: a refreshed card gets a NEW `valid_as_of` stamped
 * at evaluation, and the freshness stamp — which caches nothing — renders it. The card becomes
 * visibly fresh rather than silently newer.
 *
 * ── ONE SUBSCRIPTION FOR THE WHOLE SURFACE ───────────────────────────────────────────────
 *
 * Mounted ONCE, in App. Not per card. A per-card subscription to a global signal is the
 * fan-out species this repo swept for yesterday, and `planVersion` is reference-counted for
 * the same reason. Cards do not participate; they simply re-render when Electric delivers.
 *
 * ── FAILURE ──────────────────────────────────────────────────────────────────────────────
 *
 * A failed re-request changes nothing. The card keeps its previous evaluation AND its previous
 * stamp, which is honest: the old numbers really were true as of the old time. Blanking the
 * card would discard a valid answer to report a transport problem, and clearing the stamp
 * would claim we no longer know when it was true — we do.
 */

/** Archetypes whose contract declares `recomputes: true`, derived rather than listed. */
function recomputingArchetypes(): Set<string> {
  const out = new Set<string>();
  for (const cap of assembleDerivedCapabilities()) {
    const c = cap.contract as { archetype?: string; recomputes?: boolean } | undefined;
    if (c?.archetype && c.recomputes === true) out.add(c.archetype);
  }
  return out;
}

/**
 * The artifacts a version bump should refresh: live views sitting on the ACTIVE canvas.
 *
 * Scoped to what is on screen deliberately. Re-evaluating every live view a session has ever
 * accumulated would turn one op into a burst proportional to history — the same
 * count-becomes-fan-out shape, one layer up. What is not being looked at can refresh when it
 * is looked at.
 */
export function refreshableArtifactIds(): string[] {
  const stage = useStageStore.getState();
  const canvas = stage.canvases.find((c) => c.id === stage.view);
  if (!canvas) return []; // GLOBAL is a computed view; it owns no plan scenario
  const live = recomputingArchetypes();
  const byId = new Map(useCanvasStore.getState().artifacts.map((a) => [a.id, a]));
  return canvas.items
    .map((it) => byId.get(it.id))
    .filter((a): a is NonNullable<typeof a> => Boolean(a))
    .filter((a) => live.has(answerArchetype(a)))
    .map((a) => a.id);
}

/**
 * The plan refs the on-canvas live views were EVALUATED AGAINST — what the poller must watch.
 *
 * WHY NOT JUST BASELINE. Ops apply to scenarios; baseline moves only through the commit
 * ceremony. A poller watching baseline during a drag session reads a number that never
 * changes, reports "nothing moved" forever, and is indistinguishable from a working loop over
 * a quiet plan. The refs come off the components because that is where the producer stamped
 * them — the same envelope field the refresh is comparing versions of.
 *
 * DISTINCT, and the poller polls the set: twelve cards on one scenario is one request.
 * A card whose projection carries no `state_ref` contributes nothing rather than defaulting to
 * baseline — a guessed ref would poll the wrong plan and look like it was watching the right one.
 */
export function refreshableStateRefs(): string[] {
  const byId = new Map(useCanvasStore.getState().artifacts.map((a) => [a.id, a]));
  const refs = new Set<string>();
  for (const id of refreshableArtifactIds()) {
    const ro = byId.get(id)?.rendered_output as
      | { components?: Array<{ state_ref?: unknown }> }
      | undefined;
    for (const c of ro?.components ?? []) {
      if (typeof c?.state_ref === "string" && c.state_ref) refs.add(c.state_ref);
    }
  }
  return [...refs];
}

export function useLiveViewRefresh(): void {
  useEffect(() => {
    return subscribePlanVersion(() => {
      for (const id of refreshableArtifactIds()) {
        // Fire and forget, per card. A rejection is swallowed on purpose — see FAILURE above:
        // the previous evaluation and its stamp remain, which is the honest state.
        void requestReevaluation(id).catch(() => {});
      }
    }, refreshableStateRefs);
  }, []);
}
