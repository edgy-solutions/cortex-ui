/**
 * HITL HumanTask queue store (Case 2 — workflow-ack).
 *
 * Holds the current user's pending HumanTasks. The ONLY feed is a snapshot of the per-viewer queue
 * (`GET /me/queue` with `GET /me/needs_you`, read together by `@/lib/humanTaskQueue` and applied by
 * `applyQueue`). There is no live writer: the direct read of the task table (an Electric shape) is gone,
 * so freshness is the sync's refresh, not a stream.
 *
 * The store also holds what the badge must show honestly: whether the first snapshot has landed
 * (`queueLoaded`), why the last refresh failed (`queueError`), the served per-kind counts
 * (`needsYou`), and a served delegation mark (`delegated`).
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
  /** Served on `/me/queue` rows. A row that does not carry it falls back to the `/task_kinds`
   *  registry (`fromKinds`) — the same declaration source either way. */
  declaration?: unknown;
}

/** The served counts: per kind in SERVED order, and the total (`GET /me/needs_you`). */
export interface NeedsYouCounts {
  counts: Record<string, number>;
  total: number;
}

/** A served delegation mark (`GET /me/queue` / `/me/needs_you` `delegated`). cortex never asks for one. */
export interface DelegationMarkView {
  delegated: boolean;
  delegator: string;
  delegate: string;
  expires_at: string;
  row_id: string;
  read_at: string;
}

/** One refresh's result: the list and the counts of the SAME moment. */
export interface QueueSnapshot {
  tasks: HumanTask[];
  needsYou: NeedsYouCounts;
  delegated: DelegationMarkView | null;
}

interface HumanTaskState {
  tasks: HumanTask[];

  /** Ticket counter, monotonic for the page's life: every snapshot request and every local write takes one. */
  seq: number;
  /** Row id → the `seq` of its last LOCAL write (`upsertTask`). */
  writtenAt: Record<string, number>;
  /** The ticket of the newest refresh whose outcome (snapshot OR failure) is applied. A refresh
   *  requested earlier that lands later is older than one already applied, and is ignored. */
  appliedSince: number;

  /** The first snapshot has applied. Until then nothing about the queue is known (not "empty"). */
  queueLoaded: boolean;
  /** Why the last refresh failed, or null. Rows are kept; the next success clears it. */
  queueError: string | null;
  /** The served counts of the last snapshot, or null before the first. */
  needsYou: NeedsYouCounts | null;
  /** The served delegation mark of the last snapshot, or null. */
  delegated: DelegationMarkView | null;

  /** A LOCAL write: this viewer's own resolution (`markTaskResolvedByTaskId`) and the ingest mock. */
  upsertTask: (task: HumanTask) => void;
  /** Call BEFORE requesting a snapshot; hand the result to `applyQueue` / `failQueue`. */
  beginSnapshot: () => number;
  // Reconcile the pending set, the counts and the delegation mark to ONE snapshot, in one write: the
  // list and the counts never come from different moments.
  //
  // THE SNAPSHOT IS AS OLD AS ITS REQUEST, NOT ITS RESPONSE. A task this viewer resolved locally after
  // `since` is newer than the snapshot, so the snapshot does not touch it; a task resolved before it
  // stays resolved (the server may still be listing it pending), as one row.
  applyQueue: (snapshot: QueueSnapshot, since: number) => void;
  /** A refresh requested at `since` failed: keep the rows, say why. An older failure is ignored. */
  failQueue: (message: string, since: number) => void;
  /** Session purge: drop every task, count and error, and refuse any snapshot requested before this
   *  call, so a previous owner's in-flight response cannot repopulate the store after the purge. */
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
  queueLoaded: false,
  queueError: null,
  needsYou: null,
  delegated: null,

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

  // A ticket of its own, so two refreshes requested with no write between them are still ordered.
  beginSnapshot: () => {
    const seq = get().seq + 1;
    set({ seq });
    return seq;
  },

  applyQueue: (snapshot, since) =>
    set((state) => {
      if (since < state.appliedSince) return {};
      const newer = (id: string) => (state.writtenAt[id] ?? -1) > since;
      // Kept: anything written locally after the request (its state is newer), and every resolved row.
      // A row is resolved here only after the server ACCEPTED the act (`markTaskResolvedByTaskId`), and
      // the read side can lag, so a snapshot still listing it pending is lagging, not contradicting.
      const kept = state.tasks.filter((t) => newer(t.id) || t.status !== "pending");
      const keptIds = new Set(kept.map((t) => t.id));
      return {
        tasks: [...kept, ...snapshot.tasks.filter((t) => !newer(t.id) && !keptIds.has(t.id))],
        needsYou: snapshot.needsYou,
        delegated: snapshot.delegated,
        queueLoaded: true,
        queueError: null,
        appliedSince: since,
      };
    }),

  failQueue: (message, since) =>
    set((state) => (since < state.appliedSince ? {} : { queueError: message, appliedSince: since })),

  reset: () =>
    set((state) => ({
      tasks: [],
      writtenAt: {},
      seq: state.seq + 1,
      appliedSince: state.seq + 1,
      queueLoaded: false,
      queueError: null,
      needsYou: null,
      delegated: null,
    })),
}));

/** Pending tasks only — the inbox view. Selector helper for components. */
export const selectPendingTasks = (s: HumanTaskState): HumanTask[] =>
  s.tasks.filter((t) => t.status === "pending");
