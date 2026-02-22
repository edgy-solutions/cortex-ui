import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { CheckCircle2, Terminal } from "lucide-react";
import { useInterviewStore } from "@/store/useInterviewStore";

interface CompilationOverlayProps {
  onComplete: () => void;
  bootLog?: string;
}

/** Fallback boot log when the backend hasn't returned one yet */
const FALLBACK_BOOT_LOG = `
╔══════════════════════════════════════════════════════════╗
║       C O R T E X  —  C O M P I L E R  v2.0          ║
╚══════════════════════════════════════════════════════════╝

  [INIT] Compiling workflow...
  [SYSTEM] Saving BPMN model ...
  [DONE] Pipeline compiled successfully.

  ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓ SYSTEM ONLINE
`.trim();

/** Map line prefix tags to neon colors for syntax highlighting */
function getLineColor(line: string): string {
  const trimmed = line.trim();
  if (trimmed.startsWith("╔") || trimmed.startsWith("║") || trimmed.startsWith("╚"))
    return "text-neon-blue";
  if (trimmed.startsWith("[INIT]")) return "text-slate-400";
  if (trimmed.startsWith("[SYSTEM]")) return "text-neon-blue";
  if (trimmed.startsWith("[AGENT]")) return "text-neon-purple";
  if (trimmed.startsWith("[GATE]")) return "text-neon-cyan";
  if (trimmed.startsWith("[LINK]")) return "text-neon-cyan";
  if (trimmed.startsWith("[SCAN]")) return "text-neon-cyan";
  if (trimmed.startsWith("[DAGSTER]")) return "text-yellow-400";
  if (trimmed.startsWith("[DONE]")) return "text-neon-green";
  if (trimmed.startsWith("[SYNC]")) return "text-neon-blue";
  if (trimmed.includes("SYSTEM ONLINE")) return "text-neon-green font-bold";
  if (trimmed.startsWith("──") || trimmed.startsWith("└")) return "text-slate-600";
  return "text-slate-500";
}

export function CompilationOverlay({ onComplete, bootLog }: CompilationOverlayProps) {
  const [visibleLines, setVisibleLines] = useState(0);
  const [done, setDone] = useState(false);
  const setPhase = useInterviewStore((s) => s.setPhase);

  const logText = bootLog || FALLBACK_BOOT_LOG;
  const lines = logText.split("\n");

  useEffect(() => {
    if (done) return;

    const interval = setInterval(() => {
      setVisibleLines((prev) => {
        if (prev >= lines.length) {
          clearInterval(interval);
          setTimeout(() => {
            setDone(true);
            setPhase("complete");
          }, 800);
          return prev;
        }
        return prev + 1;
      });
    }, 60);

    return () => clearInterval(interval);
  }, [done, lines.length, setPhase]);

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 flex items-center justify-center bg-surface-dark/95 backdrop-blur-xl"
      >
        <div className="w-full max-w-3xl mx-8">
          {!done ? (
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="flex flex-col"
            >
              {/* Header */}
              <div className="flex items-center gap-2 mb-4">
                <Terminal className="w-5 h-5 text-neon-blue animate-pulse-neon" />
                <span className="font-mono text-sm text-neon-blue tracking-widest uppercase">
                  Compiling Workflow...
                </span>
                <span className="ml-auto font-mono text-xs text-slate-600">
                  {visibleLines}/{lines.length} lines
                </span>
              </div>

              {/* Boot log terminal */}
              <div className="glass-panel p-4 max-h-[70vh] overflow-hidden neon-glow-blue">
                <pre className="font-mono text-xs leading-5">
                  {lines.slice(0, visibleLines).map((line, i) => (
                    <motion.div
                      key={i}
                      initial={{ opacity: 0, x: -5 }}
                      animate={{ opacity: 1, x: 0 }}
                      className="flex"
                    >
                      <span className="w-8 text-right mr-4 text-slate-700 select-none">
                        {i + 1}
                      </span>
                      <span className={getLineColor(line)}>
                        {line || "\u00A0"}
                      </span>
                    </motion.div>
                  ))}
                </pre>
              </div>

              {/* Progress bar */}
              <div className="mt-3 h-1 bg-slate-800 rounded-full overflow-hidden">
                <motion.div
                  className="h-full bg-gradient-to-r from-neon-blue to-neon-purple rounded-full"
                  style={{
                    width: `${(visibleLines / lines.length) * 100}%`,
                  }}
                  transition={{ duration: 0.1 }}
                />
              </div>
            </motion.div>
          ) : (
            <motion.div
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ type: "spring", stiffness: 200, damping: 15 }}
              className="flex flex-col items-center text-center"
            >
              <div className="relative mb-6">
                <CheckCircle2 className="w-20 h-20 text-neon-green" />
                <div className="absolute inset-0 w-20 h-20 bg-neon-green/20 rounded-full blur-2xl animate-pulse-neon" />
              </div>

              <h2 className="font-mono text-2xl font-bold text-neon-green tracking-wider mb-2 neon-text-blue">
                SYSTEM ONLINE
              </h2>
              <p className="text-slate-500 font-mono text-sm mb-8">
                Pipeline compiled successfully · {lines.length} lines generated
              </p>

              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={onComplete}
                className="px-6 py-2.5 rounded-xl bg-neon-green/10 border border-neon-green/30 font-mono text-sm text-neon-green hover:bg-neon-green/20 transition-colors"
              >
                RETURN TO CORTEX
              </motion.button>
            </motion.div>
          )}
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
