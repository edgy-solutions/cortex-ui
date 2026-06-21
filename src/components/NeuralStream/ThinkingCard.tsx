import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import {
  Search,
  CheckCircle2,
  Loader2,
  Database,
  Circle,
  AlertCircle,
} from "lucide-react";
import type { ThinkingStep } from "@/store/useInterviewStore";

interface ThinkingCardProps {
  steps: ThinkingStep[];
}

/**
 * Step icon — picks a glyph by status. `pending` is the new state for
 * Phase 0 instant-pre-render: the 5 stages render as muted circles
 * the instant a query fires, so the panel never sits empty.
 */
function StepIcon({ step }: { step: ThinkingStep }) {
  if (step.status === "done") {
    return <CheckCircle2 className="w-3.5 h-3.5 text-neon-green" />;
  }
  if (step.status === "error") {
    return <AlertCircle className="w-3.5 h-3.5 text-red-400" />;
  }
  if (step.status === "loading") {
    // "Retrieving" is the database-flavored step — keep the existing
    // database icon for it; everything else gets the spinner.
    if (step.kind === "retrieving") {
      return (
        <Database className="w-3.5 h-3.5 text-neon-cyan animate-pulse-neon" />
      );
    }
    return <Loader2 className="w-3.5 h-3.5 text-neon-blue animate-spin" />;
  }
  // pending
  return <Circle className="w-3.5 h-3.5 text-slate-600/50" />;
}

/**
 * Format elapsed milliseconds as a compact human-readable string.
 * < 1s   → "<1s"
 * < 60s  → "12s"
 * ≥ 60s  → "1m 23s"
 */
function formatElapsed(ms: number): string {
  if (ms < 1000) return "<1s";
  const totalSec = Math.floor(ms / 1000);
  if (totalSec < 60) return `${totalSec}s`;
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}m ${s}s`;
}

/**
 * ElapsedTicker — drives smooth seconds-counting from a `startedAt`
 * timestamp WITHOUT requiring the server to send heartbeats. This is
 * the architect's "local-interval elapsed-tick so seconds count
 * smoothly without server heartbeats" detail from Phase 0.
 *
 * Mounts only when the step is loading; unmounts when status changes
 * to done/error, so the interval stops cleanly with no lingering setInterval.
 */
function ElapsedTicker({
  startedAt,
  elapsedMsOverride,
}: {
  startedAt?: number;
  elapsedMsOverride?: number;
}) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, []);
  const ms =
    typeof elapsedMsOverride === "number"
      ? elapsedMsOverride
      : startedAt
      ? now - startedAt
      : 0;
  return (
    <span className="font-mono text-[10px] text-slate-500 tabular-nums">
      {formatElapsed(ms)}
    </span>
  );
}

export function ThinkingCard({ steps }: ThinkingCardProps) {
  if (!steps || steps.length === 0) return null;

  // Architect's principle: surface what the pipeline did. The card
  // shows the 5 stages (pre-rendered as pending on query fire), each
  // transitioning loading → done as the upstream events arrive. If the
  // gateway only emits one stage event, the others stay pending — which
  // is the honest signal (the system hasn't reached those stages).
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
            Pipeline
          </span>
        </div>

        {/* Steps */}
        <div className="space-y-1.5">
          {steps.map((step) => {
            const isLoading = step.status === "loading";
            const isPending = step.status === "pending";
            return (
              <motion.div
                key={step.id}
                layout
                initial={{ opacity: 0, x: -10 }}
                animate={{
                  opacity: isPending ? 0.45 : 1,
                  x: 0,
                  // Subtle breathing on the active stage — the architect's
                  // "lean into the existing cyberpunk language" note.
                  scale: isLoading ? [1, 1.012, 1] : 1,
                }}
                transition={{
                  duration: isLoading ? 2.4 : 0.3,
                  repeat: isLoading ? Infinity : 0,
                  ease: "easeInOut",
                }}
                className="flex items-center gap-2"
              >
                <StepIcon step={step} />
                <span
                  className={`font-mono text-xs flex-1 ${
                    step.status === "done"
                      ? "text-neon-green/90"
                      : step.status === "error"
                      ? "text-red-400/90"
                      : isPending
                      ? "text-slate-600"
                      : "text-slate-400"
                  }`}
                >
                  {step.label}
                </span>

                {/* Elapsed time — only on active stages so users see
                    "something is happening", not "stalled". */}
                {isLoading && (
                  <ElapsedTicker
                    startedAt={step.startedAt}
                    elapsedMsOverride={step.elapsedMs}
                  />
                )}

                {/* Loading bar for "retrieving" — the database-flavored
                    step gets the existing animated bar for continuity
                    with the prior design. */}
                {isLoading && step.kind === "retrieving" && (
                  <div className="h-1 bg-slate-800 rounded-full overflow-hidden max-w-[60px] w-[60px]">
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

                {/* Search icon fallback (preserves the prior legacy look
                    for steps we couldn't classify into a known kind). */}
                {!isLoading && step.status !== "done" && step.status !== "error" && (
                  <Search className="w-3.5 h-3.5 text-slate-700" />
                )}
              </motion.div>
            );
          })}
        </div>
      </div>
    </motion.div>
  );
}
