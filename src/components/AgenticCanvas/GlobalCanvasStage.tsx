import { useEffect, useMemo, useRef, useState } from "react";
import { Maximize2, LayoutGrid, GitBranch } from "lucide-react";
import { useCanvasStore } from "@/store/useCanvasStore";
import { useStageStore } from "@/store/useStageStore";
import { StageCard, STAGE_CARD } from "./StageCard";
import { CanvasPane } from "./CanvasPane";

/**
 * GlobalCanvasStage — the center canvas as ONE camera-driven world (ADR-0028
 * canvas-dock model, Stage 1). "One space, one camera": the global canvas is a
 * fixed virtual world of answer cards; navigation is camera movement, never a
 * view swap.
 *
 *   overview  — the whole world fit to the viewport (all answers visible).
 *   focus     — single click a card (or select a list row) → the camera zooms
 *               to that card; the Answer / Decision-Map tabs float over it.
 *   full-pane — double-click the focused card → it fills the entire center pane
 *               (the pre-canvas single-answer view, i.e. CanvasPane).
 *   ESC       — returns to the overview from anywhere.
 *
 * Stage 1 uses a SIMPLE GRID arrangement; the list-mode layout engine
 * (timeline/type/topic) + the morph animation land in Stage 2, and the dock +
 * custom canvases in Stage 3. Cards render REAL content (SemanticInterpreter).
 */

const PAD = 90;
const GAP = 48;
const COLS = 4;
const CAM_MS = 620;
const EASE = "cubic-bezier(.3,.75,.25,1)";

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

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

  const stageRef = useRef<HTMLDivElement>(null);
  const [vp, setVp] = useState({ w: 1200, h: 700 });

  // Track the viewport (the center section) so the camera can fit / center.
  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      setVp({ w: el.clientWidth, h: el.clientHeight });
    });
    ro.observe(el);
    setVp({ w: el.clientWidth, h: el.clientHeight });
    return () => ro.disconnect();
  }, []);

  // Stage-1 arrangement: a simple row-major grid. (Stage 2 replaces this with
  // the list-mode layout engine + morph.)
  const positions = useMemo(() => {
    const m: Record<string, { x: number; y: number }> = {};
    artifacts.forEach((a, i) => {
      m[a.id] = {
        x: PAD + (i % COLS) * (STAGE_CARD.w + GAP),
        y: PAD + Math.floor(i / COLS) * (STAGE_CARD.h + GAP),
      };
    });
    return m;
  }, [artifacts]);

  const world = useMemo(() => {
    const rows = Math.max(1, Math.ceil(artifacts.length / COLS));
    return {
      w: PAD * 2 + COLS * STAGE_CARD.w + (COLS - 1) * GAP,
      h: PAD * 2 + rows * STAGE_CARD.h + (rows - 1) * GAP,
    };
  }, [artifacts.length]);

  // Camera: overview fits the world; focus zooms the focused card to viewport
  // center. transform-origin 0 0, so transform = translate(tx,ty) scale(s).
  const cam = useMemo(() => {
    const { w: vw, h: vh } = vp;
    if (focusId && positions[focusId]) {
      const p = positions[focusId];
      const s = clamp(
        Math.min((vw * 0.6) / STAGE_CARD.w, (vh * 0.82) / STAGE_CARD.h),
        1.1,
        2.6,
      );
      const cx = p.x + STAGE_CARD.w / 2;
      const cy = p.y + STAGE_CARD.h / 2;
      return { tx: vw / 2 - cx * s, ty: vh / 2 - cy * s, s };
    }
    const s = Math.min(vw / world.w, vh / world.h) * 0.94;
    return { tx: (vw - world.w * s) / 2, ty: (vh - world.h * s) / 2, s };
  }, [focusId, positions, vp, world.w, world.h]);

  // Selecting an answer in the LIST (setCurrentArtifact) zooms the stage to it.
  // Fire only on an actual change so ESC (which leaves currentArtifactId set)
  // doesn't immediately re-zoom.
  const prevCurrent = useRef<string | null>(null);
  useEffect(() => {
    if (currentArtifactId && currentArtifactId !== prevCurrent.current) {
      prevCurrent.current = currentArtifactId;
      focus(currentArtifactId);
    }
  }, [currentArtifactId, focus]);

  // ESC → overview (from focus OR full-pane, per the design).
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

  const onCardClick = (id: string) => {
    setCurrentArtifact(id); // makes it the current artifact (DecisionMap reads it)
    focus(id);
  };
  const onCardDouble = (id: string) => {
    setCurrentArtifact(id);
    focus(id);
    openFullPane();
  };

  return (
    <div
      ref={stageRef}
      className="h-full w-full relative overflow-hidden select-none"
      style={{
        background:
          "radial-gradient(rgba(80,200,220,.10) 1px, transparent 1.5px) 0 0 / 44px 44px, #070F13",
      }}
    >
      {/* Empty state */}
      {artifacts.length === 0 && (
        <div className="absolute inset-0 flex items-center justify-center">
          <p className="text-[12px] font-mono uppercase tracking-widest text-slate-600">
            No answers yet — ask a question to populate the canvas
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
        {artifacts.map((a) => {
          const p = positions[a.id];
          if (!p) return null;
          const isFocused = focusId === a.id;
          const dim = focusId && !isFocused; // focus dimming
          return (
            <StageCard
              key={a.id}
              artifact={a}
              focused={isFocused}
              onClick={() => onCardClick(a.id)}
              onDoubleClick={() => onCardDouble(a.id)}
              style={{
                left: p.x,
                top: p.y,
                opacity: dim ? 0.4 : 1,
                zIndex: isFocused ? 10 : 1,
              }}
            />
          );
        })}
      </div>

      {/* Focus overlay (viewport space): peer-view tabs + expand + overview. */}
      {focusId && !fullPane && (
        <>
          <div className="absolute top-3 left-1/2 -translate-x-1/2 flex items-center gap-1 rounded-lg border border-neon-cyan/25 bg-slate-950/85 backdrop-blur-sm px-1 py-1 shadow-lg">
            <TabChip
              label="Answer"
              active={focusTab === "answer"}
              onClick={() => setFocusTab("answer")}
            />
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
            className="absolute top-3 right-3 flex items-center gap-1.5 rounded-lg border border-slate-700/60 bg-slate-950/85 backdrop-blur-sm px-2.5 py-1.5 text-[9px] font-mono uppercase tracking-wider text-slate-400 hover:text-neon-cyan hover:border-neon-cyan/40 transition-colors shadow-lg"
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
