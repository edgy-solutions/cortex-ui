import { useState } from "react";
import { CheckCircle2, XCircle, ClipboardCheck } from "lucide-react";
import { toast } from "sonner";
import { actOnHumanTask } from "@/api/client";
import { markTaskResolvedByTaskId } from "@/lib/useTaskArtifactSync";
import { formatRequestedBy } from "@/lib/requestedBy";
import { isRegisteredKind } from "@/lib/taskKindRegistry";

/**
 * APPROVAL_TASK archetype — the canvas card for a HITL task that is a simple
 * accept/reject (bob's qualification items, workflow_ack, access_request), i.e.
 * every task that is NOT a grouped review (those render GROUPED_REVIEW). It acts
 * through the SAME sealed `/act` bridge as the old inbox card; nothing about the
 * decision path changes — it just lives on the canvas now, not in a modal.
 *
 * ── AN UNDECLARED KIND GETS NO VERBS ──────────────────────────────────────────────────────
 *
 * This card offered Approve and Reject to EVERY kind that reached it, and an unregistered kind
 * reaches it by default: `taskKindRegistry`'s fallback archetype is APPROVAL_TASK, so any task
 * species nobody has declared lands here and is handed two buttons.
 *
 * That is not a labelling problem. Pressing one posts a decision through `/act`, and ADR-0034
 * archives decision records immutably as promotion evidence — so the cost of guessing is a
 * permanent record of a judgement the data may not even represent. "Approve" on *this notice
 * could not be prepared for review* is the case that produced the TRIAGE_TASK species, and it
 * shipped exactly this way.
 *
 * DEFAULT-DENY. An affordance is a CLAIM that the system knows what this decision means, and
 * that claim needs a declaration behind it. A label that says nothing is harmless; an
 * affordance that says nothing still acts.
 *
 * The registry's own comment already asserted this card "renders the card in a NO-VERB
 * read-only mode" — it did not, and had not since the sentence was written. A recorded
 * conclusion about behaviour deserves the same suspicion as the behaviour.
 *
 * ── BUILT TO RETIRE ───────────────────────────────────────────────────────────────────────
 *
 * `isRegisteredKind` is INTERIM by construction: it asks a hardcoded table, and its opposite
 * number is `_VERBS_BY_KIND` in the backend. Both retire together when the SDK's `TaskKind`
 * row carries `renders_as`, `accepts` and `reason_required` as one served declaration.
 *
 * Nothing here assumes the table is permanent, and nothing here assumes the verb set is
 * {approve, reject}: the question asked is "is this kind DECLARED", which is the same question
 * the served row will answer, and the answer's SHAPE is what changes — a list of accepted
 * verbs rather than a boolean. That is why the deny is keyed on declaration rather than on a
 * kind string: a check against a list of known kinds would have to be rewritten; this one is
 * repointed.
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

  // DECLARED, not recognised-by-name. See the header: this is the seam the served TaskKind row
  // repoints, and the reason the deny is not a list of kind strings.
  const declared = isRegisteredKind(task.kind);

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
        {task.requested_by && <p>requested by · {formatRequestedBy(task.requested_by)}</p>}
        {task.subject_ref && <p className="break-all">subject · {task.subject_ref}</p>}
      </div>

      {!declared ? (
        /*
         * NO VERBS, AND THE REASON NAMED. Not a disabled button: a greyed Approve still says
         * "this is an approval, you merely cannot do it right now", which is a claim about the
         * species. Nothing here knows what decisions this kind accepts, so it offers none and
         * says which kind it could not place.
         *
         * The task is still READ in full above — title, summary, who asked. Reading is safe;
         * only deciding needs a declaration.
         */
        <div
          className="rounded border border-amber-500/30 bg-amber-500/5 px-3 py-2.5"
          data-undeclared-kind={task.kind}
        >
          <p className="text-[11px] font-mono uppercase tracking-widest text-amber-400/90">
            unknown species here
          </p>
          <p className="mt-1 text-[11px] text-slate-400 leading-relaxed">
            Nothing has declared what <span className="font-mono text-slate-300">{task.kind}</span>{" "}
            tasks accept, so no decision is offered. Acting on a guess would archive a record of
            a judgement this card cannot justify.
          </p>
        </div>
      ) : done ? (
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
