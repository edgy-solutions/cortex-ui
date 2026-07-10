import { useMemo } from "react";
import { useInterviewStore } from "@/store/useInterviewStore";
import { PIPELINE_STAGES } from "@/api/types";
import type { ThinkingStep } from "@/store/useInterviewStore";

/**
 * LiveStageCapsule — the COMPACT current-state indicator, pinned just
 * above the prompt.
 *
 * Replaces the need to scan the verbose 5-row ThinkingCard for "where are
 * we now": a single dot-train (done · current · todo) + the current
 * stage's label. Only present while a turn is in flight; collapses to
 * nothing when idle. The durable record of the answer lives in the list +
 * canvas — this is purely "what's happening right now."
 *
 * Reads the latest agent message's thinkingSteps from useInterviewStore
 * (same source the ThinkingCard uses); maps them onto the canonical
 * PIPELINE_STAGES order so the dot-train is stable even before every
 * stage has reported.
 */
export function LiveStageCapsule() {
  const messages = useInterviewStore((s) => s.messages);
  const isProcessing = useInterviewStore((s) => s.isProcessing);

  const steps = useMemo<ThinkingStep[]>(() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role === "agent") return messages[i].thinkingSteps ?? [];
    }
    return [];
  }, [messages]);

  // Status per canonical stage (default pending if not yet reported).
  const stages = useMemo(() => {
    const byKind = new Map(steps.map((s) => [s.kind, s]));
    return PIPELINE_STAGES.map((st) => ({
      kind: st.kind,
      label: st.label,
      status: byKind.get(st.kind)?.status ?? "pending",
    }));
  }, [steps]);

  // Current = the loading stage; else the last done (so a just-finished
  // pipeline reads "Composing"); else the first stage.
  const currentIndex = useMemo(() => {
    const loading = stages.findIndex((s) => s.status === "loading");
    if (loading >= 0) return loading;
    let lastDone = -1;
    stages.forEach((s, i) => {
      if (s.status === "done") lastDone = i;
    });
    return lastDone >= 0 ? lastDone : 0;
  }, [stages]);

  if (!isProcessing || steps.length === 0) return null;

  const current = stages[currentIndex];

  return (
    <div className="px-6 py-2 border-t border-glass-border flex items-center gap-3 flex-shrink-0">
      {/* Dot-train */}
      <div className="flex items-center gap-1.5">
        {stages.map((s, i) => {
          const done = s.status === "done";
          const isCurrent = i === currentIndex;
          const failed = s.status === "error";
          const incomplete = s.status === "incomplete";
          return (
            <span
              key={s.kind}
              className={`rounded-full transition-all ${
                isCurrent
                  ? "w-2 h-2 bg-neon-blue animate-pulse-neon"
                  : done
                  ? "w-1.5 h-1.5 bg-neon-green/80"
                  : failed
                  ? "w-1.5 h-1.5 bg-rose-500/80"
                  : incomplete
                  ? "w-1.5 h-1.5 bg-amber-400/70"
                  : "w-1.5 h-1.5 border border-slate-600/60"
              }`}
              title={s.label}
            />
          );
        })}
      </div>
      {/* Current stage label + position */}
      <span className="text-[10px] font-mono text-slate-300 truncate">
        {current.label}
      </span>
      <span className="ml-auto text-[9px] font-mono text-slate-500 tabular-nums flex-shrink-0">
        {currentIndex + 1}/{stages.length}
      </span>
    </div>
  );
}
