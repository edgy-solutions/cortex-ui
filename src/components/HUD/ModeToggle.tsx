import { Eye, Activity } from "lucide-react";
import { motion } from "framer-motion";
import { useInterviewStore } from "@/store/useInterviewStore";

/**
 * ModeToggle — Phase 5 plain/detailed switch.
 *
 *   Plain    = pipeline stages + routing card + sources
 *   Detailed = above PLUS the GraphTrace component (substrate walk).
 *
 * Persisted per-user in localStorage (handled in the store action).
 * The choice never alters what the pipeline EMITS — only what the UI
 * renders. The two modes share the same single event stream, so they
 * cannot diverge (architect's Phase 0 ruling: "driven by the same
 * typed event union").
 */
export function ModeToggle() {
  const mode = useInterviewStore((s) => s.groundingDisplayMode);
  const setMode = useInterviewStore((s) => s.setGroundingDisplayMode);

  return (
    <div className="flex items-center gap-1 p-0.5 rounded-md bg-slate-900/60 border border-slate-800/50 text-[10px] font-mono">
      <button
        type="button"
        onClick={() => setMode("plain")}
        className={`relative flex items-center gap-1 px-2 py-1 rounded transition-colors ${
          mode === "plain"
            ? "text-neon-cyan"
            : "text-slate-500 hover:text-slate-300"
        }`}
        title="Plain — stages, routing, sources"
      >
        {mode === "plain" && (
          <motion.span
            layoutId="mode-pill"
            className="absolute inset-0 rounded bg-neon-cyan/10 border border-neon-cyan/30"
            transition={{ type: "spring", stiffness: 360, damping: 28 }}
          />
        )}
        <span className="relative z-10 flex items-center gap-1">
          <Eye className="w-3 h-3" /> Plain
        </span>
      </button>
      <button
        type="button"
        onClick={() => setMode("detailed")}
        className={`relative flex items-center gap-1 px-2 py-1 rounded transition-colors ${
          mode === "detailed"
            ? "text-neon-purple"
            : "text-slate-500 hover:text-slate-300"
        }`}
        title="Detailed — adds substrate-walk trace"
      >
        {mode === "detailed" && (
          <motion.span
            layoutId="mode-pill"
            className="absolute inset-0 rounded bg-neon-purple/10 border border-neon-purple/30"
            transition={{ type: "spring", stiffness: 360, damping: 28 }}
          />
        )}
        <span className="relative z-10 flex items-center gap-1">
          <Activity className="w-3 h-3" /> Detailed
        </span>
      </button>
    </div>
  );
}
