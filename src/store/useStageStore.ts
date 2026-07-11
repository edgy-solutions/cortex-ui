import { create } from "zustand";
import { persist } from "zustand/middleware";
import { STAGE_CARD } from "@/lib/stageConstants";

/**
 * useStageStore — the CAMERA-STAGE state for the center canvas (ADR-0028
 * canvas-dock model).
 *
 * Two kinds of state, deliberately split:
 *  - EPHEMERAL navigation (focusId / fullPane / focusTab): which card is zoomed
 *    and how — not persisted.
 *  - DURABLE structure (view + custom canvases): which canvas the stage shows
 *    and the freeform custom boards (with item positions). Persisted to
 *    localStorage (server-side sync is Stage 5). The GLOBAL canvas is DERIVED
 *    (auto-arranged by the list mode) and needs no persistence.
 */
export type StageFocusTab = "answer" | "map";

/** ADR-0028 canvas "uses" — assignable at creation, carried as metadata only
 *  (label, no behavior) per the ADR's carry-forward-compute-later posture. */
export type CanvasUse = "aggregation" | "workflow" | "relationship";

export interface CanvasItem {
  id: string; // answer id
  x: number;
  y: number; // world coords, top-left of card
}
export interface CustomCanvas {
  id: string;
  name: string;
  use?: CanvasUse;
  items: CanvasItem[];
}

const GLOBAL = "global";

interface StageState {
  // ── durable ──
  view: string; // 'global' | canvasId
  canvases: CustomCanvas[];
  // ── ephemeral ──
  focusId: string | null;
  fullPane: boolean;
  focusTab: StageFocusTab;

  // navigation
  focus: (id: string) => void;
  clearFocus: () => void;
  openFullPane: () => void;
  closeFullPane: () => void;
  setFocusTab: (t: StageFocusTab) => void;
  setView: (v: string) => void;

  // custom canvases
  createCanvas: (name: string, use?: CanvasUse, enter?: boolean) => string;
  renameCanvas: (id: string, name: string) => void;
  deleteCanvas: (id: string) => void;
  addItemAuto: (canvasId: string, answerId: string) => void; // auto-slot placement
  addItemAt: (canvasId: string, answerId: string, x: number, y: number) => void;
  moveItem: (canvasId: string, answerId: string, x: number, y: number) => void;
  removeItem: (canvasId: string, answerId: string) => void;
}

const genId = () =>
  `c-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

// Auto-slot placement (chip drops / list drops), scaled to the card size.
const slotFor = (n: number) => ({
  x: 90 + (n % 4) * (STAGE_CARD.w + 60),
  y: 90 + Math.floor(n / 4) * (STAGE_CARD.h + 60),
});

export const useStageStore = create<StageState>()(
  persist(
    (set) => ({
      view: GLOBAL,
      canvases: [],
      focusId: null,
      fullPane: false,
      focusTab: "answer",

      focus: (id) => set({ focusId: id, focusTab: "answer" }),
      clearFocus: () => set({ focusId: null, fullPane: false }),
      openFullPane: () => set({ fullPane: true }),
      closeFullPane: () => set({ fullPane: false }),
      setFocusTab: (t) => set({ focusTab: t }),
      // Entering any canvas zooms out (per the design: chip click clears focus).
      setView: (v) => set({ view: v, focusId: null, fullPane: false }),

      createCanvas: (name, use, enter = true) => {
        const id = genId();
        const canvas: CustomCanvas = { id, name: name.trim() || "Canvas", use, items: [] };
        set((s) => ({
          canvases: [...s.canvases, canvas],
          ...(enter ? { view: id, focusId: null, fullPane: false } : {}),
        }));
        return id;
      },
      renameCanvas: (id, name) =>
        set((s) => ({
          canvases: s.canvases.map((c) =>
            c.id === id ? { ...c, name: name.trim() || c.name } : c,
          ),
        })),
      deleteCanvas: (id) =>
        set((s) => ({
          canvases: s.canvases.filter((c) => c.id !== id),
          view: s.view === id ? GLOBAL : s.view,
        })),

      addItemAuto: (canvasId, answerId) =>
        set((s) => ({
          canvases: s.canvases.map((c) => {
            if (c.id !== canvasId) return c;
            if (c.items.some((it) => it.id === answerId)) return c; // dedupe
            return { ...c, items: [...c.items, { id: answerId, ...slotFor(c.items.length) }] };
          }),
        })),
      addItemAt: (canvasId, answerId, x, y) =>
        set((s) => ({
          canvases: s.canvases.map((c) => {
            if (c.id !== canvasId) return c;
            const existing = c.items.find((it) => it.id === answerId);
            if (existing) {
              // already here → MOVE it (don't duplicate)
              return {
                ...c,
                items: c.items.map((it) => (it.id === answerId ? { ...it, x, y } : it)),
              };
            }
            return { ...c, items: [...c.items, { id: answerId, x, y }] };
          }),
        })),
      moveItem: (canvasId, answerId, x, y) =>
        set((s) => ({
          canvases: s.canvases.map((c) =>
            c.id === canvasId
              ? { ...c, items: c.items.map((it) => (it.id === answerId ? { ...it, x, y } : it)) }
              : c,
          ),
        })),
      removeItem: (canvasId, answerId) =>
        set((s) => ({
          canvases: s.canvases.map((c) =>
            c.id === canvasId
              ? { ...c, items: c.items.filter((it) => it.id !== answerId) }
              : c,
          ),
        })),
    }),
    {
      name: "cortex-stage",
      // Persist only the durable structure; navigation is ephemeral. Guard a
      // stale `view` pointing at a deleted canvas back to global on hydrate.
      partialize: (s) => ({ canvases: s.canvases, view: s.view }),
      merge: (persisted, current) => {
        const p = (persisted as Partial<StageState>) || {};
        const canvases = p.canvases ?? [];
        let view = p.view ?? GLOBAL;
        if (view !== GLOBAL && !canvases.some((c) => c.id === view)) view = GLOBAL;
        return { ...current, canvases, view };
      },
    },
  ),
);
