/**
 * OriginUnresolvedBanner — CORTEX-PROPOSED (`src/lib/ingestOrigin.ts`, architect ruling
 * 2026-10-02 "ORIGIN, not audience"). Nothing on the real wire sets `component.origin` today;
 * this draws only when a component's own origin reads as `{status: "unresolved"}` via
 * `readComponentOriginUnresolved`, which treats absent/malformed as `false` — the absent≠
 * unresolved invariant, kept at the reader, not here.
 *
 * Wired into `SemanticInterpreter`'s render loop in the SAME place as `ProvenanceFloorLabel`
 * (above EVERY archetype's own rendering) — archetype-agnostic by construction, not a per-case
 * addition. See `SemanticInterpreter.tsx`'s render loop for the mount.
 */
import { readComponentOriginUnresolved } from "@/lib/ingestOrigin";

export function OriginUnresolvedBanner({ component }: { component: unknown }) {
  if (!readComponentOriginUnresolved(component)) return null;

  return (
    <div
      className="glass-panel-sm p-2 mb-2 border-amber-500/30 bg-amber-500/5"
      data-origin-unresolved-banner
    >
      <p className="text-[9px] font-mono uppercase tracking-wider text-amber-400/90">
        Origin unresolved — visible only to you until a steward resolves it.
      </p>
    </div>
  );
}
