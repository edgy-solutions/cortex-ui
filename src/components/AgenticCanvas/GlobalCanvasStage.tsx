import { useEffect, useMemo, useRef, useState } from "react";
import { foldedAskAnswers } from "@/lib/askFold";
import { Maximize2, Minimize2, LayoutGrid, GitBranch, X, Plus, Share2 } from "lucide-react";
import { useCanvasStore } from "@/store/useCanvasStore";
import { useStageStore } from "@/store/useStageStore";
import { useAnswerPanelStore } from "@/store/useAnswerPanelStore";
import { taskKindLabel } from "@/lib/taskArtifact";
import { useEvidenceStore } from "@/store/useEvidenceStore";
import { computeStageLayout, type StageMode } from "@/lib/stageLayout";
import { computeStageEdges, subjectInstanceKey, type StageEdge } from "@/lib/stageEdges";
import { fetchLineageEdges } from "@/api/client";
import { STAGE_CARD, cardSize } from "@/lib/stageConstants";
import { PlanningChrome } from "./PlanningChrome";
import { StageCard } from "./StageCard";
import { CanvasPane } from "./CanvasPane";
import { DockBar } from "./DockBar";

/**
 * GlobalCanvasStage — the center canvas as ONE camera-driven world (ADR-0028
 * canvas-dock model). Stages 1–3:
 *   - overview / focus / full-pane camera (Stage 1)
 *   - global auto-layout by the list mode + morph (Stage 2)
 *   - the DOCK + custom canvases: switch to a custom canvas (freeform board),
 *     add answers by dropping onto chips (from the list or by dragging cards),
 *     grip-move / ✕-remove items, drop-at-point (Stage 3).
 *
 * The GLOBAL view is derived (auto-arranged, never hand-placed). CUSTOM views
 * are freeform, persisted. The camera + focus tabs + full-pane work the same in
 * both. GRAPH mode / relationship-layout are the post-canvas edge arc.
 */

const CAM_MS = 620;
const EASE = "cubic-bezier(.3,.75,.25,1)";
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/**
 * The overview camera: fit the whole world into the pane.
 *
 * ── A FIT SHRINKS TO FIT. IT NEVER MAGNIFIES. ────────────────────────────────────────────
 *
 * This was the only camera branch with no bound — the focused and grouped branches both clamp —
 * so whenever the world was SMALLER than the pane the scale went above 1 and every card was
 * blown up past the size it was designed at. Opening a seeded board landed near 170%:
 * `customWorld` floors a small board at 1500x950, a wide pane is far larger than that, and
 * "fit" faithfully magnified to fill it. That is the "zoomed into super large" on a board the
 * user had just asked to see.
 *
 * Filling the pane by enlarging the cards is not showing MORE of the board, it is showing the
 * same board worse. Empty margin around a correctly-sized board is the honest answer when the
 * board is smaller than the room it has.
 *
 * EXTRACTED so the bound can be asserted. Inline in the memo it was reachable only by mounting
 * the whole stage, which is why the one branch that most needed a test was the one that never
 * got one.
 */
export function worldFitCam(
  world: { w: number; h: number },
  vp: { w: number; h: number },
  isGlobal: boolean,
): { tx: number; ty: number; s: number } {
  // The global overview keeps a generous margin — it is a wall of many cards and the dock
  // overlaps its lower edge. A CUSTOM canvas is a laid-out board built to the pane on purpose,
  // so the same margin is just unused width.
  const fill = isGlobal ? 0.9 : 0.97;
  const s = Math.min(Math.min(vp.w / world.w, vp.h / world.h) * fill, 1);
  return {
    tx: (vp.w - world.w * s) / 2,
    ty: (vp.h - world.h * s) / 2 - (isGlobal ? 20 : 6),
    s,
  };
}

function customWorld(items: { x: number; y: number; w?: number; h?: number }[]) {
  if (!items.length) return { w: 1500, h: 950 };
  let mx = 0;
  let my = 0;
  for (const it of items) {
    // Per-item footprint, not the constant: an oversized card must extend the world it
    // sits in, or the camera fits a box that does not contain it and it clips off-stage.
    const sz = cardSize(it);
    mx = Math.max(mx, it.x + sz.w);
    my = Math.max(my, it.y + sz.h);
  }
  // Pad PROPORTIONALLY, not by a flat 140. A fixed pad is a large share of a small board
  // and a rounding error on a big one, and — worse for a template — it distorts the aspect,
  // so a board deliberately shaped to the pane arrives at the camera a different shape than
  // it left. The floors stay: they stop a one-card canvas from zooming to a wall of pixels.
  const pad = 0.03;
  return { w: Math.max(1500, mx * (1 + pad)), h: Math.max(950, my * (1 + pad)) };
}

export function GlobalCanvasStage() {
  const artifacts = useCanvasStore((s) => s.artifacts);
  const currentArtifactId = useCanvasStore((s) => s.currentArtifactId);
  const setCurrentArtifact = useCanvasStore((s) => s.setCurrentArtifact);

  const focusId = useStageStore((s) => s.focusId);
  const fullPane = useStageStore((s) => s.fullPane);
  const focusTab = useStageStore((s) => s.focusTab);
  const groupKey = useStageStore((s) => s.groupKey);
  const focus = useStageStore((s) => s.focus);
  const clearFocus = useStageStore((s) => s.clearFocus);
  const setGroup = useStageStore((s) => s.setGroup);
  const clearGroup = useStageStore((s) => s.clearGroup);
  const openFullPane = useStageStore((s) => s.openFullPane);
  const closeFullPane = useStageStore((s) => s.closeFullPane);
  const setFocusTab = useStageStore((s) => s.setFocusTab);
  const view = useStageStore((s) => s.view);
  const canvases = useStageStore((s) => s.canvases);
  const setView = useStageStore((s) => s.setView);
  const addItemAt = useStageStore((s) => s.addItemAt);
  const addItemAuto = useStageStore((s) => s.addItemAuto);
  const moveItem = useStageStore((s) => s.moveItem);
  const resizeItem = useStageStore((s) => s.resizeItem);
  const removeItem = useStageStore((s) => s.removeItem);
  const createCanvas = useStageStore((s) => s.createCanvas);

  const sortMode = useAnswerPanelStore((s) => s.sortMode) as StageMode;

  const stageRef = useRef<HTMLDivElement>(null);
  const [vp, setVp] = useState({ w: 1200, h: 700 });

  // Lasso multi-select (global overview only).
  const [sel, setSel] = useState<string[]>([]);
  const [marquee, setMarquee] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const selRef = useRef(sel);
  selRef.current = sel;

  const activeCanvas = view === "global" ? null : canvases.find((c) => c.id === view);
  const isGlobal = !activeCanvas;

  const artifactById = useMemo(() => {
    const m: Record<string, (typeof artifacts)[number]> = {};
    for (const a of artifacts) m[a.id] = a;
    return m;
  }, [artifacts]);

  // Typed cross-answer edges: same-subject (sync, client-side) + lineage
  // (directed, fetched from Engine D's gated endpoint only in GRAPH mode).
  const [lineageEdges, setLineageEdges] = useState<StageEdge[]>([]);
  useEffect(() => {
    if (!isGlobal || sortMode !== "GRAPH") {
      setLineageEdges([]);
      return;
    }
    const subjects = artifacts
      .map((a) => ({ answer_id: a.id, urn: subjectInstanceKey(a) }))
      .filter((s) => s.urn);
    if (subjects.length < 2) {
      setLineageEdges([]);
      return;
    }
    let cancelled = false;
    fetchLineageEdges(subjects).then((es) => {
      if (cancelled) return;
      setLineageEdges(
        es.map((e) => ({ from: e.from, to: e.to, kind: "lineage" as const, directed: true })),
      );
    });
    return () => {
      cancelled = true;
    };
  }, [isGlobal, sortMode, artifacts]);
  // AN ANSWERED ASK IS SUPERSEDED ON BOTH SURFACES — and it is not the same operation on each.
  const folded = useMemo(() => foldedAskAnswers(artifacts), [artifacts]);

  /**
   * THE CARDS GLOBAL ACTUALLY DRAWS — and the layout must be computed from THIS, not from all
   * artifacts.
   *
   * Filtering the folded ask out of `entries` while laying out the full list allocated a slot
   * to a card that was never drawn, so a superseded ask left a HOLE where it used to be. The
   * board looked like something had been deleted rather than answered, which is the opposite of
   * what the fold is for.
   *
   * Edges are computed from the same list for the same reason: an edge to a card that is not
   * drawn is a line into empty space.
   */
  const visibleArtifacts = useMemo(
    () => artifacts.filter((a) => !folded.has(a.id)),
    [artifacts, folded],
  );

  const edges = useMemo(
    () => [...computeStageEdges(visibleArtifacts), ...lineageEdges],
    [visibleArtifacts, lineageEdges],
  );
  const globalLayout = useMemo(
    () => computeStageLayout(visibleArtifacts, sortMode, edges),
    [visibleArtifacts, sortMode, edges],
  );

  // The cards to render + their positions, sourced by view.
  const entries = useMemo(() => {
    if (isGlobal) {
      return (
        // GLOBAL is computed, so a superseded ask is simply DROPPED — and `visibleArtifacts` is
        // what the LAYOUT was built from, so the board closes up instead of leaving a hole
        // where the ask used to be. Nothing was arranged, so nothing is lost.
        visibleArtifacts
          // GLOBAL is a computed view with no per-item arrangement, so every card is uniform.
          .map((a) => ({ a, pos: globalLayout.positions[a.id], itemId: null as string | null, size: cardSize() }))
          .filter((e) => e.pos)
      );
    }
    return activeCanvas!.items
      .map((it) => {
        // A CANVAS SLOT IS REPLACED, NOT REMOVED. This card sits where a person put it, at a
        // size they may have chosen; dropping it would leave a hole in a board they arranged.
        // The slot draws the ANSWER instead — same position, same footprint, the question
        // become its result. That is "one item, one card" on a surface that HAS arrangement.
        //
        // SUBSTITUTED AT RENDER, NEVER WRITTEN BACK. Rewriting the stored item id would edit a
        // board on its owner's behalf, and an arranged board is theirs. The slot keeps naming
        // the ask; what it DRAWS is whatever superseded it.
        const answerId = folded.get(it.id);
        const a = answerId ? artifactById[answerId] : artifactById[it.id];
        return { a, pos: { x: it.x, y: it.y }, itemId: it.id, size: cardSize(it) };
      })
      .filter((e) => e.a);
  }, [isGlobal, visibleArtifacts, globalLayout, activeCanvas, artifactById, folded]);

  const world = useMemo(() => {
    if (isGlobal) return globalLayout.world;
    return customWorld(activeCanvas!.items);
  }, [isGlobal, globalLayout, activeCanvas]);

  const posOf = (id: string) => entries.find((e) => e.a.id === id)?.pos ?? null;
  // The focused card's own footprint — fitting the camera to the DEFAULT size would
  // under- or over-zoom any card the user has resized.
  const sizeOf = (id: string) => entries.find((e) => e.a.id === id)?.size ?? cardSize();

  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    // The measure serves two readers: the camera, which fits the world to the pane, and the
    // TEMPLATE, which lays a seeded board out in the pane`s proportions. Publishing it to the
    // store is what lets a template be a function of the window rather than a fixed board that
    // leaves the width unused. The store refuses a degenerate measure — see setViewport.
    const publish = () => {
      const vp = { w: el.clientWidth, h: el.clientHeight };
      setVp(vp);
      useStageStore.getState().setViewport(vp);
    };
    const ro = new ResizeObserver(publish);
    ro.observe(el);
    publish();
    return () => ro.disconnect();
  }, []);

  // Camera has three fits: a focused CARD, a focused GROUP (day/topic/type
  // box), else the whole world (overview).
  /** The camera: world-space translation plus scale. */
  type Cam = { tx: number; ty: number; s: number };
  // DECLARED BEFORE THE MEMO because the memo now READS it — a focused card with no position
  // holds the previous camera rather than fitting the world. Seeded with a neutral identity so
  // the very first render has something to hold.
  const camRef = useRef<Cam>({ tx: 0, ty: 0, s: 1 });

  const cam = useMemo<Cam>(() => {
    const { w: vw, h: vh } = vp;
    const fp = focusId ? posOf(focusId) : null;
    /**
     * A FOCUSED CARD WITH NO POSITION MUST NOT MEAN "SHOW EVERYTHING".
     *
     * This fell through to the world fit, so any moment where the focused card was briefly
     * absent from the layout threw the camera all the way out — while the reader was looking
     * at that card. It is the most disruptive fallback available and it was the default.
     *
     * The fold makes it reachable a new way: you are reading an ask, its answer arrives, the
     * ask leaves the computed list, and the card under the camera stops existing. Holding the
     * previous camera keeps the view still through the swap; the effect below then moves focus
     * to the answer deliberately, which is a MOVE the reader can follow rather than a jump.
     */
    if (focusId && !fp) return camRef.current;
    if (fp) {
      const fs2 = sizeOf(focusId!);
      const s = clamp(
        Math.min((vw * 0.6) / fs2.w, (vh * 0.82) / fs2.h),
        1.1,
        2.6,
      );
      const cx = fp.x + fs2.w / 2;
      const cy = fp.y + fs2.h / 2;
      return { tx: vw / 2 - cx * s, ty: vh / 2 - cy * s, s };
    }
    const grp = isGlobal && groupKey ? globalLayout.groups.find((g) => g.id === groupKey) : null;
    if (grp) {
      const b = grp.bbox;
      const s = clamp(Math.min((vw * 0.86) / b.w, (vh * 0.78) / b.h), 0.15, 1.6);
      const cx = b.x + b.w / 2;
      const cy = b.y + b.h / 2;
      return { tx: vw / 2 - cx * s, ty: vh / 2 - cy * s - 10, s };
    }
    // The global overview keeps a generous margin — it is a wall of many cards and the dock
    // overlaps its lower edge. A CUSTOM canvas is a laid-out board that was built to the pane
    // on purpose, so the same margin is just unused width: three insets compounded (this one,
    // the world pad, and the template margin) left a seeded board at 78% of its pane.
    return worldFitCam(world, { w: vw, h: vh }, isGlobal);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusId, groupKey, isGlobal, globalLayout, entries, vp, world.w, world.h]);

  // The focused card's task marker (if any) — drives per-kind tab labels: the
  // three tabs are citizen-agnostic lenses (content / provenance / focus), so a
  // task relabels them (Review / Workflow / Expand), not a different tab set.
  const focusedTaskRef = focusId ? artifactById[focusId]?.task_ref : undefined;

  // Evidence is a docked flap of the review card (rendered in CanvasPane). It
  // leaves with its citizen: navigating to a different card dismisses it.
  const dismissEvidence = useEvidenceStore((s) => s.dismiss);
  useEffect(() => {
    dismissEvidence();
  }, [focusId, dismissEvidence]);
  camRef.current = cam;

  // Selecting an answer in the LIST jumps to GLOBAL and zooms to it — but an
  // in-canvas card click (which also sets currentArtifactId, so DecisionMap
  // reads it) must zoom IN PLACE on the current canvas, not jump to global.
  // onCardClick/Double flag the internal selection so this effect skips the
  // global jump (they've already called focus()).
  const prevCurrent = useRef<string | null>(null);
  const internalSelect = useRef(false);
  useEffect(() => {
    if (currentArtifactId && currentArtifactId !== prevCurrent.current) {
      prevCurrent.current = currentArtifactId;
      if (internalSelect.current) {
        internalSelect.current = false; // in-canvas click already focused
        return;
      }
      setView("global");
      focus(currentArtifactId);
    }
  }, [currentArtifactId, setView, focus]);

  // ESC steps back one level: selection → full-pane/card → group → overview.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (selRef.current.length) {
        e.stopPropagation();
        setSel([]);
        return;
      }
      if (fullPane) {
        // ONE RUNG, NOT THREE. This called `clearFocus()` AND `clearGroup()`, so Esc from an
        // expanded card left the card, left the focus, and left the group in a single press —
        // landing at the overview with no way to get back to the card you were reading except
        // to find it again. The zoom went in one step at a time and came out all at once.
        closeFullPane();
        e.stopPropagation();
        return;
      }
      if (focusId) {
        e.stopPropagation();
        clearFocus(); // → back to the group (if any), else overview
        return;
      }
      if (groupKey) {
        e.stopPropagation();
        clearGroup();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [focusId, fullPane, groupKey, clearFocus, clearGroup, closeFullPane]);

  // Switching the list mode re-lays-out the global map — zoom out first.
  const prevMode = useRef(sortMode);
  useEffect(() => {
    if (prevMode.current !== sortMode) {
      prevMode.current = sortMode;
      clearFocus();
      clearGroup();
    }
  }, [sortMode, clearFocus, clearGroup]);

  /**
   * WHEN THE CARD YOU ARE READING IS SUPERSEDED, FOLLOW IT TO ITS ANSWER.
   *
   * You pick from an ask, keep watching it, and its answer arrives. The ask leaves the board —
   * that is the fold working — and without this the camera is left focused on a card that no
   * longer exists. Holding the previous camera (see `cam`) stops the jump; this is what makes
   * the swap a MOVE: focus lands on the answer that replaced it, in the place the question was.
   *
   * Deliberately only for the FOLD. A card that vanishes for any other reason leaves focus
   * alone, because "the thing you were reading was replaced by this" is a claim the lineage
   * makes and nothing else here can.
   */
  useEffect(() => {
    if (!focusId) return;
    const successor = folded.get(focusId);
    if (successor) {
      setCurrentArtifact(successor);
      focus(successor);
    }
  }, [focusId, folded, focus, setCurrentArtifact]);

  // ONLY FLAG A SELECTION THAT ACTUALLY CHANGES THE CURRENT ARTIFACT — a stale `true` here
  // swallowed the NEXT one.
  //
  // The flag tells the effect above "this card was clicked in place, do not jump to global",
  // and the effect clears it. But the effect only runs when `currentArtifactId` CHANGES, so
  // clicking the card that is already current set the flag and nothing ever cleared it. The
  // next new artifact — a question the reader then asked — hit the effect with the flag still
  // set, returned early, and never focused. The ask card appeared on the canvas while focus
  // stayed on whatever they had been reading, so they had to hunt for their own question.
  const flagInternal = (id: string) => {
    internalSelect.current = id !== currentArtifactId;
  };

  const onCardClick = (id: string) => {
    setSel([]); // clicking a card clears the lasso selection and focuses it
    flagInternal(id); // zoom in place; don't jump to global
    setCurrentArtifact(id);
    focus(id);
  };
  const onCardDouble = (id: string) => {
    flagInternal(id);
    setCurrentArtifact(id);
    focus(id);
    openFullPane();
  };

  // Lasso: pointer-down on empty stage (global overview, not focused) starts a
  // marquee; live-highlight cards whose VIEWPORT rect intersects it.
  const rectsIntersect = (
    a: { x: number; y: number; w: number; h: number },
    b: { x: number; y: number; w: number; h: number },
  ) => !(a.x + a.w < b.x || b.x + b.w < a.x || a.y + a.h < b.y || b.y + b.h < a.y);

  const onStageDown = (e: React.PointerEvent) => {
    if (!isGlobal || focusId) return;
    const t = e.target as HTMLElement;
    if (
      t.closest("[data-stage-card]") ||
      t.closest("[data-canvas-chip]") ||
      t.closest("[data-overlay]") ||
      t.closest("[data-group-label]")
    )
      return;
    const rect = stageRef.current?.getBoundingClientRect();
    if (!rect) return;
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;
    let last: { x: number; y: number; w: number; h: number } | null = null;
    const onMove = (ev: PointerEvent) => {
      const x2 = ev.clientX - rect.left;
      const y2 = ev.clientY - rect.top;
      const m = { x: Math.min(sx, x2), y: Math.min(sy, y2), w: Math.abs(x2 - sx), h: Math.abs(y2 - sy) };
      last = m;
      setMarquee(m);
      const c = camRef.current;
      setSel(
        entries
          .filter(({ pos, size }) =>
            rectsIntersect(m, {
              x: pos.x * c.s + c.tx,
              y: pos.y * c.s + c.ty,
              w: size.w * c.s,
              h: size.h * c.s,
            }),
          )
          .map((en) => en.a.id),
      );
    };
    const onUp = () => {
      document.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerup", onUp);
      document.removeEventListener("pointercancel", onUp);
      setMarquee(null);
      if (!last || last.w * last.h < 40) setSel([]); // a tiny drag = background click → clear
    };
    document.addEventListener("pointermove", onMove);
    document.addEventListener("pointerup", onUp);
    // The lasso has the same leak as the move and resize gestures: a pointerup that never
    // arrives leaves this handler armed, and the marquee then follows the cursor around a
    // canvas nobody is dragging on. Found by a guard written for the other two.
    document.addEventListener("pointercancel", onUp);
  };

  // Custom-canvas: grip pointer-drag to move an item (screen delta → world).
  const gripHandler =
    (canvasId: string, itemId: string, start: { x: number; y: number }) =>
    (e: React.PointerEvent) => {
      const s = camRef.current.s;
      const ox = e.clientX;
      const oy = e.clientY;
      const onMove = (ev: PointerEvent) => {
        moveItem(canvasId, itemId, start.x + (ev.clientX - ox) / s, start.y + (ev.clientY - oy) / s);
      };
      const onUp = () => {
        document.removeEventListener("pointermove", onMove);
        document.removeEventListener("pointerup", onUp);
        document.removeEventListener("pointercancel", onUp);
      };
      document.addEventListener("pointermove", onMove);
      document.addEventListener("pointerup", onUp);
      // A lost capture must not leave a move listener armed on the document — that is exactly
      // how a finished gesture kept resizing on the next unrelated mouse movement.
      document.addEventListener("pointercancel", onUp);
    };

  /**
   * Resize a card by dragging its corner. Arrangement is UI-owned (ADR-0042 section 4), so
   * size lives beside position and rides the same canvas persistence.
   *
   * Deltas are divided by the camera scale for the same reason the move handler does it: the
   * pointer moves in SCREEN pixels and the item is stored in WORLD coordinates, so a drag at
   * 0.5 zoom would otherwise resize the card twice as fast as the cursor travels.
   *
   * A floor rather than a free drag: a card dragged to nothing is unrecoverable by dragging,
   * because there is no corner left to grab. The store refuses non-positive dimensions too —
   * this stops the gesture reaching a size a user cannot undo.
   */
  const MIN_CARD = { w: 220, h: 160 };
  const resizeHandler =
    (canvasId: string, itemId: string, start: { w: number; h: number }) =>
    (e: React.PointerEvent) => {
      e.stopPropagation();
      const s0 = camRef.current.s;
      const ox = e.clientX;
      const oy = e.clientY;
      const onMove = (ev: PointerEvent) => {
        resizeItem(
          canvasId,
          itemId,
          Math.max(MIN_CARD.w, start.w + (ev.clientX - ox) / s0),
          Math.max(MIN_CARD.h, start.h + (ev.clientY - oy) / s0),
        );
      };
      const onUp = () => {
        document.removeEventListener("pointermove", onMove);
        document.removeEventListener("pointerup", onUp);
        document.removeEventListener("pointercancel", onUp);
      };
      document.addEventListener("pointermove", onMove);
      document.addEventListener("pointerup", onUp);
      // A lost capture must not leave a move listener armed on the document — that is exactly
      // how a finished gesture kept resizing on the next unrelated mouse movement.
      document.addEventListener("pointercancel", onUp);
    };

  // relationship-layout use (ADR-0028 Use 1): one-shot arrange the canvas's
  // items by how they RELATE (same-subject clusters via the real edges),
  // writing the graph-layout positions back as the items' positions (so it
  // stays freeform + persists). Lineage edges will enrich this later.
  const arrangeByRelationship = () => {
    if (!activeCanvas) return;
    const arts = activeCanvas.items.map((it) => artifactById[it.id]).filter(Boolean);
    const cedges = computeStageEdges(arts);
    const lay = computeStageLayout(arts, "GRAPH", cedges);
    for (const a of arts) {
      const p = lay.positions[a.id];
      if (p) moveItem(activeCanvas.id, a.id, p.x, p.y);
    }
  };

  // Custom-canvas: drop dragged card(s) at the pointer (screen → world). A
  // multi-select drag carries several ids (comma-joined) — stagger them.
  const onStageDrop = (e: React.DragEvent) => {
    if (isGlobal || !activeCanvas) return;
    e.preventDefault();
    const ids = e.dataTransfer.getData("text/plain").split(",").filter(Boolean);
    if (!ids.length) return;
    const rect = stageRef.current?.getBoundingClientRect();
    if (!rect) return;
    const wx = (e.clientX - rect.left - cam.tx) / cam.s - STAGE_CARD.w / 2;
    const wy = (e.clientY - rect.top - cam.ty) / cam.s - STAGE_CARD.h / 2;
    ids.forEach((id, i) => addItemAt(activeCanvas.id, id, wx + i * 28, wy + i * 28));
  };

  return (
    <div
      ref={stageRef}
      // Selection is suppressed only while a LASSO is actually being dragged. A blanket
      // `select-none` here made every card on the canvas uncopyable — you could read a number
      // off a card and not take it with you, which is a strange property for a surface whose
      // job is showing you numbers.
      className={`h-full w-full relative overflow-hidden ${marquee ? "select-none" : ""}`}
      style={{
        background:
          "radial-gradient(rgba(80,200,220,.10) 1px, transparent 1.5px) 0 0 / 44px 44px, #070F13",
      }}
      onDragOver={(e) => {
        if (!isGlobal) e.preventDefault();
      }}
      onDrop={onStageDrop}
      onPointerDown={onStageDown}
    >
      {/* Empty states */}
      {isGlobal && artifacts.length === 0 && (
        <div className="absolute inset-0 flex items-center justify-center">
          <p className="text-[12px] font-mono uppercase tracking-widest text-slate-600">
            No answers yet — ask a question to populate the canvas
          </p>
        </div>
      )}
      {!isGlobal && activeCanvas!.items.length === 0 && (
        <div className="absolute inset-0 flex items-center justify-center px-6">
          <p className="text-[12px] font-mono uppercase tracking-widest text-slate-600 text-center max-w-md leading-relaxed">
            Empty canvas — drag rows in from the list, or go to ▦ Global and drop cards onto this canvas's chip
          </p>
        </div>
      )}
      {/*
        A BOARD THAT HOLDS CARDS AND CAN DRAW NONE OF THEM IS NOT AN EMPTY BOARD.
        Cards whose artifact is not in this client's collection are filtered out of `entries`,
        so such a board rendered as blank space — identical to a canvas nobody has put anything
        on, and it is the opposite situation. It is what a person sees after the substrate is
        wiped: canvases are durable server-side (ADR-0028, `/me/canvases`) and survive a prime
        that removes every answer they point at.

        IT DOES NOT SAY THEY ARE GONE, and it must not: answers hydrate from Electric AFTER
        mount, so "not here" is the normal state for the first moments of every load. It says
        what is true at every moment it renders — the board names N cards and this client does
        not have them — and leaves the conclusion to the reader, who knows whether they just
        wiped the backend. Nothing is deleted for them either: removing a board on a transient
        absence is the timing assumption this file has been bitten by before, and the cost of
        being wrong is somebody's arrangement.
      */}
      {!isGlobal && activeCanvas!.items.length > 0 && entries.length === 0 && (
        <div className="absolute inset-0 flex items-center justify-center px-6" data-canvas-orphaned>
          <p className="text-[12px] font-mono uppercase tracking-widest text-slate-600 text-center max-w-md leading-relaxed">
            {activeCanvas!.items.length}{" "}
            {activeCanvas!.items.length === 1 ? "card is" : "cards are"} arranged here, and none
            of them are in this client's answers — still loading, or the answers they point at
            were cleared. The arrangement is kept.
          </p>
        </div>
      )}

      {/* The world — camera transform wraps every card. */}
      <div
        className="absolute top-0 left-0"
        style={{
          width: world.w,
          height: world.h,
          transformOrigin: "0 0",
          transform: `translate(${cam.tx}px, ${cam.ty}px) scale(${cam.s})`,
          transition: `transform ${CAM_MS}ms ${EASE}`,
        }}
      >
        {/* GRAPH edges — drawn behind the cards, in world space so they track
            the camera. Same-subject edges are solid symmetric links; lineage
            edges (a later kind) will render directed/differently. */}
        {isGlobal && sortMode === "GRAPH" && edges.length > 0 && (
          <svg
            className="absolute top-0 left-0 pointer-events-none"
            width={world.w}
            height={world.h}
            style={{ overflow: "visible" }}
          >
            <defs>
              <marker
                id="lineage-arrow"
                viewBox="0 0 10 10"
                refX="9"
                refY="5"
                markerWidth="7"
                markerHeight="7"
                orient="auto-start-reverse"
              >
                <path d="M0,0 L10,5 L0,10 z" fill="rgba(180,140,255,.75)" />
              </marker>
            </defs>
            {edges.map((e, i) => {
              const p1 = globalLayout.positions[e.from];
              const p2 = globalLayout.positions[e.to];
              if (!p1 || !p2) return null;
              const x1 = p1.x + STAGE_CARD.w / 2;
              const y1 = p1.y + STAGE_CARD.h / 2;
              const x2 = p2.x + STAGE_CARD.w / 2;
              const y2 = p2.y + STAGE_CARD.h / 2;
              if (e.kind === "lineage") {
                // Directed (upstream→downstream): dashed purple with an arrow,
                // shortened so the arrowhead sits at the target card's edge.
                const dx = x2 - x1;
                const dy = y2 - y1;
                const len = Math.hypot(dx, dy) || 1;
                const off = Math.min(len * 0.5, STAGE_CARD.w * 0.55);
                return (
                  <line
                    key={i}
                    x1={x1}
                    y1={y1}
                    x2={x2 - (dx / len) * off}
                    y2={y2 - (dy / len) * off}
                    stroke="rgba(180,140,255,.55)"
                    strokeWidth={2.5}
                    strokeDasharray="8 6"
                    markerEnd="url(#lineage-arrow)"
                  />
                );
              }
              // Same-subject: symmetric solid cyan link.
              return (
                <line
                  key={i}
                  x1={x1}
                  y1={y1}
                  x2={x2}
                  y2={y2}
                  stroke="rgba(44,217,238,.35)"
                  strokeWidth={2}
                />
              );
            })}
          </svg>
        )}

        {/* Custom-canvas dressing */}
        {!isGlobal && (
          <>
            <div
              className="absolute rounded-xl border-2 border-dashed border-neon-cyan/20 pointer-events-none"
              style={{ left: 24, top: 24, width: world.w - 48, height: world.h - 48 }}
            />
          </>
        )}

        {/* Global arrangement labels (world space), cross-fade on mode change. */}
        {isGlobal && (
          <div key={sortMode} className="animate-in fade-in duration-500">
            {globalLayout.labels.map((l) => (
              <button
                key={l.id}
                data-group-label
                onClick={(e) => {
                  e.stopPropagation();
                  setGroup(l.id);
                }}
                className={`absolute font-mono font-semibold uppercase tracking-[.18em] whitespace-nowrap cursor-pointer transition-colors ${
                  groupKey === l.id
                    ? "text-neon-cyan"
                    : "text-neon-cyan/45 hover:text-neon-cyan/90"
                }`}
                style={{ left: l.x, top: l.y, fontSize: 26 }}
                title="Zoom into this group"
              >
                {l.text}
              </button>
            ))}
          </div>
        )}

        {entries.map(({ a, pos, itemId, size }) => {
          const isFocused = focusId === a.id;
          const dim = focusId && !isFocused;
          return (
            <StageCard
              key={a.id}
              artifact={a}
              focused={isFocused}
              onClick={() => onCardClick(a.id)}
              onDoubleClick={() => onCardDouble(a.id)}
              style={{ left: pos.x, top: pos.y, opacity: dim ? 0.4 : 1, zIndex: isFocused ? 10 : 1 }}
              selected={sel.includes(a.id)}
              dragIds={sel.includes(a.id) ? sel : [a.id]}
              size={size}
              onDragComplete={() => setSel([])}
              onResizeDown={
                !isGlobal && itemId
                  ? resizeHandler(activeCanvas!.id, itemId, { w: size.w, h: size.h })
                  : undefined
              }
              onGripDown={
                !isGlobal && itemId
                  ? gripHandler(activeCanvas!.id, itemId, { x: pos.x, y: pos.y })
                  : undefined
              }
              onRemove={
                !isGlobal && itemId ? () => removeItem(activeCanvas!.id, itemId) : undefined
              }
            />
          );
        })}
      </div>

      {/* THE INVITATION IS CHROME, NOT WORLD CONTENT — and it used to be the other way round.
          It sat inside the camera transform at `fontSize: 22` in world units, positioned at the
          world's bottom-right corner. So it scaled with the zoom and, once the board began
          filling the pane, it landed underneath the bottom-right card: the reader saw "…ANGE"
          clipped behind a matrix. A label about the canvas belongs beside the canvas.

          It also stops once it is no longer true. The invitation is to ARRANGE, and a board the
          reader has already arranged does not need inviting — `arranged` is exactly that fact,
          and this is its second reader after the re-fit rule. */}
      {!isGlobal && !activeCanvas?.arranged && activeCanvas!.items.length > 0 && (
        <div
          className="absolute bottom-3 right-3 z-10 font-mono uppercase tracking-[.18em] text-[9px] text-neon-cyan/25 pointer-events-none"
          data-freeform-hint
        >
          Freeform — yours to arrange
        </div>
      )}

      {/* Lasso marquee (viewport space). */}
      {marquee && (
        <div
          className="absolute border border-neon-cyan/70 bg-neon-cyan/10 pointer-events-none z-20"
          style={{ left: marquee.x, top: marquee.y, width: marquee.w, height: marquee.h }}
        />
      )}

      {/* Selection action bar — bulk-add the lasso'd cards to a canvas. */}
      {isGlobal && !focusId && !marquee && sel.length > 0 && (
        <div
          data-overlay
          className="absolute bottom-20 left-1/2 -translate-x-1/2 z-30 flex items-center gap-2 rounded-xl border border-neon-cyan/30 bg-slate-950/95 backdrop-blur-sm px-3 py-2 shadow-xl animate-in fade-in slide-in-from-bottom-2 duration-200"
        >
          <span className="text-[10px] font-mono uppercase tracking-wider text-slate-300">
            {sel.length} selected → Add to
          </span>
          {canvases.map((c) => (
            <button
              key={c.id}
              onClick={() => {
                sel.forEach((id) => addItemAuto(c.id, id));
                setSel([]);
              }}
              className="rounded-md border border-neon-cyan/30 px-2 py-1 text-[10px] font-mono uppercase tracking-wider text-neon-cyan hover:bg-neon-cyan/15 transition-colors"
            >
              {c.name}
            </button>
          ))}
          <button
            onClick={() => {
              const id = createCanvas(`Canvas ${canvases.length + 1}`, undefined, false);
              sel.forEach((aid) => addItemAuto(id, aid));
              setSel([]);
            }}
            className="flex items-center gap-1 rounded-md border border-dashed border-slate-600/60 px-2 py-1 text-[10px] font-mono uppercase tracking-wider text-slate-400 hover:text-neon-cyan transition-colors"
          >
            <Plus className="w-2.5 h-2.5" />
            New
          </button>
          <button
            onClick={() => setSel([])}
            className="ml-1 text-slate-500 hover:text-rose-400"
            title="Clear selection"
          >
            <X className="w-3 h-3" />
          </button>
        </div>
      )}

      {/* Focus overlay: peer-view tabs + expand + overview (both views). */}
      {focusId && !fullPane && (
        <>
          <div className="absolute top-3 left-1/2 -translate-x-1/2 flex items-center gap-1 rounded-lg border border-neon-cyan/25 bg-slate-950/85 backdrop-blur-sm px-1 py-1 shadow-lg z-20">
            <TabChip
              label={focusedTaskRef ? taskKindLabel(focusedTaskRef.kind) : "Answer"}
              active={focusTab === "answer"}
              onClick={() => setFocusTab("answer")}
            />
            <TabChip
              label={focusedTaskRef ? "Workflow" : "Decision Map"}
              icon={<GitBranch className="w-2.5 h-2.5" />}
              active={focusTab === "map"}
              onClick={() => setFocusTab("map")}
            />
            <button
              onClick={openFullPane}
              className="ml-1 flex items-center gap-1 rounded-md px-2 py-1 text-[9px] font-mono uppercase tracking-wider text-slate-400 hover:text-neon-cyan transition-colors"
              title="Expand to full pane (or double-click the card)"
            >
              <Maximize2 className="w-2.5 h-2.5" />
              Expand
            </button>
          </div>
          {/* `right-32`, NOT `right-3`. The shell draws its own full-screen toggle at
              `top-2 right-2` on this same canvas (Layout.tsx) and at the same z-20, so two
              buttons occupied one corner and overlapped — both readable, neither reachable.
              The shell's is permanent chrome, so the contextual control moves aside. */}
          <button
            onClick={clearFocus}
            className="absolute top-3 right-32 z-20 flex items-center gap-1.5 rounded-lg border border-slate-700/60 bg-slate-950/85 backdrop-blur-sm px-2.5 py-1.5 text-[9px] font-mono uppercase tracking-wider text-slate-400 hover:text-neon-cyan hover:border-neon-cyan/40 transition-colors shadow-lg"
            title="Back to the full canvas (Esc)"
          >
            <LayoutGrid className="w-2.5 h-2.5" />
            Overview · Esc
          </button>
        </>
      )}

      {/* Group-focus overview button (no card focused). THIRD OCCUPANT OF THE SAME CORNER,
          and the reason the fix is stated as a rule rather than applied to the one that was
          reported: the shell owns top-right, so every contextual exit clears it. */}
      {isGlobal && groupKey && !focusId && !fullPane && (
        <button
          data-overlay
          onClick={clearGroup}
          className="absolute top-3 right-32 z-20 flex items-center gap-1.5 rounded-lg border border-slate-700/60 bg-slate-950/85 backdrop-blur-sm px-2.5 py-1.5 text-[9px] font-mono uppercase tracking-wider text-slate-400 hover:text-neon-cyan hover:border-neon-cyan/40 transition-colors shadow-lg"
          title="Back to the full canvas (Esc)"
        >
          <LayoutGrid className="w-2.5 h-2.5" />
          Overview · Esc
        </button>
      )}

      {/* portfolio_planning use: the session strip. Chrome mounts on the SURFACE around the
          canvas — never as a canvas item, which must be an SPO-tagged answer (ADR-0028 §2).
          Same type-dispatch shape as the relationship control below. */}
      {!isGlobal && activeCanvas?.use === "portfolio_planning" && !focusId && !fullPane && (
        <PlanningChrome />
      )}

      {/* relationship-layout use: arrange the custom canvas by how items relate. */}
      {!isGlobal && activeCanvas?.use === "relationship" && !focusId && !fullPane && (
        <button
          data-overlay
          onClick={arrangeByRelationship}
          className="absolute top-3 left-3 z-20 flex items-center gap-1.5 rounded-lg border border-neon-purple/40 bg-slate-950/85 backdrop-blur-sm px-2.5 py-1.5 text-[9px] font-mono uppercase tracking-wider text-neon-purple hover:bg-neon-purple/15 transition-colors shadow-lg"
          title="Arrange these answers by how they relate (same-subject)"
        >
          <Share2 className="w-2.5 h-2.5" />
          Arrange by relationship
        </button>
      )}

      {/* Full-pane: the focused card fills the center (the pre-canvas view). */}
      {fullPane && (
        <div className="absolute inset-0 z-30 bg-surface-dark animate-in fade-in duration-200">
          <CanvasPane />
          {/* TWO EXITS, BECAUSE THERE ARE TWO PLACES TO GO. There was one, and it went all the
              way out: expanding a card was reversible only by leaving the canvas entirely and
              hunting for the card again. `closeFullPane` existed in the store and nothing had
              ever called it — the rung was built and never hung. */}
          <div className="absolute top-3 right-3 z-40 flex items-center gap-1.5">
            <button
              onClick={closeFullPane}
              className="flex items-center gap-1.5 rounded-lg border border-neon-cyan/40 bg-slate-950/85 backdrop-blur-sm px-2.5 py-1.5 text-[9px] font-mono uppercase tracking-wider text-neon-cyan hover:bg-neon-cyan/10 transition-colors shadow-lg"
              title="Back to this card on the canvas (Esc)"
            >
              <Minimize2 className="w-2.5 h-2.5" />
              Back to card · Esc
            </button>
            <button
              onClick={clearFocus}
              className="flex items-center gap-1.5 rounded-lg border border-slate-700/60 bg-slate-950/85 backdrop-blur-sm px-2.5 py-1.5 text-[9px] font-mono uppercase tracking-wider text-slate-400 hover:text-neon-cyan hover:border-neon-cyan/40 transition-colors shadow-lg"
              title="All the way out to the full canvas"
            >
              <LayoutGrid className="w-2.5 h-2.5" />
              Overview
            </button>
          </div>
        </div>
      )}

      {/* The dock — GLOBAL + custom canvases + NEW. */}
      {!fullPane && <DockBar />}
    </div>
  );
}

function TabChip({
  label,
  icon,
  active,
  onClick,
}: {
  label: string;
  icon?: React.ReactNode;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-1 rounded-md px-2.5 py-1 text-[9px] font-mono uppercase tracking-wider transition-colors ${
        active
          ? "bg-neon-cyan/15 text-neon-cyan border border-neon-cyan/40"
          : "text-slate-400 hover:text-slate-200 border border-transparent"
      }`}
    >
      {icon}
      {label}
    </button>
  );
}
