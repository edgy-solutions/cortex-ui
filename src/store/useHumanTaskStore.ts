/**
 * HITL HumanTask queue store (Case 2 — workflow-ack).
 *
 * Holds the current user's pending HumanTasks, fed in real time by the
 * Electric subscription in `@/lib/electricHumanTasks` (which subscribes to the
 * `human_task_projection` shape through cortex-bff's `/electric/shape` proxy —
 * the proxy server-injects `recipient_id = <verified caller authz_id>`, so the
 * browser only ever RECEIVES this user's tasks; the queue's per-user isolation
 * is enforced at the replication layer, not by client filtering).
 *
 * Mirrors the useCanvasStore upsert idiom: the subscription upserts rows; the
 * UI reads. A resolved task arrives as an `update` (status: pending -> approved
 * /rejected) and drops out of the pending view.
 */
import { create } from "zustand";

export interface HumanTask {
  id: string; // per-recipient projection row id
  taskId: string; // logical task id (Restate UserTask key)
  workflowId: string | null;
  audience: string; // e.g. "promotion:DATA_ENGINEERING"
  kind: string; // "workflow_ack" | "access_request"
  status: "pending" | "approved" | "rejected" | "expired";
  title: string;
  summary: string;
  requestedBy: string;
  subjectRef: string | null;
  createdAt: number;
}

interface HumanTaskState {
  tasks: HumanTask[];

  upsertTask: (task: HumanTask) => void;
  removeTask: (rowId: string) => void;
  // Reconcile the pending set to the authoritative REST snapshot: replace all
  // PENDING rows with exactly `tasks`, so a task resolved out-of-band (by this
  // user's own act, or another approver, or a workflow that failed) drops even
  // when the Electric live-update didn't arrive. Non-pending rows are dropped.
  replacePending: (tasks: HumanTask[]) => void;
}

// NB: the old inbox-drawer state (isInboxOpen/selectedTaskId/acting +
// their setters) was removed with the drawer — tasks are timeline citizens
// acted on from their canvas cards (ApprovalTaskCard / GroupedReviewTable),
// each of which holds its own in-flight state locally. This store is now just
// the task set + its reconcilers.
export const useHumanTaskStore = create<HumanTaskState>((set) => ({
  tasks: [],

  upsertTask: (task) =>
    set((state) => {
      const idx = state.tasks.findIndex((t) => t.id === task.id);
      if (idx === -1) return { tasks: [...state.tasks, task] };
      const next = state.tasks.slice();
      next[idx] = task;
      return { tasks: next };
    }),

  removeTask: (rowId) =>
    set((state) => ({ tasks: state.tasks.filter((t) => t.id !== rowId) })),

  replacePending: (tasks) =>
    set((state) => ({
      // keep any non-pending rows we happen to hold (harmless — the UI filters
      // to pending), replace the pending set with the authoritative snapshot.
      tasks: [...state.tasks.filter((t) => t.status !== "pending"), ...tasks],
    })),
}));

/** Pending tasks only — the inbox view. Selector helper for components. */
export const selectPendingTasks = (s: HumanTaskState): HumanTask[] =>
  s.tasks.filter((t) => t.status === "pending");
