import { create } from "zustand";
import { persist } from "zustand/middleware";
import { STAGE_CARD, templateSlot } from "@/lib/stageConstants";

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

/**
 * ADR-0028 canvas "uses" — assignable at creation.
 *
 * This was documented as "metadata only (label, no behavior)", and that stopped being true
 * when `relationship` began gating the arrange-by-relationship control. A type DOES dispatch
 * behaviour, and there are now two instances of it: `relationship` gates a control, and
 * `portfolio_planning` gates the planning chrome and carries a default arrangement.
 *
 * What a type governs: CHROME (what mounts around the canvas) and ARRANGEMENT (where its
 * first cards land). What a type must never govern: what the canvas may HOLD. Every canvas
 * takes the same SPO-tagged answer artifacts (ADR-0028 §2) and any card drags onto any
 * canvas. A type that restricts content stops being a lens and becomes a container, and
 * canvases stop being one substrate and become separate apps.
 */
export type CanvasUse =
  | "aggregation"
  | "workflow"
  | "relationship"
  | "portfolio_planning";

export interface CanvasItem {
  id: string; // answer id
  x: number;
  y: number; // world coords, top-left of card
  /**
   * World-space footprint. OPTIONAL — absent means the default card size, which is what
   * every canvas authored before this field existed carries. ADR-0042 §4 names size as
   * arrangement (UI-owned, persisted with the canvas, never recomputed, never in a payload),
   * so this implements a written ruling rather than introducing a concept.
   *
   * Read through `cardSize()` rather than these fields directly: it applies the default and
   * refuses a zero, which a measuring container would render as an invalid size.
   */
  w?: number;
  h?: number;
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
  /** A zoomed-into GROUP (day / topic / type) on the global canvas — the
   *  mid-level between overview and a single card. StageGroup.id. */
  groupKey: string | null;

  // navigation
  focus: (id: string) => void;
  clearFocus: () => void;
  openFullPane: () => void;
  closeFullPane: () => void;
  setFocusTab: (t: StageFocusTab) => void;
  setView: (v: string) => void;
  setGroup: (id: string | null) => void;
  clearGroup: () => void;

  // custom canvases
  setCanvases: (canvases: CustomCanvas[]) => void; // replace all (server hydrate)
  createCanvas: (name: string, use?: CanvasUse, enter?: boolean) => string;
  renameCanvas: (id: string, name: string) => void;
  deleteCanvas: (id: string) => void;
  addItemAuto: (canvasId: string, answerId: string) => void; // auto-slot placement
  addItemAt: (canvasId: string, answerId: string, x: number, y: number) => void;
  moveItem: (canvasId: string, answerId: string, x: number, y: number) => void;
  /** Arrangement, per ADR-0042 §4 — persists with the canvas. Non-positive dims are refused. */
  resizeItem: (canvasId: string, answerId: string, w: number, h: number) => void;
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
      groupKey: null,

      // Focusing a NEW card defaults to the Answer view; re-focusing the card
      // you're already on KEEPS the current peer view (the tab selector is the
      // control) — so clicking / double-clicking a card while on the Decision
      // Map doesn't snap back to Answer.
      focus: (id) =>
        set((s) => ({ focusId: id, focusTab: s.focusId === id ? s.focusTab : "answer" })),
      clearFocus: () => set({ focusId: null, fullPane: false }),
      openFullPane: () => set({ fullPane: true }),
      closeFullPane: () => set({ fullPane: false }),
      setFocusTab: (t) => set({ focusTab: t }),
      // Entering any canvas zooms out (per the design: chip click clears focus).
      setView: (v) => set({ view: v, focusId: null, fullPane: false, groupKey: null }),
      // Zoom into a group (clears any single-card focus).
      setGroup: (id) => set({ groupKey: id, focusId: null, fullPane: false }),
      clearGroup: () => set({ groupKey: null }),

      setCanvases: (canvases) => set({ canvases }),
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
            // A typed canvas places its first cards where its template says; everything else
            // falls through to the generic slot. Routing the template through the ORDINARY
            // add path is the point: a seeded canvas and a hand-built one differ by nothing
            // a consumer can see.
            const slot = templateSlot(c.use, c.items.length) ?? slotFor(c.items.length);
            return { ...c, items: [...c.items, { id: answerId, ...slot }] };
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
      // Size is arrangement (ADR-0042 §4), so it lives here beside position and rides the
      // same canvas persistence. A non-positive dimension is refused rather than stored:
      // the default is recoverable, a zero-size card is not, and a card measuring zero takes
      // any ResponsiveContainer inside it down with it.
      resizeItem: (canvasId, answerId, w, h) =>
        set((s) => {
          // Same finiteness rule as cardSize: Infinity passes a bare > 0 check and would be
          // persisted to /me/canvases, coming back on every device.
          const ok = (v: number) => Number.isFinite(v) && v > 0;
          if (!ok(w) || !ok(h)) return s;
          return {
            canvases: s.canvases.map((c) =>
              c.id === canvasId
                ? { ...c, items: c.items.map((it) => (it.id === answerId ? { ...it, w, h } : it)) }
                : c,
            ),
          };
        }),
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
