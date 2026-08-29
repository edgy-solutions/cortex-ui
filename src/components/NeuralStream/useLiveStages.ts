import { useEffect, useMemo, useState } from "react";
import { useInterviewStore } from "@/store/useInterviewStore";
import { PIPELINE_STAGES } from "@/api/types";

/**
 * useLiveStages — the ONE source of live-turn feedback, shared by the
 * top-of-list strip (where the answer will land) and the bottom capsule
 * (above the prompt). Both must agree, so they read from here.
 *
 * Maps the latest agent message's thinkingSteps onto the canonical
 * PIPELINE_STAGES order (stable even before every stage reports), tracks
 * the current stage, the originating question, a live elapsed timer, and
 * a 0..1 progress fraction for the bars.
 */
export interface LiveStageInfo {
  active: boolean;
  stages: { kind: string; label: string; status: string }[];
  currentIndex: number;
  currentLabel: string;
  question: string;
  elapsedMs: number;
  /** 0..1 fill for the progress bar. */
  progress: number;
  total: number;
}

export function useLiveStages(): LiveStageInfo {
  const messages = useInterviewStore((s) => s.messages);
  const isProcessing = useInterviewStore((s) => s.isProcessing);
  const [now, setNow] = useState(() => Date.now());

  const steps = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role === "agent") return messages[i].thinkingSteps ?? [];
    }
    return [];
  }, [messages]);

  const question = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role === "user") return messages[i].content;
    }
    return "";
  }, [messages]);

  const stages = useMemo(() => {
    const byKind = new Map(steps.map((s) => [s.kind, s]));
    return PIPELINE_STAGES.map((st) => ({
      kind: st.kind,
      label: st.label,
      status: byKind.get(st.kind)?.status ?? "pending",
    }));
  }, [steps]);

  const currentIndex = useMemo(() => {
    const loading = stages.findIndex((s) => s.status === "loading");
    if (loading >= 0) return loading;
    let lastDone = -1;
    stages.forEach((s, i) => {
      if (s.status === "done") lastDone = i;
    });
    return lastDone >= 0 ? lastDone : 0;
  }, [stages]);

  const startedAt = useMemo(() => {
    let min = Infinity;
    for (const s of steps) if (s.startedAt && s.startedAt < min) min = s.startedAt;
    return min === Infinity ? null : min;
  }, [steps]);

  const active = isProcessing && steps.length > 0;

  // Tick the elapsed clock only while a turn is in flight.
  useEffect(() => {
    if (!active) return;
    const id = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(id);
  }, [active]);

  const elapsedMs = active && startedAt ? Math.max(0, now - startedAt) : 0;
  const total = stages.length;
  const doneCount = stages.filter((s) => s.status === "done").length;
  // Fill: completed stages + a half-step credit for the in-flight one.
  const progress = total
    ? Math.min(1, (doneCount + (active ? 0.5 : 0)) / total)
    : 0;

  return {
    active,
    stages,
    currentIndex,
    currentLabel: stages[currentIndex]?.label ?? "",
    question,
    elapsedMs,
    progress,
    total,
  };
}

/**
 * Compact elapsed formatter: "2.5s" under 10s, "12s" under 60s, "1m 03s".
 *
 * MOVED to `@/lib/formatDuration` when the answers list became a second consumer.
 * Re-exported under the old name so the live ticker and a finished answer`s stamp
 * are the same function rather than two that agree today.
 */
export { formatDuration as formatElapsed } from "@/lib/formatDuration";
