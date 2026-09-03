import { useCanvasStore } from "@/store/useCanvasStore";
import { useStageStore } from "@/store/useStageStore";
import { usePresentationStore } from "@/store/usePresentationStore";

/**
 * `window.__cortex` — a console handle on what this client actually received.
 *
 * WHY IT EXISTS. Diagnosing "the card is missing a field" needs the payload the card was
 * handed, and until now there was no way to get it: the stores are module-scoped Zustand
 * hooks, so a console command naming `useCanvasStore` finds nothing. A snippet written on that
 * assumption is a snippet nobody can run, and it cost a debugging round.
 *
 * ── IT IS NOT DEV-ONLY, AND THAT IS THE DECISION ─────────────────────────────────────────
 *
 * The gate would have been `import.meta.env.DEV`, and it would have made this useless for the
 * only case that matters: a deployed container, in front of a room, where the question is
 * "what did the engine actually send". A read-only view of data this browser already holds and
 * already renders adds no exposure — the answers are on screen.
 *
 * WHAT IT DELIBERATELY IS NOT: a mutation surface. It hands back state and payloads. Nothing
 * here sets anything, because a console that can write is a console that gets used to "fix" a
 * demo, and then the board on screen is not the board the engine produced.
 *
 * ── THE PRECEDENT IT IS BUILT AGAINST ────────────────────────────────────────────────────
 *
 * `window.__cortexSeedPortfolioCanvas` claimed in its own comment to expose a global and did
 * not, for two days, because nothing on the entry path imported the module and the bundler
 * dropped it whole. `seedPortfolioCanvas.reachability.test.ts` turned that into a law — EVERY
 * module installing a `__cortex*` global must be reachable from the entry point — and this
 * module is covered by it automatically, which is the whole point of having written the law as
 * a law rather than as a path.
 */

/** One rendered component, with the fields a payload diagnosis actually asks about. */
interface PayloadRow {
  answer_id: string;
  archetype: string;
  scope_label?: unknown;
  keys: string[];
  component: unknown;
}

/**
 * Every rendered component this client holds, optionally narrowed to one archetype.
 *
 * `keys` is listed separately because the common question is not "what is this field's value"
 * but "did the field arrive at all", and an absent key and a key holding `undefined` look
 * identical when you print the object.
 */
function payloads(archetype?: string): PayloadRow[] {
  const out: PayloadRow[] = [];
  for (const a of useCanvasStore.getState().artifacts) {
    const comps = a.rendered_output?.components;
    if (!Array.isArray(comps)) continue;
    for (const c of comps) {
      if (typeof c !== "object" || c === null) continue;
      const rec = c as Record<string, unknown>;
      const arch = typeof rec.archetype === "string" ? rec.archetype : "";
      if (archetype && arch !== archetype) continue;
      out.push({
        answer_id: a.id,
        archetype: arch,
        scope_label: rec.scope_label,
        keys: Object.keys(rec).sort(),
        component: rec,
      });
    }
  }
  return out;
}

if (typeof window !== "undefined") {
  (window as unknown as Record<string, unknown>).__cortex = {
    /** Every payload this client received. `__cortex.payloads("MULTI_SERIES")` to narrow. */
    payloads,
    /** The raw stores, read-only by convention — see the header. */
    stores: {
      answers: useCanvasStore,
      stage: useStageStore,
      presentation: usePresentationStore,
    },
  };
}
