import { GitBranch, GripVertical, X } from "lucide-react";
import type { Artifact } from "@/api/types";
import { SemanticInterpreter } from "@/components/registry/SemanticInterpreter";
import { FitBox } from "./FitBox";
import { DecisionMap } from "./DecisionMap";
import { useStageStore } from "@/store/useStageStore";
import { answerSPO, answerSummary, isUnresolved } from "@/lib/answerDisplay";
import { taskKindLabel } from "@/lib/taskArtifact";
import { WorkflowLens } from "./WorkflowLens";
import { STAGE_CARD } from "@/lib/stageConstants";
import { overviewTier, DENSE_PREVIEW_ROWS } from "@/lib/overviewTier";

export { STAGE_CARD };

/**
 * StageCard — one answer on the camera stage. Renders the ACTUAL answer (reuses
 * SemanticInterpreter over rendered_output.components) at world scale, so the
 * overview shows real content shrunk and focus zooms it to legibility. When
 * this card is the focused one AND the peer-view toggle is on Decision Map, its
 * body swaps to <DecisionMap/> (which reads the current artifact) — that's the
 * "Answer / Decision Map tabs over the zoomed card" requirement.
 *
 * Positioning + camera live in GlobalCanvasStage; this component is presentation
 * only. Single click focuses (handled by parent), double-click → full-pane.
 */
export function StageCard({
  artifact,
  focused,
  onClick,
  onDoubleClick,
  style,
  onGripDown,
  onRemove,
  selected,
  dragIds,
  onDragComplete,
  size,
}: {
  artifact: Artifact;
  focused: boolean;
  onClick: () => void;
  onDoubleClick: () => void;
  style: React.CSSProperties;
  /** Custom-canvas mode: a grip to pointer-drag the item within the canvas. */
  onGripDown?: (e: React.PointerEvent) => void;
  /** Custom-canvas mode: remove the item from the canvas. */
  onRemove?: () => void;
  /** Lasso multi-select highlight (global overview). */
  selected?: boolean;
  /** The ids to carry when this card is dragged — the whole selection if this
   *  card is part of it, else just this card. Enables multi-card drag-to-chip. */
  dragIds?: string[];
  /** Called after a successful MULTI drag-drop, so the caller can clear the
   *  lasso selection. */
  /** Called after a successful MULTI drag-drop, so the caller can clear the
   *  lasso selection. */
  onDragComplete?: () => void;
  /** World-space footprint. ADR-0042 §4: size is ARRANGEMENT, owned by the UI and
   *  persisted with the canvas. Absent → the default card size, which is what every
   *  canvas authored before per-item dimensions existed carries. */
  size?: { w: number; h: number };
}) {
  const custom = Boolean(onGripDown || onRemove);
  const focusTab = useStageStore((s) => s.focusTab);
  const spo = answerSPO(artifact);
  const fallback = isUnresolved(artifact);
  // A task wears its own costume, not the answer's: header names the task + its
  // state, not "answer". Its archetype card (GROUPED_REVIEW / APPROVAL_TASK)
  // supplies the body — same citizenship, different costume.
  const task = artifact.task_ref;
  const taskPending = task?.task_state === "pending";
  const components =
    (artifact.rendered_output?.components as unknown[] | undefined) ?? [];
  const hasRendered = components.length > 0;

  const showMap = focused && focusTab === "map";

  return (
    <div
      data-stage-card
      onClick={onClick}
      onDoubleClick={onDoubleClick}
      draggable
      onDragStart={(e) => {
        // Drag a card onto a dock chip to add it. If this card is part of a
        // lasso selection, drag the WHOLE selection (comma-joined ids);
        // otherwise just this card. dataTransfer is the source of truth.
        const ids = dragIds && dragIds.length ? dragIds : [artifact.id];
        e.dataTransfer.setData("text/plain", ids.join(","));
        e.dataTransfer.effectAllowed = "copyMove";
        // The card lives inside the camera's CSS transform (translate+scale),
        // which breaks the browser's DEFAULT drag ghost — it renders far off to
        // the side / off-screen. Supply a small custom drag image pinned under
        // the cursor so the drag is legible and tracks the hand.
        const ghost = document.createElement("div");
        ghost.textContent =
          ids.length > 1 ? `${ids.length} answers` : spo.subjectLabel || "answer";
        ghost.style.cssText =
          "position:fixed;top:-1000px;left:-1000px;padding:6px 10px;border-radius:8px;" +
          "background:#0C1D24;border:1px solid rgba(44,217,238,.55);color:#EAF7F9;" +
          "font:600 11px 'JetBrains Mono',ui-monospace,monospace;white-space:nowrap;" +
          "pointer-events:none;z-index:9999;box-shadow:0 8px 20px rgba(0,0,0,.5)";
        document.body.appendChild(ghost);
        e.dataTransfer.setDragImage(ghost, 14, 14);
        // Remove after the browser has snapshotted it for the drag image.
        setTimeout(() => ghost.remove(), 0);
      }}
      onDragEnd={(e) => {
        // After a successful MULTI drop, clear the lasso selection.
        if (dragIds && dragIds.length > 1 && e.dataTransfer.dropEffect !== "none") {
          onDragComplete?.();
        }
      }}
      style={{
        ...style,
        width: size?.w ?? STAGE_CARD.w,
        height: size?.h ?? STAGE_CARD.h,
        // Stage-2 morph rides these; opacity is the focus-dim.
        transition:
          "left 650ms cubic-bezier(.3,.75,.25,1), top 650ms cubic-bezier(.3,.75,.25,1), opacity 400ms ease, border-color 200ms ease",
      }}
      className={`absolute flex flex-col overflow-hidden rounded-xl border bg-slate-900/95 shadow-xl cursor-pointer ${
        selected
          ? "border-neon-cyan ring-4 ring-neon-cyan/20"
          : focused
          ? "border-neon-cyan/70"
          : fallback
          ? "border-amber-700/40"
          : "border-neon-cyan/25 hover:border-neon-cyan/50"
      }`}
    >
      {/* Header: subject identifier + TRACE hint (answer) — or task kind + state. */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-slate-800/60 flex-shrink-0">
        <span
          className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${
            task
              ? taskPending
                ? "bg-neon-pink animate-pulse"
                : "bg-slate-500"
              : fallback
              ? "bg-amber-500/70"
              : "bg-neon-cyan"
          }`}
        />
        <span
          className={`text-[11px] font-mono uppercase tracking-widest truncate ${
            task && taskPending ? "text-neon-pink/90" : "text-slate-400"
          }`}
        >
          {task ? taskKindLabel(task.kind) : spo.subjectLabel || (fallback ? "unresolved" : "answer")}
        </span>
        {task ? (
          <span className="ml-auto text-[9px] font-mono uppercase tracking-wider text-slate-500">
            {taskPending ? "pending" : task.task_state}
          </span>
        ) : (
          !custom && spo.verbLabel && (
            <span className="ml-auto text-[10px] font-mono text-neon-purple/70 truncate max-w-[45%]">
              {spo.verbLabel}
            </span>
          )
        )}
        {onGripDown && (
          <button
            onPointerDown={(e) => {
              e.stopPropagation();
              onGripDown(e);
            }}
            onDragStart={(e) => e.preventDefault()}
            draggable={false}
            className="ml-auto text-slate-600 hover:text-neon-cyan cursor-grab active:cursor-grabbing flex-shrink-0"
            title="Drag to move"
          >
            <GripVertical className="w-3.5 h-3.5" />
          </button>
        )}
        {onRemove && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onRemove();
            }}
            className={`text-slate-600 hover:text-rose-400 flex-shrink-0 ${onGripDown ? "" : "ml-auto"}`}
            title="Remove from canvas"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {/* Body: the content lens (answer / task card), or the provenance lens when
          toggled at focus — Decision Map for an answer, Workflow for a task. */}
      <div className="flex-1 min-h-0 overflow-hidden relative">
        {showMap ? (
          <div className="absolute inset-0 p-2">
            <FitBox naturalWidth={640}>
              <div style={{ width: 640, height: task ? undefined : 380 }}>
                {task ? <WorkflowLens taskRef={task} /> : <DecisionMap />}
              </div>
            </FitBox>
          </div>
        ) : hasRendered ? (
          // Shrink the WHOLE answer to fit the card — nothing clipped, so the
          // chart / table / document is fully legible at card scale (the point
          // of the canvas). Rendered at a natural width, then scaled down.
          <div className="absolute inset-0 p-2">
            <FitBox naturalWidth={640}>
              <div className="[&_.glass-panel]:!my-0 [&_.grid]:!gap-3">
                {/* At overview zoom the shell caps a "dense" citizen to a preview
                    so FitBox scales it by WIDTH (readable) instead of by HEIGHT
                    (the long-list shrink). compact/visual render whole — FitBox
                    centers the compact card and scales the visual one. */}
                <SemanticInterpreter
                  payload={{ components }}
                  previewRows={
                    overviewTier((components?.[0] as { archetype?: string } | undefined)?.archetype) === "dense"
                      ? DENSE_PREVIEW_ROWS
                      : undefined
                  }
                />
              </div>
            </FitBox>
          </div>
        ) : (
          <div className="absolute inset-0 flex items-center justify-center px-4">
            <p
              className={`text-[13px] font-mono leading-snug text-center ${
                isUnresolved(artifact) ? "text-amber-400/80 italic" : "text-slate-300"
              }`}
            >
              {answerSummary(artifact)}
            </p>
          </div>
        )}
      </div>

      {/* Footer: question + trace glyph (identification, not the body). */}
      <div className="flex items-center gap-1.5 px-3 py-1.5 border-t border-slate-800/60 flex-shrink-0">
        <GitBranch className="w-2.5 h-2.5 text-slate-600 flex-shrink-0" />
        <span className="text-[10px] font-mono text-slate-500 truncate">
          {artifact.question_text || "—"}
        </span>
      </div>
    </div>
  );
}
