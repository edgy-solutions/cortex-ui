/**
 * The task queue's read side: the ONLY place cortex reads tasks. One refresh is
 * `Promise.all([GET /me/queue, GET /me/needs_you])`, parsed and applied TOGETHER, so the list and the counts
 * never come from different moments. Freshness is polled (there is no stream): at mount, on a timer, after
 * the viewer's own act, and when the tab becomes visible again after a while (`useHumanTaskSync`).
 */
import { fetchMyQueue, fetchNeedsYou } from "@/api/client";
import {
  useHumanTaskStore,
  type DelegationMarkView,
  type HumanTask,
  type NeedsYouCounts,
  type QueueSnapshot,
} from "@/store/useHumanTaskStore";
import { humanTaskFromRow } from "@/lib/seedHumanTasks";

/** How stale the queue may get while the tab is open and nothing else triggered a read: long enough that a
 *  session costs two light requests per 20s, short enough that another approver's decision shows soon. */
export const QUEUE_REFRESH_MS = 20_000;

const isRec = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

/** A reply that is not the declared shape. Thrown, so it surfaces as the queue error; never an empty queue. */
export class MalformedQueueReply extends Error {}

/** `GET /me/queue` → the viewer's tasks. An undeclared key is tolerated; a `tasks` that is not an array is not. */
export function parseQueueListing(resp: unknown): { tasks: HumanTask[]; delegated: DelegationMarkView | null } {
  if (!isRec(resp) || !Array.isArray(resp.tasks)) {
    throw new MalformedQueueReply("/me/queue: `tasks` is not an array");
  }
  const tasks: HumanTask[] = [];
  for (const row of resp.tasks as unknown[]) {
    if (!isRec(row)) throw new MalformedQueueReply("/me/queue: a task row is not an object");
    const task = humanTaskFromRow(row);
    if (task) tasks.push(task);
  }
  return { tasks, delegated: parseDelegated(resp.delegated, "/me/queue") };
}

/** `GET /me/needs_you` → counts per kind (served order) and the total. Missing `total`, or `counts` that is
 *  not an object of integers, is malformed. */
export function parseNeedsYou(resp: unknown): { needsYou: NeedsYouCounts; delegated: DelegationMarkView | null } {
  if (!isRec(resp)) throw new MalformedQueueReply("/me/needs_you: the reply is not an object");
  const { counts, total } = resp;
  if (!isRec(counts) || !Object.values(counts).every((n) => Number.isInteger(n))) {
    throw new MalformedQueueReply("/me/needs_you: `counts` is not an object of integers");
  }
  if (!Number.isInteger(total)) throw new MalformedQueueReply("/me/needs_you: `total` is missing or not an integer");
  return {
    needsYou: { counts: { ...(counts as Record<string, number>) }, total: total as number },
    delegated: parseDelegated(resp.delegated, "/me/needs_you"),
  };
}

function parseDelegated(v: unknown, route: string): DelegationMarkView | null {
  if (v == null) return null;
  if (!isRec(v)) throw new MalformedQueueReply(`${route}: \`delegated\` is not an object`);
  return {
    delegated: v.delegated === true,
    delegator: String(v.delegator ?? ""),
    delegate: String(v.delegate ?? ""),
    expires_at: String(v.expires_at ?? ""),
    row_id: String(v.row_id ?? ""),
    read_at: String(v.read_at ?? ""),
  };
}

/** The server's own words for a refusal (`detail.message`, a string `detail`, `detail.error`), else the error text. */
export function queueErrorText(err: unknown): string {
  const detail = isRec(err) && isRec(err.response) && isRec(err.response.data) ? err.response.data.detail : undefined;
  if (typeof detail === "string" && detail.trim() !== "") return detail;
  if (isRec(detail)) {
    if (typeof detail.message === "string" && detail.message.trim() !== "") return detail.message;
    if (typeof detail.error === "string" && detail.error.trim() !== "") return detail.error;
  }
  return err instanceof Error && err.message ? err.message : String(err);
}

export interface QueueRefresher {
  /** One refresh. Not forced: a refresh in flight is JOINED. Forced: a new request that supersedes it. */
  refresh: (opts?: { force?: boolean }) => Promise<void>;
  /** When the last refresh was STARTED (ms since epoch), or -Infinity. */
  lastStartedAt: () => number;
  /** Unmount / token loss: nothing in flight may land after this. */
  dispose: () => void;
}

export function createQueueRefresher(): QueueRefresher {
  let disposed = false;
  let inflight: Promise<void> | null = null;
  let startedAt = -Infinity;

  const refresh = (opts?: { force?: boolean }): Promise<void> => {
    if (disposed) return Promise.resolve();
    // A forced refresh (after the viewer's own act) must not join one that began BEFORE the act: it would
    // hand back the pre-act queue. The store's tickets make the newer request win whichever lands last.
    if (inflight && !opts?.force) return inflight;
    startedAt = Date.now();
    // Taken BEFORE the requests: the snapshot is as old as its request.
    const since = useHumanTaskStore.getState().beginSnapshot();
    const p: Promise<void> = Promise.all([fetchMyQueue(), fetchNeedsYou()])
      .then(([q, n]) => {
        const list = parseQueueListing(q);
        const counts = parseNeedsYou(n);
        const snapshot: QueueSnapshot = {
          tasks: list.tasks,
          needsYou: counts.needsYou,
          delegated: list.delegated ?? counts.delegated,
        };
        if (!disposed) useHumanTaskStore.getState().applyQueue(snapshot, since);
      })
      .catch((err) => {
        if (disposed) return;
        const message = queueErrorText(err);
        console.warn("[hitl] queue refresh failed", err);
        useHumanTaskStore.getState().failQueue(message, since);
      })
      .finally(() => {
        if (inflight === p) inflight = null;
      });
    inflight = p;
    return p;
  };

  return {
    refresh,
    lastStartedAt: () => startedAt,
    dispose: () => {
      disposed = true;
      inflight = null;
    },
  };
}
