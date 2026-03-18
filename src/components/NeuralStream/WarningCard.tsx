import { motion } from "framer-motion";
import { AlertCircle, RefreshCcw } from "lucide-react";

interface WarningCardProps {
  error: string;
  onRetry?: () => void;
}

export function WarningCard({ error, onRetry }: WarningCardProps) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      className="max-w-md w-full glass-panel border-red-500/30 overflow-hidden relative group"
    >
      {/* Critical Alert Background Glow */}
      <div className="absolute inset-0 bg-red-500/5 pointer-events-none" />
      
      {/* Animated Red Pulse Edge */}
      <div className="absolute inset-0 border border-red-500/20 group-hover:border-red-500/40 transition-colors duration-500" />
      
      <div className="p-6 relative z-10">
        <div className="flex items-start gap-4">
          <div className="p-2 bg-red-500/10 border border-red-500/20 rounded-lg">
            <AlertCircle className="w-5 h-5 text-red-500" />
          </div>
          
          <div className="flex-1 space-y-2">
            <h3 className="font-mono text-sm font-bold text-red-500 uppercase tracking-wider">
              System Interface Failure
            </h3>
            <p className="font-mono text-[11px] text-slate-400 leading-relaxed">
              The Agent Mesh is unreachable. This may be due to a network timeout or the backend orchestrator being offline.
            </p>
            
            <div className="pt-3 flex flex-col gap-2">
              <div className="px-3 py-2 bg-black/40 border border-red-950 rounded font-mono text-[9px] text-red-400/80 break-all">
                ERR_CODE: {error}
              </div>
              
              {onRetry && (
                <button
                  onClick={onRetry}
                  className="flex items-center justify-center gap-2 px-4 py-2 bg-red-500/10 hover:bg-red-500/20 border border-red-500/30 rounded font-mono text-[10px] text-red-500 transition-all group/btn"
                >
                  <RefreshCcw className="w-3 h-3 group-hover/btn:rotate-180 transition-transform duration-500" />
                  INITIATE RECONNECT
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
      
      {/* Scanning line animation */}
      <div className="absolute top-0 left-0 w-full h-[1px] bg-red-500/20 animate-scan pointer-events-none" />
    </motion.div>
  );
}
