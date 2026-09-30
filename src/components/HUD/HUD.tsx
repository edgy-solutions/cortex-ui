import { motion, AnimatePresence } from "framer-motion";
import { Radar, UploadCloud, X } from "lucide-react";
import { useState } from "react";
import { OntologyMap } from "./OntologyMap";
import { RoutingDecision } from "./RoutingDecision";
import { SourcesTrail } from "./SourcesTrail";
import { DecisionPathDiagram } from "./DecisionPathDiagram";
import { GraphTrace } from "./GraphTrace";
import { UnreadFields } from "./UnreadFields";
import { TaskContextCard } from "./TaskContextCard";
import { ModeToggle } from "./ModeToggle";
import { useInterviewStore } from "@/store/useInterviewStore";
import { useCurrentArtifact } from "@/store/useCanvasStore";
import { CompileButton } from "@/components/Compilation/CompileButton";
import { IngestPanel } from "@/components/ingest/IngestPanel";
import { isIngestUiEnabled } from "@/lib/ingestFlag";

/**
 * HUD — the right-side grounding panel.
 *
 * Stack (top → bottom):
 *   1. Header (radar pulse + mode toggle)
 *   2. OntologyMap     — query terms (existing, kept as-is)
 *   3. RoutingDecision — what subject + verb + engine handled this turn
 *                        (replaces the stale DataBindings card)
 *   4. SourcesTrail    — citations the engines returned
 *   5. GraphTrace      — substrate walk (detailed mode only)
 *   6. CompileButton   — for interview phases (existing)
 *
 * Per architect's principle: the panel surfaces what the pipeline
 * actually did. Each section corresponds to a real pipeline emission;
 * none is synthesized. The two-mode toggle is a render-time filter
 * over the same single event stream; the modes cannot diverge.
 */
export function HUD() {
  const phase = useInterviewStore((s) => s.phase);
  const mode = useInterviewStore((s) => s.groundingDisplayMode);
  // The HUD follows the selection's KIND: a task shows task-context, an answer
  // shows the routing/sources/graph trail. One contract, no overlay war.
  const isTask = !!useCurrentArtifact()?.task_ref;
  // ADR-0041 ingest UI — flag-gated (default OFF), a right-edge slide-in on the same pattern
  // as FiguresSlideIn.tsx. The trigger itself lives here because FiguresSlideIn's own trigger
  // is a per-source button on SourcesTrail, not a HUD header control — there is no existing
  // HUD-header trigger to sit literally "next to"; this is the nearest honest equivalent: same
  // slide-in mechanics, same header row as ModeToggle.
  const [ingestOpen, setIngestOpen] = useState(false);
  const ingestUiEnabled = isIngestUiEnabled();

  return (
    <div className="flex flex-col h-full p-4 space-y-4 overflow-y-auto">
      {/* HUD Header */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.5 }}
        className="flex items-center gap-2 px-1"
      >
        <Radar className="w-4 h-4 text-neon-cyan animate-pulse-neon" />
        <span className="text-[10px] font-mono uppercase tracking-[0.2em] text-neon-cyan/70 flex-1">
          Live Context HUD
        </span>
        {ingestUiEnabled && (
          <button
            type="button"
            data-ingest-trigger
            onClick={() => setIngestOpen(true)}
            className="p-1 rounded text-neon-cyan/70 hover:text-neon-cyan hover:bg-slate-800/60"
            title="Ingest a document"
          >
            <UploadCloud className="w-3.5 h-3.5" />
          </button>
        )}
        <ModeToggle />
      </motion.div>

      {isTask ? (
        /* Selected card is a TASK — the HUD shows its context (queue, requester,
           notice, parts, state) instead of the answer routing trail. */
        <TaskContextCard />
      ) : (
        <>
          {/* Ontology Map (existing) */}
          <OntologyMap />

          {/* Routing Decision (Phase 2) */}
          <RoutingDecision />

          {/* Decision Path diagram — the DRAWN path with branches-not-taken
              (both legs). Detailed mode; the visual counterpart to the
              text-trail GraphTrace below it. */}
          {mode === "detailed" && <DecisionPathDiagram />}

          {/* Sources & Evidence (Phase 3) */}
          <SourcesTrail />

          {/* Graph Trace (Phase 4) — detailed mode only; the linear text
              audit of the taken walk (URIs), beneath the drawn diagram. */}
          {mode === "detailed" && <GraphTrace />}

          {/* Payload keys nothing read — R-075 the other way round. Detailed mode, because it
              is an instrument rather than part of the answer. See UnreadFields. */}
          {mode === "detailed" && <UnreadFields />}
        </>
      )}

      {/* Compile button (shown when interview reaches blueprint/compiling/complete phase) */}
      {(phase === "blueprint" || phase === "compiling" || phase === "complete") && (
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.5, type: "spring" }}
          className="mt-auto"
        >
          <CompileButton />
        </motion.div>
      )}

      {/* ADR-0041 ingest panel — same slide-in mechanics as FiguresSlideIn.tsx. Renders
          nothing (IngestPanel self-guards too) when the flag is off; the AnimatePresence
          wrapper itself only mounts children while ingestOpen is true. */}
      {ingestUiEnabled && (
        <AnimatePresence>
          {ingestOpen && (
            <>
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.15 }}
                className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm"
                onClick={() => setIngestOpen(false)}
              />
              <motion.aside
                initial={{ x: "100%" }}
                animate={{ x: 0 }}
                exit={{ x: "100%" }}
                transition={{ type: "spring", stiffness: 340, damping: 32 }}
                className="fixed right-0 top-0 bottom-0 z-50 w-full sm:w-[520px] lg:w-[640px] bg-slate-950 border-l border-slate-800 shadow-2xl overflow-y-auto"
                data-ingest-slide-in
              >
                <div className="sticky top-0 z-10 backdrop-blur-md bg-slate-950/90 border-b border-slate-800 px-5 py-4 flex items-center gap-3">
                  <span className="text-[10px] font-mono uppercase tracking-widest text-slate-500 flex-1">
                    Ingest a document
                  </span>
                  <button onClick={() => setIngestOpen(false)} data-ingest-close>
                    <X className="w-4 h-4 text-slate-400" />
                  </button>
                </div>
                <div className="p-5">
                  <IngestPanel />
                </div>
              </motion.aside>
            </>
          )}
        </AnimatePresence>
      )}
    </div>
  );
}
