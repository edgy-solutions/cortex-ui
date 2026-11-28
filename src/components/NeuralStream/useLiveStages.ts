import { useEffect, useMemo, useState } from "react";
import { useInterviewStore } from "@/store/useInterviewStore";
import type { ThinkingStep } from "@/store/useInterviewStore";
import { KNOWN_STAGES } from "@/lib/stageLabel";
import { timingLine, type TimingLine } from "@/lib/answerTiming";

/**
 * useLiveStages — the ONE source of live-turn feedback, shared by the
 * top-of-list strip (where the answer will land) and the bottom capsule
 * (above the prompt). Both must agree, so they read from here.
 *
 * Renders the latest agent message's thinkingSteps — WHAT ARRIVED, keeping the canonical
 * PIPELINE_STAGES order while the turn is on the canonical path (stable even before every stage
 * reports) and falling back to arrival order the moment it is not. See `deriveStages`.
 *
 * Tracks the current stage, the originating question, a live elapsed timer, and a 0..1 progress
 * fraction for the bars. The fraction is over the stages ACTUALLY DRAWN, so a path with a
 * different number of them is right without anything here knowing the number.
 */
export interface LiveStageInfo {
  active: boolean;
  stages: { kind: string; label: string; status: string }[];
  currentIndex: number;
  currentLabel: string;
  question: string;
  elapsedMs: number;
  /** What the strip says about the time: nothing, "longer than usual", or the stalled line.
   *  Judged only against a producer-served expected time (#595's `answer_timing`). */
  timing: TimingLine;
  /** 0..1 fill for the progress bar. */
  progress: number;
  total: number;
}

/** The canonical five PLUS the arrived-only stages (`waiting`): a known stage never flips the turn
 *  to arrival order. See `@/lib/stageLabel`. */
const CANONICAL_KINDS: ReadonlySet<string> = new Set(KNOWN_STAGES.map((s) => s.kind));

/**
 * The rows to draw for a turn — WHAT ARRIVED, not what we expected to arrive.
 *
 * ── THE DEFECT THIS CLOSES ────────────────────────────────────────────────────────────────
 *
 * This was `PIPELINE_STAGES.map(...)` with arriving steps looked up BY KIND, which quietly made
 * the canonical five the only stages that can ever be seen. A stage whose kind is not one of
 * them was not mis-drawn or flagged — it was DROPPED, with no error and no empty state, while
 * five invented rows carried on showing one stuck `loading` and four `pending`. A turn on any
 * other path would have looked like a slow classic turn forever.
 *
 * That is now live work: the direct route path emits THREE stages (`verifying_route`,
 * `calling_engine`, `writing_answer`) and the count is the point — there is no classifying or
 * planning stage because neither RUNS, the subject and verb having come from an ask the person
 * already answered. Drawing them would be a success line for work that never happened.
 *
 * ── THE RULE, AND WHY IT IS NOT A COUNT ───────────────────────────────────────────────────
 *
 * Render what arrived, in arrival order. The store already appends unknown kinds in the order
 * they land, so nothing here needs to know the vocabulary — which is the property that matters,
 * because the next path to be added will not be in any list this file could hold.
 *
 * The canonical order is kept for the canonical turn, and only for it. `primePipelineStages`
 * pre-renders the five so the panel never appears empty, and that seed is a GUESS at the path;
 * while every arriving stage is canonical the guess is holding and the stable order is worth
 * more than arrival order. The first non-canonical stage says the guess was wrong, and the
 * un-taken rows are dropped rather than left drawn as stuck.
 *
 * ── FALL-BACK FALLS OUT ───────────────────────────────────────────────────────────────────
 *
 * `fall_back` is not an answer and not an error: the route could not be confirmed and the turn
 * hands off to the full run, whose five-stage stream follows ON THE SAME TURN. Arrival order
 * renders that honestly with no special case — the fast stages, then the classic ones behind
 * them, in the order they actually happened. A rule keyed on a stage COUNT would have had to
 * decide which stream was "the" stream, and would have been wrong for one of them.
 */
export function deriveStages(
  steps: readonly ThinkingStep[],
): { kind: string; label: string; status: string }[] {
  const offPath = steps.some((s) => !CANONICAL_KINDS.has(s.kind));

  if (!offPath) {
    // Every kind is known. The canonical stages are drawn in table order, reported or not, as
    // they always were. An arrived-only stage (`waiting`) is drawn only once reported, so a
    // server that does not send it never shows it, and it is placed by WHEN it was reported:
    // ahead of the first canonical stage the server had not yet reported at that point.
    //
    // Placed by report, not given a fixed slot, because #595 sends `waiting` in two places: after
    // `understanding` completes on the run path, and AHEAD of it on the admission queue, where
    // `understanding` starts only once the answer is admitted. Any one slot is wrong for one path.
    const byKind = new Map<string, ThinkingStep>(steps.map((s) => [s.kind, s]));
    const reportedAt = (kind: string): number => {
      const s = byKind.get(kind);
      return s && !s.seeded && s.reportedOrder !== undefined ? s.reportedOrder : Infinity;
    };
    const anyReported = steps.some((s) => !s.seeded);
    const canonical = KNOWN_STAGES.filter((st) => !st.arrivedOnly).map((st) => {
      const status = byKind.get(st.kind)?.status ?? "pending";
      // The seed sets its first row `loading` with no signal behind it. Once the server has
      // reported anything, that guess is answered: on the admission queue the seeded
      // "understanding" would otherwise spin beside the real `waiting`.
      const shown = anyReported && byKind.get(st.kind)?.seeded && status === "loading" ? "pending" : status;
      return { kind: st.kind, label: st.label, status: shown };
    });
    const out = canonical.slice();
    for (const st of KNOWN_STAGES.filter((k) => k.arrivedOnly && byKind.has(k.kind))) {
      const at = reportedAt(st.kind);
      const before = out.findIndex(
        (row) => !KNOWN_STAGES.find((k) => k.kind === row.kind)?.arrivedOnly && reportedAt(row.kind) > at,
      );
      const row = { kind: st.kind, label: st.label, status: byKind.get(st.kind)!.status };
      out.splice(before < 0 ? out.length : before, 0, row);
    }
    return out;
  }

  // A stage outside the canonical set arrived, so the seed guessed a path this turn did not
  // take. Its un-reported rows are dropped — INCLUDING the one it set to `loading`, which never
  // had a signal behind it and is the only reason `seeded` has to be carried at all.
  return steps
    .filter((s) => !s.seeded)
    .map((s) => ({ kind: s.kind, label: s.label, status: s.status }));
}

export function useLiveStages(): LiveStageInfo {
  const messages = useInterviewStore((s) => s.messages);
  const isProcessing = useInterviewStore((s) => s.isProcessing);
  const [now, setNow] = useState(() => Date.now());

  const latestAgent = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role === "agent") return messages[i];
    }
    return undefined;
  }, [messages]);
  const steps = useMemo(() => latestAgent?.thinkingSteps ?? [], [latestAgent]);
  const served = latestAgent?.answerTiming;

  const question = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role === "user") return messages[i].content;
    }
    return "";
  }, [messages]);

  const stages = useMemo(() => deriveStages(steps), [steps]);

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

  // Before `answer_timing` arrives the clock is the client's, from the first stage. Once it
  // arrives the clock restarts from the server's `elapsed_ms` and counts on locally, so the
  // time shown and the expected time and deadline it is judged against share one origin (as
  // cortex told lane 74 it would, 2026-11-27). Each later event restarts it again.
  const elapsedMs = !active
    ? 0
    : served
      ? Math.max(0, served.elapsedMs + (now - served.receivedAt))
      : startedAt
        ? Math.max(0, now - startedAt)
        : 0;
  const timing = useMemo(
    () =>
      active
        ? timingLine(elapsedMs, { expectedMs: served?.expectedMs, deadlineMs: served?.deadlineMs })
        : ({ state: "normal" } as const),
    [active, elapsedMs, served],
  );
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
    timing,
    progress,
    total,
  };
}
