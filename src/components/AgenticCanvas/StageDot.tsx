import type { Artifact } from "@/api/types";
import { answerSummary, isUnresolved } from "@/lib/answerDisplay";
import { STAGE_CARD } from "@/lib/stageConstants";

/**
 * StageDot - one answer at overview zoom, when the card would be a few pixels wide.
 *
 * At the fit-everything camera a thousand-card board draws each card at roughly 30 px. A real
 * card there is 25-odd elements and a handful of hooks for something the reader cannot read, so
 * below a size threshold (see DOT_PX in GlobalCanvasStage) the stage draws THIS instead: one
 * element, the card's footprint, carrying the summary as a tooltip. Click and double-click do
 * what a card's do. Zooming in turns dots back into tiles.
 */
export function StageDot({
  artifact,
  style,
  size,
  focused,
  selected,
  onClick,
  onDoubleClick,
}: {
  artifact: Artifact;
  style: React.CSSProperties;
  size?: { w: number; h: number };
  focused: boolean;
  selected?: boolean;
  onClick: () => void;
  onDoubleClick: () => void;
}) {
  const tone = selected
    ? "border-neon-cyan bg-neon-cyan/25"
    : focused
    ? "border-neon-cyan/70 bg-neon-cyan/20"
    : isUnresolved(artifact)
    ? "border-amber-700/40 bg-amber-900/20"
    : "border-neon-cyan/25 bg-slate-900/90";
  return (
    <div
      data-stage-dot
      data-stage-card
      data-answer-id={artifact.id}
      title={answerSummary(artifact)}
      onClick={onClick}
      onDoubleClick={onDoubleClick}
      style={{ ...style, width: size?.w ?? STAGE_CARD.w, height: size?.h ?? STAGE_CARD.h }}
      className={`absolute cursor-pointer rounded-xl border-4 ${tone}`}
    />
  );
}
