import { useState } from "react";
import { CheckCircle2, XCircle, ClipboardCheck } from "lucide-react";
import { toast } from "sonner";
import { actOnHumanTask } from "@/api/client";
import { markTaskResolvedByTaskId } from "@/lib/useTaskArtifactSync";

/**
 * APPROVAL_TASK archetype — the canvas card for a HITL task that is a simple
 * accept/reject (bob's qualification items, workflow_ack, access_request), i.e.
 * every task that is NOT a grouped review (those render GROUPED_REVIEW). It acts
 * through the SAME sealed `/act` bridge as the old inbox card; nothing about the
 * decision path changes — it just lives on the canvas now, not in a modal.
 */
export interface ApprovalTaskPayload {
  task_id: string;
  kind: string;
  task_state?: "pending" | "approved" | "rejected" | "expired";
  title: string;
  summary: string;
  audience: string;
  requested_by: string;
  subject_ref: string | null;
}

export function ApprovalTaskCard({ task }: { task: ApprovalTaskPayload }) {
  const [acting, setActing] = useState(false);
  const [done, setDone] = useState<null | "approved" | "rejected">(null);

  const act = async (decision: "approved" | "rejected") => {
    setActing(true);
    try {
      const res = await actOnHumanTask(task.task_id, decision);
      setDone(decision);
      markTaskResolvedByTaskId(task.task_id);
      toast.success(
        decision === "approved"
          ? res.workflow_resumed
            ? "Approved — workflow resumed"
            : "Approved"
          : "Rejected"
      );
    } catch (err) {
      const status = (err as { response?: { status?: number } })?.response?.status;
      toast.error(
        status === 403
          ? "Not authorized to act on this task"
          : status === 404
            ? "Task no longer available"
            : "Action failed"
      );
    } finally {
      setActing(false);
    }
  };

  return (
    <div className="glass-panel p-6 my-4 border-cyan-500/20">
      <div className="mb-4">
        <div className="flex items-center gap-2 mb-1">
          <ClipboardCheck className="w-4 h-4 text-neon-pink" />
          <h3 className="text-lg font-bold text-white tracking-tight leading-none flex-1">
            {task.title}
          </h3>
          <span
            className={`px-1.5 py-0.5 rounded text-[8px] font-mono font-bold uppercase tracking-wider border ${
              done || task.task_state !== "pending"
                ? "text-slate-400 border-white/10 bg-white/5"
                : "text-pink-300 border-pink-500/40 bg-pink-500/10"
            }`}
          >
            {done ?? task.task_state ?? "pending"}
          </span>
        </div>
        <p className="text-[10px] text-cyan-400/70 uppercase tracking-[0.2em] font-mono font-bold">
          {task.kind} · {task.audience}
        </p>
      </div>

      {task.summary && (
        <p className="text-sm text-slate-300 mb-4 leading-relaxed">{task.summary}</p>
      )}

      <div className="space-y-0.5 text-[10px] font-mono text-slate-500 uppercase tracking-wider mb-5">
        {task.requested_by && <p>requested by · {task.requested_by}</p>}
        {task.subject_ref && <p className="break-all">subject · {task.subject_ref}</p>}
      </div>

      {done ? (
        <div className="text-[11px] font-mono uppercase tracking-widest text-neon-green">
          {done === "approved" ? "Approved" : "Rejected"}
        </div>
      ) : (
        <div className="flex gap-2">
          <button
            onClick={() => act("approved")}
            disabled={acting}
            className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded bg-neon-green/10 border border-neon-green/50 text-neon-green text-[11px] font-mono uppercase tracking-widest hover:bg-neon-green/20 disabled:opacity-40 transition-colors cursor-pointer"
          >
            <CheckCircle2 className="w-3.5 h-3.5" /> Approve
          </button>
          <button
            onClick={() => act("rejected")}
            disabled={acting}
            className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded bg-neon-pink/10 border border-neon-pink/50 text-neon-pink text-[11px] font-mono uppercase tracking-widest hover:bg-neon-pink/20 disabled:opacity-40 transition-colors cursor-pointer"
          >
            <XCircle className="w-3.5 h-3.5" /> Reject
          </button>
        </div>
      )}
    </div>
  );
}
