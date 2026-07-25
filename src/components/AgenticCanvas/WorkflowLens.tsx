import { Fragment } from "react";
import type { TaskRef } from "@/api/types";
import { taskKindTitle } from "@/lib/taskKindRegistry";

/**
 * WORKFLOW lens — the provenance view of a TASK, the task-side peer of an
 * answer's Decision Map: "show me the path this thing is taking." A cursor on
 * the process graph.
 *
 * HONESTY GUARD (v1): render ONLY witnessed states. The five-beats loop is real
 * (compose → review → fan-out → dispatch → stamp), but the UI must not draw a
 * step it can't source. Today the payload witnesses only created + the current
 * lifecycle state, so v1 is three nodes: Created → <the task's action> (now) →
 * Resolved. The richer graph arrives AS THE DATA DOES (served workflow
 * definition + runtime position, M3). Build as "steps + current position" now
 * and the definition migration inherits it. Generic by construction — the middle
 * node's label is the served kind title, no per-kind node sets (no re-pollution).
 */
type NodeState = "done" | "current" | "future";

function Node({ label, state }: { label: string; state: NodeState }) {
  const dot =
    state === "done"
      ? "bg-neon-cyan"
      : state === "current"
        ? "bg-neon-pink animate-pulse"
        : "bg-slate-600";
  const text =
    state === "current" ? "text-neon-pink" : state === "done" ? "text-slate-200" : "text-slate-500";
  return (
    <div className="flex flex-col items-center gap-2 min-w-0">
      <div className={`w-3 h-3 rounded-full ${dot} shadow`} style={{ boxShadow: "0 0 8px currentColor" }} />
      <span className={`text-[10px] font-mono uppercase tracking-wider text-center ${text}`}>
        {label}
      </span>
      {state === "current" && (
        <span className="text-[8px] font-mono uppercase tracking-widest text-neon-pink/70">you are here</span>
      )}
    </div>
  );
}

function Connector({ filled }: { filled: boolean }) {
  return (
    <div className="flex-1 h-px mx-1 mt-1.5 self-start" style={{ background: filled ? "rgba(45,212,191,.5)" : "rgba(100,116,139,.3)" }} />
  );
}

export function WorkflowLens({ taskRef }: { taskRef: TaskRef }) {
  const pending = taskRef.task_state === "pending";
  const actionLabel = taskKindTitle(taskRef.kind);

  const nodes: Array<{ label: string; state: NodeState }> = [
    { label: "Created", state: "done" },
    { label: actionLabel, state: pending ? "current" : "done" },
    { label: pending ? "Resolved" : taskRef.task_state, state: pending ? "future" : "current" },
  ];

  return (
    <div className="glass-panel p-6 my-4 border-cyan-500/20">
      <div className="flex items-center gap-2 mb-6">
        <span className="text-[10px] font-mono uppercase tracking-[0.2em] text-neon-cyan/70">
          Workflow · {actionLabel}
        </span>
      </div>

      <div className="flex items-start justify-between px-2">
        {nodes.map((n, i) => (
          <Fragment key={i}>
            <Node label={n.label} state={n.state} />
            {i < nodes.length - 1 && <Connector filled={n.state === "done"} />}
          </Fragment>
        ))}
      </div>

      <p className="mt-6 pt-4 border-t border-white/5 text-[9px] font-mono text-slate-500 leading-relaxed">
        Witnessed states only — the fan-out / dispatch / state-stamp steps render here once the workflow
        payload reports them (served definition + runtime position, M3).
      </p>
    </div>
  );
}
