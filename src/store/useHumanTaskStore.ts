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
  // Terminal statuses are PER SPECIES. A triage task is acknowledged/redriven, never
  // "approved"/"rejected" — the server refuses those verbs on it (422), and a projection that
  // coerced them would record a decision the task cannot represent. Only `pending` is
  // load-bearing for queue filtering, so the terminal vocabulary widens safely.
  status: "pending" | "approved" | "rejected" | "acknowledged" | "redriven" | "expired";
  title: string;
  summary: string;
  requestedBy: string;
  subjectRef: string | null;
  /** Clearance-safe task payload (identifiers + reason, never notice content). Carries the
   *  triage card's `warnings` / `reason_code` — the WHY that makes a refusal actionable. */
  payload?: Record<string, unknown> | null;
  createdAt: number;
  /** Served on `/me/human_tasks`; the Electric projection does not carry it, so a live upsert
   *  falls back to the `/task_kinds` registry (`fromKinds`) — which is the same declaration
   *  source either way. */
  declaration?: unknown;
}

interface HumanTaskState {
  tasks: HumanTask[];

  /** Count of LIVE writes (`upsertTask`/`removeTask`), monotonic for the page's life. */
  seq: number;
  /** Row id → the `seq` of its last live write. A removal is stamped too: that is what stops a
   *  snapshot from resurrecting it. */
  writtenAt: Record<string, number>;
  /** The `since` of the newest snapshot applied. A snapshot requested earlier that lands later is
   *  older than one already applied, and is ignored. */
  appliedSince: number;

  upsertTask: (task: HumanTask) => void;
  removeTask: (rowId: string) => void;
  /** Call BEFORE requesting the REST snapshot; hand the result to `replacePending`. */
  beginSnapshot: () => number;
  // Reconcile the pending set to the authoritative REST snapshot: replace all
  // PENDING rows with exactly `tasks`, so a task resolved out-of-band (by this
  // user's own act, or another approver, or a workflow that failed) drops even
  // when the Electric live-update didn't arrive.
  //
  // THE SNAPSHOT IS AS OLD AS ITS REQUEST, NOT ITS RESPONSE (10-28). The REST read and the
  // Electric stream start together, so a live write can land between the server reading the
  // snapshot and the browser receiving it. Replacing wholesale then did two wrong things: a task
  // Electric inserted in that window was dropped (and Electric never re-sends it), and a task
  // Electric deleted, or this user resolved, was put back as pending, with nothing left to remove
  // it. A row written live after `since` is newer than the snapshot, so the snapshot does not
  // touch it, in either direction.
  replacePending: (tasks: HumanTask[], since: number) => void;
  /** Session purge: drop every task, and refuse any snapshot requested before this call, so a
   *  previous owner's in-flight REST response cannot repopulate the store after the purge. */
  reset: () => void;
}

// NB: the old inbox-drawer state (isInboxOpen/selectedTaskId/acting +
// their setters) was removed with the drawer — tasks are timeline citizens
// acted on from their canvas cards (ApprovalTaskCard / GroupedReviewTable),
// each of which holds its own in-flight state locally. This store is now just
// the task set + its reconcilers.
export const useHumanTaskStore = create<HumanTaskState>((set, get) => ({
  tasks: [],
  seq: 0,
  writtenAt: {},
  appliedSince: 0,

  upsertTask: (task) =>
    set((state) => {
      const seq = state.seq + 1;
      const writtenAt = { ...state.writtenAt, [task.id]: seq };
      const idx = state.tasks.findIndex((t) => t.id === task.id);
      if (idx === -1) return { tasks: [...state.tasks, task], seq, writtenAt };
      const next = state.tasks.slice();
      next[idx] = task;
      return { tasks: next, seq, writtenAt };
    }),

  removeTask: (rowId) =>
    set((state) => {
      const seq = state.seq + 1;
      return {
        tasks: state.tasks.filter((t) => t.id !== rowId),
        seq,
        writtenAt: { ...state.writtenAt, [rowId]: seq },
      };
    }),

  beginSnapshot: () => get().seq,

  replacePending: (snapshot, since) =>
    set((state) => {
      if (since < state.appliedSince) return {};
      const newer = (id: string) => (state.writtenAt[id] ?? -1) > since;
      // Kept: anything written live after the request (its state, or its absence, is newer), and
      // every resolved row. A row is resolved here only after the server ACCEPTED the act
      // (`markTaskResolvedByTaskId`), and the projection catches up asynchronously, so a snapshot
      // still listing it pending is lagging, not contradicting. Before 10-28 that case kept BOTH
      // rows, one resolved and one pending, under one id.
      const kept = state.tasks.filter((t) => newer(t.id) || t.status !== "pending");
      const keptIds = new Set(kept.map((t) => t.id));
      return {
        tasks: [...kept, ...snapshot.filter((t) => !newer(t.id) && !keptIds.has(t.id))],
        appliedSince: since,
      };
    }),

  reset: () =>
    set((state) => ({ tasks: [], writtenAt: {}, seq: state.seq + 1, appliedSince: state.seq + 1 })),
}));

/** Pending tasks only — the inbox view. Selector helper for components. */
export const selectPendingTasks = (s: HumanTaskState): HumanTask[] =>
  s.tasks.filter((t) => t.status === "pending");
