import { motion } from "framer-motion";
import { Search, CheckCircle2, Loader2, Database } from "lucide-react";
import type { ThinkingStep } from "@/store/useInterviewStore";

interface ThinkingCardProps {
  steps: ThinkingStep[];
}

function StepIcon({ step }: { step: ThinkingStep }) {
  if (step.status === "done") {
    return <CheckCircle2 className="w-3.5 h-3.5 text-neon-green" />;
  }
  if (step.label.toLowerCase().includes("querying")) {
    return (
      <Database className="w-3.5 h-3.5 text-neon-cyan animate-pulse-neon" />
    );
  }
  if (step.status === "loading") {
    return (
      <Loader2 className="w-3.5 h-3.5 text-neon-blue animate-spin" />
    );
  }
  return <Search className="w-3.5 h-3.5 text-slate-500" />;
}

export function ThinkingCard({ steps }: ThinkingCardProps) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95, height: 0 }}
      animate={{ opacity: 1, scale: 1, height: "auto" }}
      transition={{ duration: 0.4, ease: "easeOut" }}
      className="w-full overflow-hidden"
    >
      <div className="glass-panel-sm p-3 border-neon-blue/20 neon-glow-blue">
        {/* Header */}
        <div className="flex items-center gap-2 mb-2">
          <div className="w-1.5 h-1.5 rounded-full bg-neon-blue animate-pulse-neon" />
          <span className="text-[10px] font-mono uppercase tracking-widest text-neon-blue/70">
            Agent Processing
          </span>
        </div>

        {/* Steps */}
        <div className="space-y-1.5">
          {steps.map((step) => (
            <motion.div
              key={step.id}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.3 }}
              className="flex items-center gap-2"
            >
              <StepIcon step={step} />
              <span
                className={`font-mono text-xs ${
                  step.status === "done"
                    ? "text-neon-green/90"
                    : "text-slate-400"
                }`}
              >
                {step.label}
              </span>

              {/* Loading bar for "querying" steps */}
              {step.status === "loading" &&
                step.label.toLowerCase().includes("querying") && (
                  <div className="flex-1 h-1 bg-slate-800 rounded-full overflow-hidden ml-1 max-w-[100px]">
                    <motion.div
                      className="h-full bg-gradient-to-r from-neon-blue to-neon-cyan rounded-full"
                      initial={{ width: "0%" }}
                      animate={{ width: "100%" }}
                      transition={{
                        duration: 1.5,
                        repeat: Infinity,
                        ease: "easeInOut",
                      }}
                    />
                  </div>
                )}
            </motion.div>
          ))}
        </div>
      </div>
    </motion.div>
  );
}
