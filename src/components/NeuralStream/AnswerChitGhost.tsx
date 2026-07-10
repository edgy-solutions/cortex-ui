import { createPortal } from "react-dom";
import type { AnswerArchetype } from "@/lib/answerDisplay";
import { ArchetypeGlyph } from "./ArchetypeGlyph";

/**
 * AnswerChitGhost — the drag ghost that follows the cursor while dragging
 * an answer onto the canvas.
 *
 * Rendered via a PORTAL to document.body with position:fixed + a high
 * z-index, so it floats ABOVE every pane (the answer list AND the canvas).
 * This is the fix for the "dragged card goes under the canvas" bug: the
 * old framer-motion drag moved the actual row, which is clipped by the
 * left pane's `overflow-hidden` / stacking context and can't visually
 * cross into the canvas. A body-level portal has no such ancestor.
 *
 * Matches the mock's chit: compact (210px), glyph + summary + Q line,
 * teal border, slight tilt.
 */
export function AnswerChitGhost({
  x,
  y,
  summary,
  question,
  archetype,
  fallback,
}: {
  x: number;
  y: number;
  summary: string;
  question: string;
  archetype: AnswerArchetype;
  fallback: boolean;
}) {
  return createPortal(
    <div
      className="fixed z-[9999] pointer-events-none w-[210px] rounded-lg border bg-slate-900/95 backdrop-blur-sm shadow-2xl px-2.5 py-2"
      style={{
        left: x + 14,
        top: y - 10,
        transform: "rotate(-3deg)",
        borderColor: fallback
          ? "rgba(217,161,60,.5)"
          : "rgba(45,212,191,.6)",
      }}
    >
      <div className="flex items-start gap-2">
        <ArchetypeGlyph archetype={archetype} fallback={fallback} />
        <div className="min-w-0">
          <p className="text-[11px] font-mono text-slate-100 leading-snug line-clamp-1">
            {summary}
          </p>
          <p className="text-[9px] font-mono text-slate-500 leading-snug line-clamp-1 mt-0.5">
            <span className="text-slate-600">Q · </span>
            {question}
          </p>
        </div>
      </div>
    </div>,
    document.body
  );
}
