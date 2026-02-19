import { motion } from "framer-motion";
import { Radar } from "lucide-react";
import { OntologyMap } from "./OntologyMap";
import { DataBindings } from "./DataBindings";
import { useInterviewStore } from "@/store/useInterviewStore";
import { CompileButton } from "@/components/Compilation/CompileButton";

export function HUD() {
  const phase = useInterviewStore((s) => s.phase);

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
        <span className="text-[10px] font-mono uppercase tracking-[0.2em] text-neon-cyan/70">
          Live Context HUD
        </span>
      </motion.div>

      {/* Ontology Map */}
      <OntologyMap />

      {/* Data Bindings */}
      <DataBindings />

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
