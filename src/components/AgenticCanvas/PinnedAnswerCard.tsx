import { useState } from "react";
import { motion, useMotionValue } from "framer-motion";
import { X, GitBranch, ChevronDown, ChevronUp } from "lucide-react";
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
import { SemanticInterpreter } from "@/components/registry/SemanticInterpreter";

/**
 * PinnedAnswerCard — one answer pinned to the personal canvas.
 *
 * This is the ADR-0028 v1 load-bearing object: the card is NOT a
 * thumbnail — it is an **SPO-tagged answer object**. It carries the
 * subject, subject-type (URI), verb, and a TRACE affordance, so v2
 * (aggregation) and v3 (workflow-seeding) can compute eligibility over
 * the pinned set WITHOUT re-deriving anything.
 *
 * BODY = THE RENDERED ANSWER, not the list-row summary. The canvas is
 * where the user assembles selected answers to OBSERVE THEM TOGETHER —
 * so the card must BE the answer (the chart / table / document / fact),
 * the same archetype-rendered payload the center ANSWER pane shows, not
 * a headline that merely identifies which answer it is. It reuses the
 * SemanticInterpreter (the center pane's renderer) over the artifact's
 * `rendered_output.components`, at CARD SCALE with an expand affordance
 * so a canvas of several answers stays arrangeable. The list row is the
 * identifier (scan-to-find); the canvas card is the answer
 * (observe-together) — different jobs, different content. The captured
 * S·P summary is used only as a FALLBACK when there's no rendered
 * payload yet (pending / unresolved).
 *
 * The chrome stays (subject label header, verb chip + TRACE footer, ✕)
 * for identification and provenance — you still want to know which
 * answer a card is and reach its decision map.
 *
 * Draggable within the canvas (framer-motion drag); drag brings it to
 * front and persists the new position (localStorage via the store).
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

  const [expanded, setExpanded] = useState(false);

  const summary = answerSummary(artifact);
  const captured = hasCapturedSummary(artifact);
  const spo = answerSPO(artifact);
  const fallback = isUnresolved(artifact);

  // The actual rendered answer — the same components the center ANSWER
  // pane renders (CanvasPane → SemanticInterpreter). Present once the
  // artifact has composed; absent while pending / for a bare fallback.
  const components =
    (artifact.rendered_output?.components as unknown[] | undefined) ?? [];
  const hasRendered = components.length > 0;

  // Position via framer-motion transform (x/y), NOT left/top. Mixing `drag`
  // with left/top positioning double-applies the drop: framer leaves its drag
  // `transform: translate()` in place, and writing the new left/top on top of
  // it lands the card at ~position+offset again (it flew off-screen). With
  // x/y motion values, the transform IS the position — one source of truth —
  // so persisting x.get()/y.get() on drop keeps the card exactly where it
  // landed. useMotionValue is initialized once (per mount) from the persisted
  // pin, and drag mutates it directly, so no re-render conflict.
  const x = useMotionValue(pin.x);
  const y = useMotionValue(pin.y);

  return (
    <motion.div
      drag
      dragConstraints={bounds}
      dragMomentum={false}
      onDragStart={() => bringPinToFront(pin.answerId)}
      onDragEnd={() => {
        // The x/y motion values ARE the live position after the drag — persist
        // them verbatim (no offset math, no left/top to double-count).
        movePin(pin.answerId, x.get(), y.get());
      }}
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.9 }}
      style={{ x, y, zIndex: pin.z }}
      className={`absolute top-0 left-0 w-80 cursor-grab active:cursor-grabbing rounded-xl border bg-slate-900/95 backdrop-blur-sm shadow-xl ${
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

      {/* Body: THE RENDERED ANSWER (reusing the center pane's
          SemanticInterpreter over rendered_output.components), at card
          scale with an expand affordance — this is what makes the canvas a
          place to OBSERVE the answers together rather than a second list.
          Margins/padding are trimmed for card density; collapsed the body
          is capped with a fade, expand removes the cap. Falls back to the
          captured summary only when there's no rendered payload yet. */}
      {hasRendered ? (
        <div className="px-2 pb-1.5">
          <div
            className={`relative overflow-hidden ${
              expanded ? "" : "max-h-[280px]"
            } [&_.glass-panel]:!my-1 [&_.glass-panel]:!p-3 [&_.grid]:!gap-2`}
          >
            <SemanticInterpreter payload={{ components }} />
            {!expanded && (
              <div className="pointer-events-none absolute inset-x-0 bottom-0 h-12 bg-gradient-to-t from-slate-900/95 to-transparent" />
            )}
          </div>
          <button
            onClick={() => setExpanded((v) => !v)}
            className="mt-1 flex items-center gap-1 text-[9px] font-mono uppercase tracking-wider text-slate-500 hover:text-neon-cyan transition-colors"
            title={expanded ? "Collapse card" : "Expand to full answer"}
          >
            {expanded ? (
              <ChevronUp className="w-2.5 h-2.5" />
            ) : (
              <ChevronDown className="w-2.5 h-2.5" />
            )}
            {expanded ? "Collapse" : "Expand"}
          </button>
        </div>
      ) : (
        /* Fallback: no rendered payload yet (pending / unresolved) — show
           the captured S·P summary so the pin isn't blank. */
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
      )}

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
