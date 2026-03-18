import { motion } from "framer-motion";
import { AlertCircle, AlertTriangle, RefreshCcw } from "lucide-react";

interface WarningCardProps {
  error: string;
  hazards?: string[];
  isCritical?: boolean;
  onRetry?: () => void;
}

export function WarningCard({ error, hazards, isCritical = true, onRetry }: WarningCardProps) {
  const themeColor = isCritical ? "red" : "amber";
  const Icon = isCritical ? AlertCircle : AlertTriangle;

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      className={`max-w-md w-full glass-panel border-${themeColor}-500/30 overflow-hidden relative group`}
    >
      {/* Background Glow */}
      <div className={`absolute inset-0 bg-${themeColor}-500/5 pointer-events-none`} />
      
      {/* Pulse Edge */}
      <div className={`absolute inset-0 border border-${themeColor}-500/20 group-hover:border-${themeColor}-500/40 transition-colors duration-500`} />
      
      <div className="p-6 relative z-10">
        <div className="flex items-start gap-4">
          <div className={`p-2 bg-${themeColor}-500/10 border border-${themeColor}-500/20 rounded-lg`}>
            <Icon className={`w-5 h-5 text-${themeColor}-500`} />
          </div>
          
          <div className="flex-1 space-y-2">
            <h3 className={`font-mono text-sm font-bold text-${themeColor}-500 uppercase tracking-wider`}>
              {isCritical ? "System Interface Failure" : "Hazard Declaration"}
            </h3>
            <p className="font-mono text-[11px] text-slate-400 leading-relaxed text-wrap">
              {isCritical 
                ? "The Agent Mesh is unreachable. This may be due to a network timeout or the backend orchestrator being offline."
                : "The reasoning mesh has identified potential constraints or risks dynamic to this concept."}
            </p>
            
            <div className="pt-3 flex flex-col gap-2">
              <div className={`px-3 py-2 bg-black/40 border border-${themeColor}-950 rounded font-mono text-[9px] text-${themeColor}-400/80 break-all`}>
                {isCritical ? `ERR_CODE: ${error}` : `CONCEPT: ${error}`}
              </div>

              {hazards && hazards.length > 0 && (
                <ul className="mt-2 space-y-1">
                  {hazards.map((h, i) => (
                    <li key={i} className="flex items-center gap-2 font-mono text-[10px] text-slate-300">
                      <div className={`w-1 h-1 rounded-full bg-${themeColor}-500`} />
                      {h}
                    </li>
                  ))}
                </ul>
              )}
              
              {onRetry && (
                <button
                  onClick={onRetry}
                  className={`flex items-center justify-center gap-2 px-4 py-2 bg-${themeColor}-500/10 hover:bg-${themeColor}-500/20 border border-${themeColor}-500/30 rounded font-mono text-[10px] text-${themeColor}-500 transition-all group/btn`}
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
      <div className={`absolute top-0 left-0 w-full h-[1px] bg-${themeColor}-500/20 animate-scan pointer-events-none`} />
    </motion.div>
  );
}
