import { create } from "zustand";
import { persist } from "zustand/middleware";
import { STAGE_CARD, templateSlot, type CardSize } from "@/lib/stageConstants";
import { tallestContentHeight } from "@/lib/naturalCardSize";
import { useCanvasStore } from "@/store/useCanvasStore";

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
  /**
   * TRUE once a HUMAN has placed, moved or resized a card here.
   *
   * The distinction is what makes re-fitting a template safe at all. A board the reader
   * arranged is theirs and must never be reflowed — presenting it would rearrange the room's
   * board, which is the failure presentation mode exists not to cause. A board still in the
   * arrangement its template gave it has NO arrangement to preserve, so re-fitting it to a
   * differently-shaped pane takes nothing from anyone.
   *
   * Set by the gestures that ARE arrangement — drop-at, move, resize. Never by seeding or
   * auto-placement, which are the template speaking rather than a person.
   */
  arranged?: boolean;
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
  /**
   * The stage pane`s pixel size, published by the stage on mount and on resize.
   *
   * EPHEMERAL AND NOT PERSISTED. It describes the window a canvas is being read in, not the
   * canvas — persisting it would restore one machine`s window shape onto another`s. A
   * template needs it because a board laid out in the wrong proportions leaves the pane`s
   * width unused, which is what the fixed-coordinate template did.
   *
   * The default is a plausible landscape pane rather than 0x0: a template asked for a slot
   * before the first measure should produce a usable board, not a degenerate one.
   */
  viewport: CardSize;
  setViewport: (vp: CardSize) => void;
  setGroup: (id: string | null) => void;
  clearGroup: () => void;

  // custom canvases
  setCanvases: (canvases: CustomCanvas[]) => void; // replace all (server hydrate)
  createCanvas: (name: string, use?: CanvasUse, enter?: boolean) => string;
  renameCanvas: (id: string, name: string) => void;
  deleteCanvas: (id: string) => void;
  /**
   * Auto-slot placement. `rowContentH` lets a BATCH size every card it places against the
   * tallest content in the batch — without it each card is measured against only what is
   * already on the canvas, so a tall card arriving last gets a taller slot while its
   * neighbours keep short ones and the rows go ragged.
   */
  addItemAuto: (canvasId: string, answerId: string, rowContentH?: number) => void;
  addItemAt: (canvasId: string, answerId: string, x: number, y: number) => void;
  moveItem: (canvasId: string, answerId: string, x: number, y: number) => void;
  /** Arrangement, per ADR-0042 §4 — persists with the canvas. Non-positive dims are refused. */
  resizeItem: (canvasId: string, answerId: string, w: number, h: number) => void;
  removeItem: (canvasId: string, answerId: string) => void;
  /**
   * The client half of "make me a portfolio canvas": receive an ordered set of already-minted
   * artifacts and compose a typed canvas from them. Returns the new canvas id.
   *
   * Deliberately a COMPOSITION of createCanvas + addItemAuto rather than a placement routine
   * of its own. The moment seeding computes its own coordinates, a seeded canvas and a
   * hand-built one stop being the same object, and "built the way a user would build it"
   * becomes a claim instead of a fact.
   */
  seedPortfolioCanvas: (artifactIds: string[], name?: string, enter?: boolean) => string;
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
    (set, get) => ({
      view: GLOBAL,
      viewport: { w: 1440, h: 900 },
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
      setViewport: (vp) => {
        // Refuse a degenerate measure rather than storing it. A ResizeObserver fires with 0x0
        // for a hidden pane, and a template built from that would emit slots of zero size that
        // then PERSIST into the canvas — arrangement is durable, so a bad measure is not a
        // transient glitch, it is a saved layout.
        if (!Number.isFinite(vp.w) || !Number.isFinite(vp.h) || vp.w <= 0 || vp.h <= 0) return;
        const cur = get().viewport;
        if (cur.w === vp.w && cur.h === vp.h) return;

        // RE-FIT THE BOARDS NOBODY HAS ARRANGED.
        //
        // A template's board is shaped to the pane it was built for. Collapsing the rails makes
        // the pane far wider without making it taller, and the camera fits by the SMALLER
        // ratio — so a board built at 1.28 sitting in a pane at 1.85 is fitted by height and
        // simply cannot use the new width. Giving the pane more room does nothing visible,
        // which is exactly what presentation mode looked like it was doing.
        //
        // Re-fitting is not a layout change in the sense that matters: an untouched board has
        // no arrangement to lose. One that a human has moved, resized or dropped into is left
        // exactly alone — that is the promise, and `arranged` is what keeps it.
        set((s2) => ({
          viewport: vp,
          canvases: s2.canvases.map((c) => {
            if (c.arranged || !c.use) return c;
            const rowContentH =
              tallestContentHeight(
                c.items.map(
                  (it) =>
                    useCanvasStore.getState().artifacts.find((a) => a.id === it.id)
                      ?.rendered_output?.components,
                ),
              ) ?? undefined;
            let changed = false;
            const items = c.items.map((it, i) => {
              const slot = templateSlot(c.use, i, vp, rowContentH);
              if (!slot) return it;
              if (it.x === slot.x && it.y === slot.y && it.w === slot.w && it.h === slot.h) {
                return it;
              }
              changed = true;
              return { ...it, ...slot };
            });
            return changed ? { ...c, items } : c;
          }),
        }));
      },
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

      addItemAuto: (canvasId, answerId, rowContentH) =>
        set((s) => ({
          canvases: s.canvases.map((c) => {
            if (c.id !== canvasId) return c;
            if (c.items.some((it) => it.id === answerId)) return c; // dedupe
            // A typed canvas places its first cards where its template says; everything else
            // falls through to the generic slot. Routing the template through the ORDINARY
            // add path is the point: a seeded canvas and a hand-built one differ by nothing
            // a consumer can see.
            // ROW HEIGHT FOLLOWS THE CONTENT, over every card already on this canvas plus
            // the one arriving. A grid renders all its rows and the panel scrolls, so a card
            // sized for three subjects showing four hides one silently — and any period column
            // whose only cells belong to that row then reads as missing data rather than a
            // hidden row. The template treats this as a FLOOR-raising hint, never a shrink.
            const held = [...c.items.map((it) => it.id), answerId];
            const arts = useCanvasStore.getState().artifacts;
            const natural =
              rowContentH ??
              tallestContentHeight(
                held.map((id) => arts.find((a) => a.id === id)?.rendered_output?.components),
              );
            const slot =
              templateSlot(c.use, c.items.length, get().viewport, natural ?? undefined) ??
              slotFor(c.items.length);
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
                arranged: true,
                items: c.items.map((it) => (it.id === answerId ? { ...it, x, y } : it)),
              };
            }
            return { ...c, arranged: true, items: [...c.items, { id: answerId, x, y }] };
          }),
        })),
      moveItem: (canvasId, answerId, x, y) =>
        set((s) => ({
          canvases: s.canvases.map((c) =>
            c.id === canvasId
              ? { ...c, arranged: true, items: c.items.map((it) => (it.id === answerId ? { ...it, x, y } : it)) }
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
                ? { ...c, arranged: true, items: c.items.map((it) => (it.id === answerId ? { ...it, w, h } : it)) }
                : c,
            ),
          };
        }),
      // The receiving end of the seeding intent. The catalog/BFF half asks the questions
      // through the governed path and mints real artifacts; this takes their ids and
      // arranges them. Everything it does, a user does by hand: create a typed canvas, then
      // add cards in order. The template applies because addItemAuto consults it, not
      // because seeding knows about slots — so a seeded canvas is byte-identical to a
      // hand-built one, which is what makes it a starting point rather than a second kind
      // of object.
      //
      // ORDER IS THE DECLARATION: the caller decides which measure lands in which slot by
      // the order it passes them. That belongs to the seeding intent, not here — a template
      // that assigned measures to slots would be reaching into the seeder's job.
      seedPortfolioCanvas: (artifactIds, name = "Portfolio Planning", enter = true) => {
        const id = get().createCanvas(name, "portfolio_planning", enter);
        // MEASURED ONCE, OVER THE WHOLE SET, BEFORE ANYTHING IS PLACED. Measuring
        // incrementally would size each card against only what preceded it, so the tallest
        // card arriving last would get a taller slot than its neighbours and the two lower
        // rows would not line up. One board, one row height.
        const arts = useCanvasStore.getState().artifacts;
        const rowContentH =
          tallestContentHeight(
            artifactIds.map((a) => arts.find((x) => x.id === a)?.rendered_output?.components),
          ) ?? undefined;
        for (const artifactId of artifactIds) get().addItemAuto(id, artifactId, rowContentH);
        return id;
      },
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
