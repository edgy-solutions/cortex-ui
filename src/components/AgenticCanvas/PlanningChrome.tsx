import { useMemo } from "react";
import { useCanvasStore } from "@/store/useCanvasStore";
import { isUnresolved } from "@/lib/answerDisplay";

/**
 * PlanningChrome — the session strip a `portfolio_planning` canvas mounts.
 *
 * Two rules it exists to obey.
 *
 * **It reads, it never holds.** Every number here is a projection of state that already
 * persists somewhere governed — answers are artifacts hydrated by Electric, arrangement is
 * canvas persistence. Nothing on this strip is a new source of truth, which is what keeps it
 * from becoming a config file wearing a card's clothes. It also means these counters cannot
 * drift from what they summarize: there is no second copy to drift from.
 *
 * **It is chrome, not a card.** It mounts on the SURFACE around the canvas, beside the Q&A
 * rail and the HUD — never as a canvas item. A canvas item is an SPO-tagged answer object
 * (ADR-0028 §2): subject, verb, provenance, a decision path. A session counter has none of
 * those and would be a card that is secretly workspace state, unreadable by everything that
 * reads cards and load-bearing for everything.
 *
 * The type gates it, following the `relationship` precedent — a canvas's `use` decides what
 * mounts AROUND it, never what it may hold.
 */
export function PlanningChrome() {
  const artifacts = useCanvasStore((s) => s.artifacts);

  const counts = useMemo(() => {
    // Task-artifacts are timeline citizens but not answers to questions, so they are excluded
    // from a count labelled "answered" rather than silently inflating it.
    const answers = artifacts.filter((a) => a.status !== "pending" && !a.task_ref);
    return {
      answered: answers.length,
      unresolved: answers.filter(isUnresolved).length,
    };
  }, [artifacts]);

  return (
    <div
      data-overlay
      className="absolute top-3 left-3 z-20 flex items-center gap-4 rounded-lg border border-neon-cyan/25 bg-slate-950/85 backdrop-blur-sm px-3 py-1.5 shadow-lg"
    >
      <span className="text-[9px] font-mono uppercase tracking-widest text-neon-cyan/70">
        Session
      </span>
      <Counter label="answered" value={counts.answered} />
      <Counter label="unresolved" value={counts.unresolved} />
      {/*
        Deliberately NOT rendered as 0: cortex-ui has no DecisionRecord artifact to count
        yet, so a zero here would be a fabricated measurement — the same defect as an axis
        asserting a currency the payload never declared. An em dash says "not measured";
        a 0 says "measured, and none" and would be a lie the moment the first commit lands.
      */}
      <Counter label="committed" value={null} title="No decision records reach this client yet — not measured, not zero" />
    </div>
  );
}

function Counter({
  label,
  value,
  title,
}: {
  label: string;
  value: number | null;
  title?: string;
}) {
  return (
    <span className="flex items-center gap-1.5" title={title}>
      <span className="text-[9px] font-mono uppercase tracking-wider text-slate-500">
        {label}
      </span>
      <span
        className={`text-[11px] font-mono tabular-nums ${
          value === null ? "text-slate-600" : "text-slate-200"
        }`}
      >
        {value === null ? "—" : value}
      </span>
    </span>
  );
}
