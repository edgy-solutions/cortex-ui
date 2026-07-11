import { GitBranch } from "lucide-react";
import type { Artifact } from "@/api/types";
import { SemanticInterpreter } from "@/components/registry/SemanticInterpreter";
import { DecisionMap } from "./DecisionMap";
import { useStageStore } from "@/store/useStageStore";
import { answerSPO, answerSummary, isUnresolved } from "@/lib/answerDisplay";

/** World-space card geometry — one card in the camera stage. Big enough to
 *  hold the REAL rendered answer (the chosen "real content everywhere"); read
 *  zoomed-in, previewed zoomed-out. */
export const STAGE_CARD = { w: 360, h: 280 };

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
}: {
  artifact: Artifact;
  focused: boolean;
  onClick: () => void;
  onDoubleClick: () => void;
  style: React.CSSProperties;
}) {
  const focusTab = useStageStore((s) => s.focusTab);
  const spo = answerSPO(artifact);
  const fallback = isUnresolved(artifact);
  const components =
    (artifact.rendered_output?.components as unknown[] | undefined) ?? [];
  const hasRendered = components.length > 0;

  const showMap = focused && focusTab === "map";

  return (
    <div
      onClick={onClick}
      onDoubleClick={onDoubleClick}
      style={{
        ...style,
        width: STAGE_CARD.w,
        height: STAGE_CARD.h,
        // Stage-2 morph rides these; opacity is the focus-dim.
        transition:
          "left 650ms cubic-bezier(.3,.75,.25,1), top 650ms cubic-bezier(.3,.75,.25,1), opacity 400ms ease, border-color 200ms ease",
      }}
      className={`absolute flex flex-col overflow-hidden rounded-xl border bg-slate-900/95 shadow-xl cursor-pointer ${
        focused
          ? "border-neon-cyan/70 shadow-neon-cyan/10"
          : fallback
          ? "border-amber-700/40"
          : "border-neon-cyan/25 hover:border-neon-cyan/50"
      }`}
    >
      {/* Header: subject identifier + TRACE hint */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-slate-800/60 flex-shrink-0">
        <span
          className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${
            fallback ? "bg-amber-500/70" : "bg-neon-cyan"
          }`}
        />
        <span className="text-[11px] font-mono uppercase tracking-widest text-slate-400 truncate">
          {spo.subjectLabel || (fallback ? "unresolved" : "answer")}
        </span>
        {spo.verbLabel && (
          <span className="ml-auto text-[10px] font-mono text-neon-purple/70 truncate max-w-[45%]">
            {spo.verbLabel}
          </span>
        )}
      </div>

      {/* Body: the real answer, or the decision map when toggled at focus. */}
      <div className="flex-1 min-h-0 overflow-hidden relative">
        {showMap ? (
          <div className="absolute inset-0 overflow-hidden">
            <DecisionMap />
          </div>
        ) : hasRendered ? (
          <div className="absolute inset-0 overflow-hidden px-2 py-1.5 [&_.glass-panel]:!my-1 [&_.glass-panel]:!p-3 [&_.grid]:!gap-2">
            <SemanticInterpreter payload={{ components }} />
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
