/**
 * HITL Slice 2 — the HumanTask inbox drawer.
 *
 * Right-edge slide-in (mirrors NodeInspector). Shows the caller's PENDING tasks,
 * fed live by the Electric `human_task_projection` subscription — which the
 * cortex-bff proxy per-user-filters by the caller's authz_id, so this list only
 * ever contains THIS user's tasks (replication-layer isolation; no client
 * filtering to trust).
 *
 * Acting: Approve/Reject → cortex-bff re-checks Topaz can_act, then (for a
 * workflow_ack task) resolves the Restate promise so the suspended workflow
 * RESUMES. The row's status flips to approved/rejected and arrives back over
 * Electric as an update, dropping it from the pending view. On open we also do
 * a REST snapshot (fetchMyHumanTasks) in case the subscription hasn't delivered
 * yet — the two agree by construction (same recipient_id filter).
 */
import { useEffect, useMemo, useState } from "react";
import { X, ClipboardCheck, CheckCircle2, XCircle } from "lucide-react";
import { toast } from "sonner";
import {
  useHumanTaskStore,
  type HumanTask,
} from "@/store/useHumanTaskStore";
import { fetchMyHumanTasks, actOnHumanTask, fetchReviewBatch } from "@/api/client";
import { GroupedReviewTable } from "@/components/GroupedReview/GroupedReviewTable";
import type { ReviewBatch } from "@/components/GroupedReview/types";

/**
 * Reconcile the pending list from the authoritative REST snapshot (/me/human_tasks
 * returns only PENDING rows, filtered by the caller's authz_id). This is the
 * source of truth for the inbox — it drops tasks resolved out-of-band even when
 * the Electric live-update didn't arrive, and clears any stale rows. Electric is
 * a best-effort live layer on top; the acting user's own result comes from the
 * optimistic removal in act() below, not the round-trip.
 */
export function seedFromRest() {
  fetchMyHumanTasks()
    .then((resp) => {
      const tasks: HumanTask[] = [];
      for (const t of resp.tasks) {
        if (t.id == null || t.task_id == null) continue;
        tasks.push({
          id: String(t.id),
          taskId: String(t.task_id),
          workflowId: (t.workflow_id as string | null) ?? null,
          audience: String(t.audience ?? ""),
          kind: String(t.kind ?? "workflow_ack"),
          status: (t.status as HumanTask["status"]) ?? "pending",
          title: String(t.title ?? ""),
          summary: String(t.summary ?? ""),
          requestedBy: String(t.requested_by ?? ""),
          subjectRef: (t.subject_ref as string | null) ?? null,
          createdAt: Number(t.created_at ?? 0),
        });
      }
      useHumanTaskStore.getState().replacePending(tasks);
    })
    .catch((err) => console.warn("[hitl] REST seed failed (live via Electric)", err));
}

function TaskCard({ task }: { task: HumanTask }) {
  const acting = useHumanTaskStore((s) => s.acting[task.taskId] ?? false);
  const setActing = useHumanTaskStore((s) => s.setActing);
  // Grouped review: a batch can't be actioned blind — a needs_review row is a mandatory per-item
  // exception, so accept-all refuses without an override. The card opens the detail view instead.
  const isGrouped = task.kind === "pcn_grouped_review";
  const [reviewBatch, setReviewBatch] = useState<ReviewBatch | null>(null);
  const [loadingBatch, setLoadingBatch] = useState(false);

  const act = async (decision: "approved" | "rejected") => {
    setActing(task.taskId, true);
    try {
      const res = await actOnHumanTask(task.taskId, decision);
      // Optimistic: drop it locally NOW rather than waiting for the Electric
      // round-trip (which may lag). The backend already resolved it (the act
      // returned 200); the toast confirms the resume.
      useHumanTaskStore.getState().removeTask(task.id);
      if (decision === "approved") {
        toast.success(
          res.workflow_resumed ? "Approved — workflow resumed" : "Approved"
        );
      } else {
        toast(res.workflow_resumed ? "Rejected — workflow resumed" : "Rejected");
      }
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
      setActing(task.taskId, false);
    }
  };

  const openReview = async () => {
    if (!task.workflowId) return;
    setLoadingBatch(true);
    try {
      setReviewBatch(await fetchReviewBatch(task.workflowId));
    } catch (err) {
      const status = (err as { response?: { status?: number } })?.response?.status;
      toast.error(status === 404 ? "Review no longer available" : "Could not load review");
    } finally {
      setLoadingBatch(false);
    }
  };

  return (
    <>
      <div className="p-3 bg-slate-900/50 border border-white/10 rounded-lg space-y-2">
        <div className="flex items-start gap-2">
          <span className="w-2 h-2 rounded-full bg-neon-pink mt-1.5 animate-pulse shrink-0" />
          <div className="min-w-0 flex-1">
            <p className="text-xs font-mono text-white truncate">{task.title}</p>
            <p className="text-[10px] text-slate-400 mt-1 leading-relaxed">{task.summary}</p>
            <div className="mt-2 space-y-0.5 text-[9px] font-mono text-slate-500 uppercase tracking-wider">
              <p>audience · {task.audience}</p>
              {task.requestedBy && <p>requested by · {task.requestedBy}</p>}
              {task.subjectRef && <p>subject · {task.subjectRef}</p>}
            </div>
          </div>
        </div>
        <div className="flex gap-2 pt-1">
          {isGrouped ? (
            <button
              onClick={openReview}
              disabled={loadingBatch || !task.workflowId}
              title={!task.workflowId ? "stale task — no workflow to review" : undefined}
              className="flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 rounded bg-neon-blue/10 border border-neon-blue/50 text-neon-blue text-[11px] font-mono uppercase tracking-widest hover:bg-neon-blue/20 disabled:opacity-40 transition-colors cursor-pointer"
            >
              <ClipboardCheck className="w-3.5 h-3.5" /> {loadingBatch ? "Loading…" : "Review"}
            </button>
          ) : (
            <>
              <button
                onClick={() => act("approved")}
                disabled={acting}
                className="flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 rounded bg-neon-green/10 border border-neon-green/50 text-neon-green text-[11px] font-mono uppercase tracking-widest hover:bg-neon-green/20 disabled:opacity-40 transition-colors cursor-pointer"
              >
                <CheckCircle2 className="w-3.5 h-3.5" /> Approve
              </button>
              <button
                onClick={() => act("rejected")}
                disabled={acting}
                className="flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 rounded bg-neon-pink/10 border border-neon-pink/50 text-neon-pink text-[11px] font-mono uppercase tracking-widest hover:bg-neon-pink/20 disabled:opacity-40 transition-colors cursor-pointer"
              >
                <XCircle className="w-3.5 h-3.5" /> Reject
              </button>
            </>
          )}
        </div>
      </div>

      {/* Review detail — the batch the reviewer resolves (accept-all-with-exceptions). Overlay above the
          inbox drawer; resolving it drops the task from the queue. */}
      {reviewBatch && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
          onClick={() => setReviewBatch(null)}
        >
          <div
            className="w-full max-w-4xl max-h-[90vh] overflow-y-auto custom-scrollbar"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-end mb-2">
              <button
                onClick={() => setReviewBatch(null)}
                className="text-slate-400 hover:text-white transition-colors cursor-pointer"
                aria-label="Close review"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <GroupedReviewTable
              batch={reviewBatch}
              onResolved={() => {
                useHumanTaskStore.getState().removeTask(task.id);
                setReviewBatch(null);
              }}
            />
          </div>
        </div>
      )}
    </>
  );
}

export function HumanTaskInbox() {
  const isInboxOpen = useHumanTaskStore((s) => s.isInboxOpen);
  const setInboxOpen = useHumanTaskStore((s) => s.setInboxOpen);
  // Select the STABLE raw tasks array (only changes when upsert/remove creates a
  // new array), then derive `pending` with useMemo. Subscribing directly to a
  // filtering selector (returns a NEW array each call) makes useSyncExternalStore
  // see a fresh snapshot every render -> infinite re-render (React #185).
  const tasks = useHumanTaskStore((s) => s.tasks);
  const pending = useMemo(
    () =>
      tasks
        .filter((t) => t.status === "pending")
        .sort((a, b) => b.createdAt - a.createdAt),
    [tasks]
  );

  useEffect(() => {
    if (isInboxOpen) seedFromRest();
  }, [isInboxOpen]);

  return (
    <div
      className={`fixed top-0 right-0 h-full w-[450px] bg-slate-950/95 backdrop-blur-md border-l border-neon-blue/30 shadow-[-10px_0_30px_rgba(0,240,255,0.1)] transition-transform duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] z-50 flex flex-col
        ${isInboxOpen ? "translate-x-0" : "translate-x-full"}
      `}
    >
      <div className="flex items-center justify-between p-4 border-b border-white/10">
        <div className="flex items-center gap-2 text-neon-blue">
          <ClipboardCheck className="w-4 h-4" />
          <h3 className="font-mono text-xs font-bold uppercase tracking-widest">
            Pending Tasks
          </h3>
          {pending.length > 0 && (
            <span className="px-1.5 py-0.5 bg-neon-pink/20 border border-neon-pink/40 rounded text-[9px] leading-none text-neon-pink font-bold">
              {pending.length}
            </span>
          )}
        </div>
        <button
          onClick={() => setInboxOpen(false)}
          className="text-slate-400 hover:text-white transition-colors cursor-pointer"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto custom-scrollbar p-4 space-y-3">
        {pending.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-slate-600 space-y-2">
            <ClipboardCheck className="w-6 h-6" />
            <p className="font-mono text-[10px] uppercase tracking-widest">
              No pending tasks
            </p>
          </div>
        ) : (
          pending.map((task) => <TaskCard key={task.id} task={task} />)
        )}
      </div>
    </div>
  );
}
