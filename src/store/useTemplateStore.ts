import { create } from "zustand";
import { fetchTemplates } from "@/api/client";
import { readTemplateCatalog, type TemplateCatalog } from "@/lib/templateCatalog";

/**
 * THE SERVED TEMPLATE MENU — fetched once, so a picker can offer what EXISTS.
 *
 * Before `/templates` the only way to learn which boards were ratified was to seed one and see
 * whether the id came back recognised. A picker built that way offers guesses, and a wrong id
 * fails identically to an id the caller may not have.
 *
 * ── THE CATALOG'S FOUR STATES ARE CARRIED, NOT REDUCED TO A LIST ──────────────────────────
 *
 * `unreachable` (no answer), `unreadable` (`composed: false` — the producer could not read its
 * own directory), `empty` (genuinely nothing ratified) and `ready`. The producer separates the
 * middle two deliberately; a store exposing `TemplateRow[]` would flatten three of them into an
 * empty array at the first seam and hand the picker a complete-looking menu with nothing in it.
 *
 * ⛔ SO THERE IS NO `templates: []` FIELD HERE, on purpose. Anything wanting rows must read the
 * discriminated catalog and say what it does in each state — which is the point.
 *
 * ── NOT PURGED ON AN OWNER CHANGE, and declared in `sessionIsolation.ts` ───────────────────
 *
 * It holds the ratified template registry: which boards exist, their titles and panel counts.
 * Derived from policy, identical for every caller, and never anything out of the substrate —
 * the producer says as much in refusing to gate the endpoint on entitlement. There is nothing
 * here for the next caller to see.
 */
export type TemplateLoad = "idle" | "loading" | "loaded" | "unreachable";

interface TemplateState {
  status: TemplateLoad;
  /** The producer's answer, with its states intact. */
  catalog: TemplateCatalog;
  load: () => Promise<void>;
}

export const useTemplateStore = create<TemplateState>()((set, get) => ({
  status: "idle",
  catalog: { status: "unreachable" },

  load: async () => {
    // ONE FETCH PER SESSION — mounted from a component, so React will call it more than once
    // and a second caller while the first is in flight must not start another.
    if (get().status === "loading" || get().status === "loaded") return;
    set({ status: "loading" });
    const raw = await fetchTemplates();
    if (raw === null) {
      // UNREACHABLE IS NOT AN EMPTY REGISTRY. Reporting "no boards are ratified" from a failed
      // request is a claim about the deployment built out of a network error.
      set({ status: "unreachable", catalog: { status: "unreachable" } });
      return;
    }
    set({ status: "loaded", catalog: readTemplateCatalog(raw) });
  },
}));
