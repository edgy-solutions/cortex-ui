import { memo } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { motion } from "framer-motion";
import { Zap } from "lucide-react";

export interface TriggerNodeData {
  label: string;
  subtitle?: string;
  delay?: number;
}

export const TriggerNode = memo(function TriggerNode({
  data,
}: NodeProps & { data: TriggerNodeData }) {
  const delay = data.delay ?? 0;

  return (
    <motion.div
      initial={{ scale: 0, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={{
        type: "spring",
        stiffness: 260,
        damping: 20,
        delay,
      }}
      className="relative group"
    >
      {/* Outer pulse rings */}
      <div className="absolute inset-[-12px] rounded-full border border-neon-green/20 animate-[pulse-neon_3s_ease-in-out_infinite]" />
      <div className="absolute inset-[-6px] rounded-full border border-neon-green/10 animate-[pulse-neon_3s_ease-in-out_infinite_0.5s]" />

      {/* Main circle */}
      <div className="relative w-28 h-28 rounded-full flex flex-col items-center justify-center glass-panel border-neon-green/30 shadow-[0_0_20px_rgba(34,197,94,0.2),0_0_60px_rgba(34,197,94,0.05)]">
        <Zap className="w-5 h-5 text-neon-green mb-1" />
        <span className="font-mono text-[11px] font-semibold text-neon-green text-center leading-tight px-2">
          {data.label}
        </span>
        {data.subtitle && (
          <span className="font-mono text-[9px] text-slate-500 mt-0.5 text-center px-2">
            {data.subtitle}
          </span>
        )}
      </div>

      {/* Source handle (output) */}
      <Handle
        type="source"
        position={Position.Right}
        className="!w-2.5 !h-2.5 !bg-neon-green !border-neon-green/50 !border-2"
      />
    </motion.div>
  );
});
