import { create } from "zustand";
import { persist } from "zustand/middleware";
import {
  STAGE_CARD,
  templateSlot,
  PORTFOLIO_TEMPLATE_ID,
  type CardSize,
} from "@/lib/stageConstants";
import { naturalContentHeight, tallestContentHeight } from "@/lib/naturalCardSize";
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
  /**
   * WHICH RATIFIED TEMPLATE SEEDED THIS BOARD — ADR-0050 §1/§6, the id of
   * `policy/canvases/<template_id>.yaml`.
   *
   * SEPARATE FROM `use`, AND §7 IS EXPLICIT ABOUT WHY. `use` is the LENS — what chrome the
   * board wears, a property of how a person reads it. `template_id` names the policy artifact
   * that arranged it. They were one concept while there was one template and they are not one
   * concept: keyed by the lens, a second ratified board could not have its own arrangement
   * without inventing a lens for it, and two boards sharing a lens could not differ in layout.
   *
   * ABSENT ON EVERY BOARD AUTHORED BEFORE TEMPLATES HAD IDS, and on every board a person built
   * by hand — §8: a board a user builds in the UI stays a user board. Absent means "look up by
   * `use`", which is what those boards have always done.
   */
  template_id?: string;
  /**
   * The ratified content this board was seeded from — `<template_id>@<first 12 hex of sha256>`
   * per §1. Carried, never interpreted: cortex does not merge overlays or verify digests, and
   * a client that recomputed one would be a second opinion about a policy artifact.
   */
  template_ref?: string;
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

  /**
   * The seed answer this canvas was composed from, and the reason boards stopped multiplying.
   *
   * IT EXISTS TO MAKE SEEDING IDEMPOTENT. The receiver used to guard against re-seeding by
   * remembering which artifacts were present when it mounted — "so history cannot seed". On a
   * fresh load that set is EMPTY, because artifacts hydrate from Electric after mount, so every
   * historical seed answer arrived looking brand new and minted another board. One per seed
   * answer, every reload, for ever.
   *
   * A timing guard cannot fix a timing assumption. This is a fact instead: a seed answer that
   * already has a board does not get another, whatever order anything loads in, across reloads
   * and across tabs, because it persists with the canvas.
   */
  seededFrom?: string;
}

const GLOBAL = "global";

interface StageState {
  // ── durable ──
  view: string; // 'global' | canvasId
  canvases: CustomCanvas[];
  /**
   * SEED ANSWERS WHOSE BOARD THE USER DELETED — a tombstone, and it has to be durable.
   *
   * Deleting a seeded canvas did not stick. The board went, the page was reloaded, every
   * historical seed answer arrived looking new, `seededFrom` matched no canvas because the
   * canvas was gone, and the board came straight back. The idempotency check answers "does
   * this seed already have a board", which is the wrong question after a deletion: absence
   * is exactly what deleting produced, so the guard read the user's decision as its trigger.
   *
   * Recording the DECISION rather than inferring it from state is the only fix that survives
   * a reload, because the state it would have to infer from is the state the user asked for.
   *
   * It does NOT remove the offer. The answer card keeps its link and rebuilding is one click —
   * a deletion says "not on my board right now", not "never again".
   */
  dismissedSeeds: string[];
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
  seedPortfolioCanvas: (
    artifactIds: string[],
    name?: string,
    enter?: boolean,
    /** The seed ANSWER this board comes from. Makes seeding idempotent — see CustomCanvas. */
    seededFrom?: string,
    /**
     * A PERSON ASKED FOR THIS BOARD, RIGHT NOW.
     *
     * The watcher seeds automatically as answers arrive, and must not resurrect a board the
     * user deleted. A click on the answer card's link is the opposite case: it is the request
     * the tombstone was recording the absence of, so it clears it and rebuilds. Without the
     * distinction the two callers would need the same answer to different questions.
     */
    requested?: boolean,
    /**
     * Which ratified template arranges this board — ADR-0050 §7's `template_id`.
     *
     * WITHOUT THIS, EVERY SEEDED BOARD WAS A PORTFOLIO BOARD. `createCanvas` was called with a
     * hardcoded `portfolio_planning` lens and nothing set `template_id` at all, so placement
     * fell through to the legacy `use` alias — correct while one template existed, and wrong
     * the moment a second one seeds: the six finance panels would have been laid out by the
     * five-slot portfolio arrangement and the sixth placed generically. SILENTLY, because the
     * lookup SUCCEEDS — it just succeeds with the wrong template, which is the one case the
     * unlanded-row warning cannot see.
     */
    templateId?: string,
  ) => string;
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
      dismissedSeeds: [],
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
            const comps = (id: string) =>
              useCanvasStore.getState().artifacts.find((a) => a.id === id)?.rendered_output
                ?.components;
            const rowContentH =
              tallestContentHeight(c.items.slice(1).map((it) => comps(it.id))) ?? undefined;
            const anchorContentH = naturalContentHeight(comps(c.items[0]?.id ?? "")) ?? undefined;
            let changed = false;
            const items = c.items.map((it, i) => {
              // BY `template_id` WHEN THERE IS ONE, else by `use` — see the field's own note.
              // A board seeded before ids existed keeps the layout it has always had.
              const slot = templateSlot(
                c.template_id ?? c.use,
                i,
                vp,
                rowContentH,
                anchorContentH,
              );
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

      /**
       * THE SERVER HYDRATE, AND IT HONOURS THE TOMBSTONE.
       *
       * This was a blind replace, and it is the SECOND path that recreates a deleted board —
       * the one the first repair missed. `dismissedSeeds` stopped the seed WATCHER rebuilding a
       * board from its answer; it did nothing about `/me/canvases` handing the same board
       * straight back on the next load. Two producers of a canvas, one guarded.
       *
       * "I delete them all, refresh, and they come right back" was therefore STILL TRUE after a
       * fix that closed the path I happened to be reading. The lesson is one this repo already
       * has written down: mount the guard on the POPULATION of writers, not on the site you
       * were looking at.
       *
       * THE TOMBSTONE OUTRANKS THE SERVER COPY, and only for seeded boards. A deletion is the
       * user's recorded DECISION; the server copy is derived state that can lag it — the save
       * is debounced, so a delete followed quickly by a reload may never have been sent. When
       * they disagree, the decision wins. A hand-built canvas has no seed and is never
       * filtered: nothing would recreate it, so nothing needs to stop it coming back.
       */
      setCanvases: (canvases) =>
        set((s) => ({
          canvases: canvases.filter(
            (c) => !c.seededFrom || !s.dismissedSeeds.includes(c.seededFrom),
          ),
        })),
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
        set((s) => {
          // RECORD THE DECISION, not just its effect. A seeded board removed from `canvases`
          // is indistinguishable from one that was never built, and the seed watcher rebuilds
          // anything it cannot find — so without this the delete undoes itself on the next
          // load. Only seeded boards need a tombstone; a hand-made canvas has nothing that
          // would recreate it.
          const gone = s.canvases.find((c) => c.id === id);
          const seed = gone?.seededFrom;
          return {
            canvases: s.canvases.filter((c) => c.id !== id),
            view: s.view === id ? GLOBAL : s.view,
            dismissedSeeds:
              seed && !s.dismissedSeeds.includes(seed)
                ? [...s.dismissedSeeds, seed]
                : s.dismissedSeeds,
          };
        }),

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
            const comps = (id: string) =>
              arts.find((a) => a.id === id)?.rendered_output?.components;
            // Slot 0 is the anchor and is measured ALONE. Folding it into the row figure
            // inflated the three cards that did not need the room and left the one that did
            // on a constant.
            const anchorNatural = naturalContentHeight(comps(held[0]));
            const natural =
              rowContentH ??
              tallestContentHeight(held.slice(1).map(comps));
            const slot =
              templateSlot(
                // See the drop above and `template_id`: by id when the board has one.
                c.template_id ?? c.use,
                c.items.length,
                get().viewport,
                natural ?? undefined,
                anchorNatural ?? undefined,
              ) ??
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
      seedPortfolioCanvas: (
        artifactIds,
        name = "Portfolio Planning",
        enter = true,
        seededFrom,
        requested = false,
        templateId,
      ) => {
        // ALREADY SEEDED IS A NO-OP that returns the board it made last time rather than a
        // second one. The check lives HERE, not only in the receiver, because this is the one
        // place a board is minted — a guard at a caller protects that caller and nothing else.
        if (seededFrom) {
          const existing = get().canvases.find((c) => c.seededFrom === seededFrom);
          if (existing) {
            if (enter) set({ view: existing.id, focusId: null, fullPane: false });
            return existing.id;
          }
          // DELETED ON PURPOSE STAYS DELETED — unless a person is asking for it again.
          //
          // Reached on every reload, because hydration replays every historical seed answer
          // through here. Before the tombstone this branch did not exist and the board was
          // rebuilt each time, which is why deleting one never appeared to work.
          if (!requested && get().dismissedSeeds.includes(seededFrom)) return "";
          if (requested) {
            set((z) => ({ dismissedSeeds: z.dismissedSeeds.filter((d) => d !== seededFrom) }));
          }
        }
        // THE LENS STAYS `portfolio_planning` AND THE TEMPLATE IS RECORDED SEPARATELY, which
        // is §7's whole point: `use` is the chrome a person reads the board through, and
        // `template_id` names the ratified YAML that arranged it. Giving the finance board its
        // own lens is a product ruling nobody has made; giving it its own ARRANGEMENT is what
        // the ratified file already says.
        //
        // Defaulting to the first template preserves exactly today's behaviour for a producer
        // that sends no id — which is every producer today.
        const id = get().createCanvas(name, "portfolio_planning", enter);
        set((z) => ({
          canvases: z.canvases.map((c) =>
            c.id === id ? { ...c, template_id: templateId || PORTFOLIO_TEMPLATE_ID } : c,
          ),
        }));
        // MEASURED ONCE, OVER THE WHOLE SET, BEFORE ANYTHING IS PLACED. Measuring
        // incrementally would size each card against only what preceded it, so the tallest
        // card arriving last would get a taller slot than its neighbours and the two lower
        // rows would not line up. One board, one row height.
        const arts = useCanvasStore.getState().artifacts;
        const comps = (a: string) =>
          arts.find((x) => x.id === a)?.rendered_output?.components;
        const rowContentH = tallestContentHeight(artifactIds.slice(1).map(comps)) ?? undefined;
        for (const artifactId of artifactIds) get().addItemAuto(id, artifactId, rowContentH);
        // Stamped AFTER composition, so a board only claims a seed it was actually built from.
        if (seededFrom) {
          set((z) => ({
            canvases: z.canvases.map((c) => (c.id === id ? { ...c, seededFrom } : c)),
          }));
        }
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
      // `dismissedSeeds` is durable for the same reason `seededFrom` is: the thing it
      // protects against is a RELOAD re-seeding from history, so a tombstone that lived only
      // in memory would be gone at exactly the moment it is needed.
      partialize: (s) => ({
        canvases: s.canvases,
        view: s.view,
        dismissedSeeds: s.dismissedSeeds,
      }),
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
