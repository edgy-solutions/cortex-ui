import { useState } from "react";
import { motion } from "framer-motion";
import { Play, CheckCircle2 } from "lucide-react";
import { useInterviewStore } from "@/store/useInterviewStore";
import { useCompileWorkflow } from "@/hooks/useCompileWorkflow";
import { CompilationOverlay } from "./CompilationOverlay";

export function CompileButton() {
  const [showOverlay, setShowOverlay] = useState(false);
  const phase = useInterviewStore((s) => s.phase);
  const setPhase = useInterviewStore((s) => s.setPhase);
  const { compile, bootLog } = useCompileWorkflow();

  const handleCompile = () => {
    setPhase("compiling");
    setShowOverlay(true);
    // Fire the real compile mutation (backend upsert + Dagster reload)
    compile();
  };

  if (phase === "complete") {
    return (
      <div className="flex items-center justify-center gap-2 p-3 rounded-xl bg-neon-green/10 border border-neon-green/30">
        <CheckCircle2 className="w-5 h-5 text-neon-green" />
        <span className="font-mono text-sm text-neon-green font-semibold tracking-wide">
          SYSTEM ONLINE
        </span>
      </div>
    );
  }

  return (
    <>
      <motion.button
        whileHover={{ scale: 1.02 }}
        whileTap={{ scale: 0.98 }}
        onClick={handleCompile}
        className="relative w-full group"
      >
        {/* Glow effect */}
        <div className="absolute -inset-0.5 bg-gradient-to-r from-neon-blue via-neon-purple to-neon-blue rounded-xl blur opacity-60 group-hover:opacity-100 transition-opacity" />

        <div className="relative flex items-center justify-center gap-2 p-3 rounded-xl bg-surface-panel border border-neon-blue/40">
          <Play className="w-4 h-4 text-neon-blue" />
          <span className="font-mono text-sm text-slate-200 font-semibold tracking-wide">
            COMPILE WORKFLOW
          </span>
        </div>
      </motion.button>

      {showOverlay && (
        <CompilationOverlay
          onComplete={() => setShowOverlay(false)}
          bootLog={bootLog}
        />
      )}
    </>
  );
}
