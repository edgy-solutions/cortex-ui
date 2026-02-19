import { motion, AnimatePresence } from "framer-motion";
import { Database } from "lucide-react";
import { useInterviewStore } from "@/store/useInterviewStore";

export function DataBindings() {
  const bindings = useInterviewStore((s) => s.dataBindings);

  return (
    <div className="glass-panel-sm p-3">
      <div className="flex items-center gap-2 mb-3">
        <Database className="w-3.5 h-3.5 text-neon-cyan/70" />
        <span className="text-[10px] font-mono uppercase tracking-widest text-slate-500">
          Data Bindings
        </span>
        {bindings.length > 0 && (
          <span className="ml-auto text-[10px] font-mono text-neon-cyan/50">
            {bindings.length}
          </span>
        )}
      </div>

      {bindings.length === 0 ? (
        <p className="text-xs text-slate-600 italic font-mono">
          No data models bound yet...
        </p>
      ) : (
        <div className="space-y-2">
          <AnimatePresence>
            {bindings.map((binding) => (
              <motion.div
                key={binding.id}
                initial={{ opacity: 0, x: 10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -10 }}
                transition={{ duration: 0.3 }}
                className="flex items-center gap-2 px-2 py-1.5 rounded-lg bg-slate-900/50 border border-slate-800/50"
              >
                {/* Health indicator */}
                <span
                  className={`w-2 h-2 rounded-full flex-shrink-0 ${
                    binding.healthy
                      ? "bg-neon-green shadow-[0_0_6px_rgba(34,197,94,0.5)]"
                      : "bg-red-500 shadow-[0_0_6px_rgba(239,68,68,0.5)]"
                  }`}
                />

                <div className="min-w-0 flex-1">
                  <p className="font-mono text-xs text-slate-300 truncate">
                    {binding.model}
                  </p>
                  <p className="font-mono text-[10px] text-slate-600">
                    {binding.schema}
                  </p>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      )}
    </div>
  );
}
