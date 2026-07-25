import { motion } from "framer-motion";
import { Radar } from "lucide-react";
import { OntologyMap } from "./OntologyMap";
import { RoutingDecision } from "./RoutingDecision";
import { SourcesTrail } from "./SourcesTrail";
import { DecisionPathDiagram } from "./DecisionPathDiagram";
import { GraphTrace } from "./GraphTrace";
import { TaskContextCard } from "./TaskContextCard";
import { ModeToggle } from "./ModeToggle";
import { useInterviewStore } from "@/store/useInterviewStore";
import { useCurrentArtifact } from "@/store/useCanvasStore";
import { CompileButton } from "@/components/Compilation/CompileButton";

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
    </div>
  );
}
