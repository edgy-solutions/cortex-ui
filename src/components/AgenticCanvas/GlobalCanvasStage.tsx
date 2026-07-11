import { useEffect, useMemo, useRef, useState } from "react";
import { Maximize2, LayoutGrid, GitBranch } from "lucide-react";
import { useCanvasStore } from "@/store/useCanvasStore";
import { useStageStore } from "@/store/useStageStore";
import { useAnswerPanelStore } from "@/store/useAnswerPanelStore";
import { computeStageLayout, type StageMode } from "@/lib/stageLayout";
import { STAGE_CARD } from "@/lib/stageConstants";
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

function customWorld(items: { x: number; y: number }[]) {
  if (!items.length) return { w: 1500, h: 950 };
  let mx = 0;
  let my = 0;
  for (const it of items) {
    mx = Math.max(mx, it.x + STAGE_CARD.w);
    my = Math.max(my, it.y + STAGE_CARD.h);
  }
  return { w: Math.max(1500, mx + 140), h: Math.max(950, my + 140) };
}

export function GlobalCanvasStage() {
  const artifacts = useCanvasStore((s) => s.artifacts);
  const currentArtifactId = useCanvasStore((s) => s.currentArtifactId);
  const setCurrentArtifact = useCanvasStore((s) => s.setCurrentArtifact);

  const focusId = useStageStore((s) => s.focusId);
  const fullPane = useStageStore((s) => s.fullPane);
  const focusTab = useStageStore((s) => s.focusTab);
  const focus = useStageStore((s) => s.focus);
  const clearFocus = useStageStore((s) => s.clearFocus);
  const openFullPane = useStageStore((s) => s.openFullPane);
  const setFocusTab = useStageStore((s) => s.setFocusTab);
  const view = useStageStore((s) => s.view);
  const canvases = useStageStore((s) => s.canvases);
  const setView = useStageStore((s) => s.setView);
  const addItemAt = useStageStore((s) => s.addItemAt);
  const moveItem = useStageStore((s) => s.moveItem);
  const removeItem = useStageStore((s) => s.removeItem);

  const sortMode = useAnswerPanelStore((s) => s.sortMode) as StageMode;

  const stageRef = useRef<HTMLDivElement>(null);
  const [vp, setVp] = useState({ w: 1200, h: 700 });

  const activeCanvas = view === "global" ? null : canvases.find((c) => c.id === view);
  const isGlobal = !activeCanvas;

  const artifactById = useMemo(() => {
    const m: Record<string, (typeof artifacts)[number]> = {};
    for (const a of artifacts) m[a.id] = a;
    return m;
  }, [artifacts]);

  const globalLayout = useMemo(
    () => computeStageLayout(artifacts, sortMode),
    [artifacts, sortMode],
  );

  // The cards to render + their positions, sourced by view.
  const entries = useMemo(() => {
    if (isGlobal) {
      return artifacts
        .map((a) => ({ a, pos: globalLayout.positions[a.id], itemId: null as string | null }))
        .filter((e) => e.pos);
    }
    return activeCanvas!.items
      .map((it) => ({ a: artifactById[it.id], pos: { x: it.x, y: it.y }, itemId: it.id }))
      .filter((e) => e.a);
  }, [isGlobal, artifacts, globalLayout, activeCanvas, artifactById]);

  const world = useMemo(() => {
    if (isGlobal) return globalLayout.world;
    return customWorld(activeCanvas!.items);
  }, [isGlobal, globalLayout, activeCanvas]);

  const posOf = (id: string) => entries.find((e) => e.a.id === id)?.pos ?? null;

  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setVp({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    setVp({ w: el.clientWidth, h: el.clientHeight });
    return () => ro.disconnect();
  }, []);

  // Camera: overview fits the world; focus zooms the focused card to center.
  const cam = useMemo(() => {
    const { w: vw, h: vh } = vp;
    const fp = focusId ? posOf(focusId) : null;
    if (fp) {
      const s = clamp(
        Math.min((vw * 0.6) / STAGE_CARD.w, (vh * 0.82) / STAGE_CARD.h),
        1.1,
        2.6,
      );
      const cx = fp.x + STAGE_CARD.w / 2;
      const cy = fp.y + STAGE_CARD.h / 2;
      return { tx: vw / 2 - cx * s, ty: vh / 2 - cy * s, s };
    }
    const s = Math.min(vw / world.w, vh / world.h) * 0.9; // margin for the dock
    return { tx: (vw - world.w * s) / 2, ty: (vh - world.h * s) / 2 - 20, s };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusId, entries, vp, world.w, world.h]);
  const camRef = useRef(cam);
  camRef.current = cam;

  // Selecting an answer in the LIST jumps to GLOBAL and zooms to it.
  const prevCurrent = useRef<string | null>(null);
  useEffect(() => {
    if (currentArtifactId && currentArtifactId !== prevCurrent.current) {
      prevCurrent.current = currentArtifactId;
      setView("global");
      focus(currentArtifactId);
    }
  }, [currentArtifactId, setView, focus]);

  // ESC → overview.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && (focusId || fullPane)) {
        e.stopPropagation();
        clearFocus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [focusId, fullPane, clearFocus]);

  // Switching the list mode re-lays-out the global map — zoom out first.
  const prevMode = useRef(sortMode);
  useEffect(() => {
    if (prevMode.current !== sortMode) {
      prevMode.current = sortMode;
      clearFocus();
    }
  }, [sortMode, clearFocus]);

  const onCardClick = (id: string) => {
    setCurrentArtifact(id);
    focus(id);
  };
  const onCardDouble = (id: string) => {
    setCurrentArtifact(id);
    focus(id);
    openFullPane();
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
      };
      document.addEventListener("pointermove", onMove);
      document.addEventListener("pointerup", onUp);
    };

  // Custom-canvas: drop a dragged card at the pointer (screen → world).
  const onStageDrop = (e: React.DragEvent) => {
    if (isGlobal || !activeCanvas) return;
    e.preventDefault();
    const aid = e.dataTransfer.getData("text/plain");
    if (!aid) return;
    const rect = stageRef.current?.getBoundingClientRect();
    if (!rect) return;
    const wx = (e.clientX - rect.left - cam.tx) / cam.s - STAGE_CARD.w / 2;
    const wy = (e.clientY - rect.top - cam.ty) / cam.s - STAGE_CARD.h / 2;
    addItemAt(activeCanvas.id, aid, wx, wy);
  };

  return (
    <div
      ref={stageRef}
      className="h-full w-full relative overflow-hidden select-none"
      style={{
        background:
          "radial-gradient(rgba(80,200,220,.10) 1px, transparent 1.5px) 0 0 / 44px 44px, #070F13",
      }}
      onDragOver={(e) => {
        if (!isGlobal) e.preventDefault();
      }}
      onDrop={onStageDrop}
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
        {/* Custom-canvas dressing */}
        {!isGlobal && (
          <>
            <div
              className="absolute rounded-xl border-2 border-dashed border-neon-cyan/20 pointer-events-none"
              style={{ left: 24, top: 24, width: world.w - 48, height: world.h - 48 }}
            />
            <div
              className="absolute font-mono uppercase tracking-[.18em] text-neon-cyan/30 pointer-events-none"
              style={{ right: 44, bottom: 44, fontSize: 22 }}
            >
              Freeform — yours to arrange
            </div>
          </>
        )}

        {/* Global arrangement labels (world space), cross-fade on mode change. */}
        {isGlobal && (
          <div key={sortMode} className="animate-in fade-in duration-500">
            {globalLayout.labels.map((l) => (
              <div
                key={l.id}
                className="absolute pointer-events-none font-mono font-semibold uppercase tracking-[.18em] text-neon-cyan/45 whitespace-nowrap"
                style={{ left: l.x, top: l.y, fontSize: 26 }}
              >
                {l.text}
              </div>
            ))}
          </div>
        )}

        {entries.map(({ a, pos, itemId }) => {
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

      {/* Focus overlay: peer-view tabs + expand + overview (both views). */}
      {focusId && !fullPane && (
        <>
          <div className="absolute top-3 left-1/2 -translate-x-1/2 flex items-center gap-1 rounded-lg border border-neon-cyan/25 bg-slate-950/85 backdrop-blur-sm px-1 py-1 shadow-lg z-20">
            <TabChip label="Answer" active={focusTab === "answer"} onClick={() => setFocusTab("answer")} />
            <TabChip
              label="Decision Map"
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
