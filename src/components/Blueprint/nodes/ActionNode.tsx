import { memo, useState } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { motion, AnimatePresence } from "framer-motion";
import { Cpu, Database, BookOpen } from "lucide-react";

export interface ActionNodeData {
  label: string;
  subtitle?: string;
  delay?: number;
  /** IOF-MRO ontology URI (for semantic HUD tooltip) */
  ontologyClass?: string;
  /** DataHub/dbt model name (for semantic HUD tooltip) */
  dataSource?: string;
}

export const ActionNode = memo(function ActionNode({
  data,
}: NodeProps & { data: ActionNodeData }) {
  const delay = data.delay ?? 0;
  const [hovered, setHovered] = useState(false);
  const hasSemanticData = data.ontologyClass || data.dataSource;

  return (
    <motion.div
      initial={{ scale: 0, opacity: 0, x: 40 }}
      animate={{ scale: 1, opacity: 1, x: 0 }}
      transition={{
        type: "spring",
        stiffness: 220,
        damping: 20,
        delay,
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className="relative group"
    >
      {/* Glitch layer — only visible on hover */}
      {hovered && (
        <>
          <motion.div
            className="absolute inset-0 glass-panel border-neon-purple/40 rounded-xl"
            animate={{
              x: [0, -2, 3, -1, 0],
              opacity: [0.6, 0.3, 0.5, 0.2, 0],
            }}
            transition={{ duration: 0.3, repeat: Infinity }}
            style={{ clipPath: "inset(20% 0 60% 0)" }}
          />
          <motion.div
            className="absolute inset-0 glass-panel border-neon-cyan/30 rounded-xl"
            animate={{
              x: [0, 2, -3, 1, 0],
              opacity: [0.4, 0.6, 0.3, 0.5, 0],
            }}
            transition={{ duration: 0.25, repeat: Infinity }}
            style={{ clipPath: "inset(55% 0 15% 0)" }}
          />
        </>
      )}

      {/* Main rectangle */}
      <div className="relative w-44 glass-panel border-neon-purple/30 rounded-xl px-4 py-3 shadow-[0_0_20px_rgba(168,85,247,0.15),0_0_60px_rgba(168,85,247,0.05)] transition-shadow hover:shadow-[0_0_30px_rgba(168,85,247,0.3),0_0_80px_rgba(168,85,247,0.1)]">
        <div className="flex items-center gap-2 mb-1">
          <Cpu className="w-4 h-4 text-neon-purple flex-shrink-0" />
          <span className="font-mono text-[11px] font-semibold text-neon-purple leading-tight truncate">
            {data.label}
          </span>
        </div>
        {data.subtitle && (
          <span className="font-mono text-[9px] text-slate-500 block">
            {data.subtitle}
          </span>
        )}

        {/* Status bar */}
        <div className="mt-2 flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-neon-purple animate-pulse-neon" />
          <span className="font-mono text-[8px] text-slate-600 uppercase tracking-wider">
            {hasSemanticData ? "Grounded" : "Ready"}
          </span>
        </div>
      </div>

      {/* Semantic HUD Tooltip — glassmorphism panel on hover */}
      <AnimatePresence>
        {hovered && hasSemanticData && (
          <motion.div
            initial={{ opacity: 0, y: -8, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.95 }}
            transition={{ duration: 0.2 }}
            className="absolute top-full left-0 mt-2 w-56 z-50"
          >
            <div className="glass-panel rounded-lg px-3 py-2.5 border border-neon-cyan/20 shadow-[0_0_20px_rgba(0,212,255,0.15),0_4px_30px_rgba(0,0,0,0.5)]">
              <span className="font-mono text-[8px] text-neon-cyan/60 uppercase tracking-[0.15em] block mb-1.5">
                Semantic Grounding
              </span>
              {data.ontologyClass && (
                <div className="flex items-center gap-1.5 mb-1">
                  <BookOpen className="w-3 h-3 text-neon-green flex-shrink-0" />
                  <span className="font-mono text-[9px] text-neon-green truncate">
                    {data.ontologyClass}
                  </span>
                </div>
              )}
              {data.dataSource && (
                <div className="flex items-center gap-1.5">
                  <Database className="w-3 h-3 text-neon-blue flex-shrink-0" />
                  <span className="font-mono text-[9px] text-neon-blue truncate">
                    {data.dataSource}
                  </span>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Handles */}
      <Handle
        type="target"
        position={Position.Left}
        className="!w-2.5 !h-2.5 !bg-neon-purple !border-neon-purple/50 !border-2"
      />
      <Handle
        type="source"
        position={Position.Right}
        className="!w-2.5 !h-2.5 !bg-neon-purple !border-neon-purple/50 !border-2"
      />
    </motion.div>
  );
});
