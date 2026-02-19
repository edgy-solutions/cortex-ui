import { memo, useState } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { motion } from "framer-motion";
import { Cpu } from "lucide-react";

export interface ActionNodeData {
  label: string;
  subtitle?: string;
  delay?: number;
}

export const ActionNode = memo(function ActionNode({
  data,
}: NodeProps & { data: ActionNodeData }) {
  const delay = data.delay ?? 0;
  const [hovered, setHovered] = useState(false);

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
            Ready
          </span>
        </div>
      </div>

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
