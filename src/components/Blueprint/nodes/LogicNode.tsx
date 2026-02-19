import { memo } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { motion } from "framer-motion";
import { Brain } from "lucide-react";

export interface LogicNodeData {
  label: string;
  subtitle?: string;
  delay?: number;
}

export const LogicNode = memo(function LogicNode({
  data,
}: NodeProps & { data: LogicNodeData }) {
  const delay = data.delay ?? 0;

  return (
    <motion.div
      initial={{ scale: 0, opacity: 0, rotate: -45 }}
      animate={{ scale: 1, opacity: 1, rotate: 0 }}
      transition={{
        type: "spring",
        stiffness: 200,
        damping: 18,
        delay,
      }}
      className="relative group"
    >
      {/* Diamond wrapper — rotates the container 45° */}
      <div className="relative">
        {/* Glow aura */}
        <div className="absolute inset-[-4px] rotate-45 bg-neon-blue/10 rounded-xl blur-lg animate-glow" />

        {/* Diamond shape */}
        <div className="w-32 h-32 rotate-45 glass-panel border-neon-blue/30 shadow-[0_0_25px_rgba(0,212,255,0.2),0_0_60px_rgba(0,212,255,0.08)] flex items-center justify-center">
          {/* Counter-rotate content so text is upright */}
          <div className="-rotate-45 flex flex-col items-center text-center px-3">
            <Brain className="w-4 h-4 text-neon-blue mb-1" />
            <span className="font-mono text-[10px] font-semibold text-neon-blue leading-tight">
              {data.label}
            </span>
            {data.subtitle && (
              <span className="font-mono text-[8px] text-slate-500 mt-0.5">
                {data.subtitle}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Handles — positioned on the diamond's logical left/right */}
      <Handle
        type="target"
        position={Position.Left}
        className="!w-2.5 !h-2.5 !bg-neon-blue !border-neon-blue/50 !border-2"
      />
      <Handle
        type="source"
        position={Position.Right}
        className="!w-2.5 !h-2.5 !bg-neon-blue !border-neon-blue/50 !border-2"
      />
    </motion.div>
  );
});
