import { motion } from "framer-motion";
import { X, GitBranch } from "lucide-react";
import type { Artifact } from "@/api/types";
import { useCanvasStore } from "@/store/useCanvasStore";
import {
  useAnswerPanelStore,
  type AnswerPin,
} from "@/store/useAnswerPanelStore";
import {
  answerSummary,
  hasCapturedSummary,
  answerSPO,
  isUnresolved,
} from "@/lib/answerDisplay";

/**
 * PinnedAnswerCard — one answer pinned to the personal canvas.
 *
 * This is the ADR-0028 v1 load-bearing object: the card is NOT a
 * thumbnail — it is an **SPO-tagged answer object**. It carries the
 * subject, subject-type (URI), verb, and a TRACE affordance, so v2
 * (aggregation) and v3 (workflow-seeding) can compute eligibility over
 * the pinned set WITHOUT re-deriving anything. v1 renders it and does
 * NOT compute over the SPO — but it carries it forward.
 *
 * The summary is read VERBATIM from the artifact (the captured S·P
 * headline), never re-composed here.
 *
 * Draggable within the canvas (framer-motion drag); drag brings it to
 * front and persists the new position (localStorage via the store).
 * TRACE foregrounds the answer so the Decision Map lens shows its path.
 */
export function PinnedAnswerCard({
  pin,
  artifact,
  bounds,
  onTrace,
}: {
  pin: AnswerPin;
  artifact: Artifact;
  bounds: React.RefObject<HTMLElement | null>;
  onTrace: () => void;
}) {
  const movePin = useAnswerPanelStore((s) => s.movePin);
  const unpinAnswer = useAnswerPanelStore((s) => s.unpinAnswer);
  const bringPinToFront = useAnswerPanelStore((s) => s.bringPinToFront);
  const setCurrentArtifact = useCanvasStore((s) => s.setCurrentArtifact);

  const summary = answerSummary(artifact);
  const captured = hasCapturedSummary(artifact);
  const spo = answerSPO(artifact);
  const fallback = isUnresolved(artifact);

  return (
    <motion.div
      drag
      dragConstraints={bounds}
      dragMomentum={false}
      onDragStart={() => bringPinToFront(pin.answerId)}
      onDragEnd={(_e, info) => {
        // Persist the new position (offset from where it was).
        movePin(pin.answerId, pin.x + info.offset.x, pin.y + info.offset.y);
      }}
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.9 }}
      style={{ left: pin.x, top: pin.y, zIndex: pin.z }}
      className={`absolute w-60 cursor-grab active:cursor-grabbing rounded-xl border bg-slate-900/95 backdrop-blur-sm shadow-xl ${
        fallback
          ? "border-amber-700/40"
          : "border-neon-cyan/30"
      }`}
    >
      {/* Header: SPO subject + remove */}
      <div className="flex items-center gap-2 px-3 pt-2.5 pb-1.5">
        <span
          className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${
            fallback ? "bg-amber-500/70" : "bg-neon-cyan"
          }`}
        />
        <span className="text-[9px] font-mono uppercase tracking-widest text-slate-500 truncate">
          {spo.subjectLabel || (fallback ? "unresolved" : "answer")}
        </span>
        <button
          onClick={() => unpinAnswer(pin.answerId)}
          className="ml-auto text-slate-600 hover:text-rose-400 transition-colors"
          title="Remove from canvas"
        >
          <X className="w-3 h-3" />
        </button>
      </div>

      {/* Summary (verbatim) */}
      <div className="px-3 pb-2">
        <p
          className={`text-[12px] font-mono leading-snug ${
            captured ? "text-slate-100" : "text-slate-400 italic"
          }`}
        >
          {summary}
        </p>
        {captured && artifact.question_text && (
          <p className="text-[10px] font-mono text-slate-500 leading-snug mt-1 line-clamp-1">
            <span className="text-slate-600">Q · </span>
            {artifact.question_text}
          </p>
        )}
      </div>

      {/* Footer: SPO verb chip + TRACE. The verb is the P of the carried
          SPO — shown so the card visibly IS an SPO object, not a blob. */}
      <div className="flex items-center gap-2 px-3 py-1.5 border-t border-slate-800/60">
        {spo.verbLabel && (
          <span
            className="text-[9px] font-mono text-neon-purple/70 truncate"
            title={spo.verbIri || undefined}
          >
            {spo.verbLabel}
          </span>
        )}
        <button
          onClick={() => {
            setCurrentArtifact(pin.answerId);
            onTrace();
          }}
          className="ml-auto flex items-center gap-1 text-[9px] font-mono uppercase tracking-wider text-slate-500 hover:text-neon-cyan transition-colors"
          title="Show this answer's decision map"
        >
          <GitBranch className="w-2.5 h-2.5" />
          Trace
        </button>
      </div>
    </motion.div>
  );
}
