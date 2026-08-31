import { useEffect, useMemo, useRef, useState } from "react";
import { Maximize2, LayoutGrid, GitBranch, X, Plus, Share2 } from "lucide-react";
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
  const edges = useMemo(
    () => [...computeStageEdges(artifacts), ...lineageEdges],
    [artifacts, lineageEdges],
  );
  const globalLayout = useMemo(
    () => computeStageLayout(artifacts, sortMode, edges),
    [artifacts, sortMode, edges],
  );

  // The cards to render + their positions, sourced by view.
  const entries = useMemo(() => {
    if (isGlobal) {
      return artifacts
        // GLOBAL is a computed view with no per-item arrangement, so every card is uniform.
        .map((a) => ({ a, pos: globalLayout.positions[a.id], itemId: null as string | null, size: cardSize() }))
        .filter((e) => e.pos);
    }
    return activeCanvas!.items
      .map((it) => ({ a: artifactById[it.id], pos: { x: it.x, y: it.y }, itemId: it.id, size: cardSize(it) }))
      .filter((e) => e.a);
  }, [isGlobal, artifacts, globalLayout, activeCanvas, artifactById]);

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
  const cam = useMemo(() => {
    const { w: vw, h: vh } = vp;
    const fp = focusId ? posOf(focusId) : null;
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
    const fill = isGlobal ? 0.9 : 0.97;
    const s = Math.min(vw / world.w, vh / world.h) * fill;
    return { tx: (vw - world.w * s) / 2, ty: (vh - world.h * s) / 2 - (isGlobal ? 20 : 6), s };
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
  const camRef = useRef(cam);
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
        e.stopPropagation();
        clearFocus();
        clearGroup();
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
  }, [focusId, fullPane, groupKey, clearFocus, clearGroup]);

  // Switching the list mode re-lays-out the global map — zoom out first.
  const prevMode = useRef(sortMode);
  useEffect(() => {
    if (prevMode.current !== sortMode) {
      prevMode.current = sortMode;
      clearFocus();
      clearGroup();
    }
  }, [sortMode, clearFocus, clearGroup]);

  const onCardClick = (id: string) => {
    setSel([]); // clicking a card clears the lasso selection and focuses it
    internalSelect.current = true; // zoom in place; don't jump to global
    setCurrentArtifact(id);
    focus(id);
  };
  const onCardDouble = (id: string) => {
    internalSelect.current = true;
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
          <button
            onClick={clearFocus}
            className="absolute top-3 right-3 z-20 flex items-center gap-1.5 rounded-lg border border-slate-700/60 bg-slate-950/85 backdrop-blur-sm px-2.5 py-1.5 text-[9px] font-mono uppercase tracking-wider text-slate-400 hover:text-neon-cyan hover:border-neon-cyan/40 transition-colors shadow-lg"
            title="Back to the full canvas (Esc)"
          >
            <LayoutGrid className="w-2.5 h-2.5" />
            Overview · Esc
          </button>
        </>
      )}

      {/* Group-focus overview button (no card focused). */}
      {isGlobal && groupKey && !focusId && !fullPane && (
        <button
          data-overlay
          onClick={clearGroup}
          className="absolute top-3 right-3 z-20 flex items-center gap-1.5 rounded-lg border border-slate-700/60 bg-slate-950/85 backdrop-blur-sm px-2.5 py-1.5 text-[9px] font-mono uppercase tracking-wider text-slate-400 hover:text-neon-cyan hover:border-neon-cyan/40 transition-colors shadow-lg"
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
          <button
            onClick={clearFocus}
            className="absolute top-3 right-3 z-40 flex items-center gap-1.5 rounded-lg border border-slate-700/60 bg-slate-950/85 backdrop-blur-sm px-2.5 py-1.5 text-[9px] font-mono uppercase tracking-wider text-slate-400 hover:text-neon-cyan hover:border-neon-cyan/40 transition-colors shadow-lg"
            title="Back to the full canvas (Esc)"
          >
            <LayoutGrid className="w-2.5 h-2.5" />
            Overview · Esc
          </button>
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
