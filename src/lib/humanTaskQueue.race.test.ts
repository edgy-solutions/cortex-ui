/**
 * THE QUEUE SNAPSHOT IS AS OLD AS ITS REQUEST; THE LIST AND THE COUNTS ARRIVE TOGETHER (0.4.89).
 *
 * Successor of `seedHumanTasks.race.test.ts`, which sealed the overlap of the REST seed with the Electric task
 * stream. The stream is gone (tasks come only from `/me/queue` and `/me/needs_you`), so the arms that needed a
 * feed-writer (a feed INSERT / DELETE / UPDATE inside the snapshot window) cannot be stated; the arms that were
 * about the SNAPSHOT survive, with the one remaining writer, a LOCAL write (`upsertTask`: this viewer's own
 * resolution, the ingest mock). Both paths are the shipping code: `createQueueRefresher` over the client
 * functions, with the two fetches deferred.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";

const wire = vi.hoisted(() => ({ fetchMyQueue: vi.fn(), fetchNeedsYou: vi.fn() }));
vi.mock("@/api/client", () => wire);

import { createQueueRefresher } from "./humanTaskQueue";
import { markTaskResolvedByTaskId } from "./useTaskArtifactSync";
import { useHumanTaskStore } from "@/store/useHumanTaskStore";
import { purgeUserScopedState } from "./sessionIsolation";

const row = (id: string, title = `title ${id}`) => ({
  id, task_id: `t-${id}`, workflow_id: null, audience: "a:B", kind: "workflow_ack",
  status: "pending", title, summary: "", requested_by: "", subject_ref: null, payload: null,
  created_at: 1,
});
type Row = ReturnType<typeof row>;

interface Held {
  land: (rows: Row[], total?: number) => Promise<void>;
  queue: (rows: unknown) => void;
  needs: (total: number) => void;
  settled: Promise<void>;
}
/** Start a refresh whose two replies are held until the arm releases them. */
const refreshHeld = (r?: ReturnType<typeof createQueueRefresher>, opts?: { force?: boolean }): Held => {
  const target = r ?? refresher;
  let resolveQ!: (v: unknown) => void;
  let resolveN!: (v: unknown) => void;
  wire.fetchMyQueue.mockImplementationOnce(() => new Promise((res) => { resolveQ = res; }));
  wire.fetchNeedsYou.mockImplementationOnce(() => new Promise((res) => { resolveN = res; }));
  const settled = target.refresh(opts);
  return {
    queue: (rows) => resolveQ(Array.isArray(rows) ? { tasks: rows, email: null, delegated: null } : rows),
    needs: (total) => resolveN({ counts: { workflow_ack: total }, total, email: null, delegated: null }),
    land: async (rows, total) => {
      resolveQ({ tasks: rows, email: null, delegated: null });
      resolveN({ counts: { workflow_ack: total ?? rows.length }, total: total ?? rows.length, email: null, delegated: null });
      await settled;
    },
    settled,
  };
};

const view = () =>
  useHumanTaskStore.getState().tasks.map((t) => `${t.id}:${t.status}:${t.title}`).sort();
const total = () => useHumanTaskStore.getState().needsYou?.total ?? null;
const tick = () => new Promise((r) => setTimeout(r, 0));
const rowTask = (id: string, title = `title ${id}`) => ({
  id, taskId: `t-${id}`, workflowId: null, audience: "a:B", kind: "workflow_ack",
  status: "pending" as const, title, summary: "", requestedBy: "", subjectRef: null, payload: null, createdAt: 1,
});

let refresher: ReturnType<typeof createQueueRefresher>;
beforeEach(() => {
  useHumanTaskStore.getState().reset();
  wire.fetchMyQueue.mockReset();
  wire.fetchNeedsYou.mockReset();
  refresher = createQueueRefresher();
});

describe("Q6: a refresh requested later always wins over an earlier one that lands later", () => {
  it("two refreshes, the earlier lands LAST: the later's rows and counts stand", async () => {
    const early = refreshHeld();
    const late = refreshHeld(refresher, { force: true });
    await late.land([row("fresh")], 7);
    await early.land([row("ancient")], 99);
    expect(view()).toEqual(["fresh:pending:title fresh"]);
    expect(total()).toBe(7);
  });

  it("with NO write between the two requests (the tickets are still ordered)", async () => {
    const a = refreshHeld();
    const b = refreshHeld(refresher, { force: true });
    await b.land([row("b")]);
    await a.land([row("a")]);
    expect(view()).toEqual(["b:pending:title b"]);
  });

  it("an older FAILURE landing after a newer success does not set an error", async () => {
    const early = refreshHeld();
    const late = refreshHeld(refresher, { force: true });
    await late.land([row("ok")]);
    early.queue("not an object");
    early.needs(0);
    await early.settled;
    expect(useHumanTaskStore.getState().queueError).toBeNull();
    expect(view()).toEqual(["ok:pending:title ok"]);
  });

  it("a refresh in flight is JOINED unless forced: one pair of requests", async () => {
    const first = refreshHeld();
    const joined = refresher.refresh();
    expect(wire.fetchMyQueue).toHaveBeenCalledTimes(1);
    expect(wire.fetchNeedsYou).toHaveBeenCalledTimes(1);
    await first.land([row("x")]);
    await joined;
    expect(view()).toEqual(["x:pending:title x"]);
  });
});

describe("Q7: the list and the counts are applied together", () => {
  it("a queue reply that resolves while needs_you is pending changes nothing yet", async () => {
    const h = refreshHeld();
    h.queue([row("a"), row("b")]);
    await tick();
    expect(view()).toEqual([]);
    expect(total()).toBeNull();
    expect(useHumanTaskStore.getState().queueLoaded).toBe(false);
    h.needs(5);
    await h.settled;
    expect(view()).toHaveLength(2);
    expect(total()).toBe(5);
    expect(useHumanTaskStore.getState().queueLoaded).toBe(true);
  });

  it("and the other order: needs_you first changes nothing either", async () => {
    const h = refreshHeld();
    h.needs(5);
    await tick();
    expect(total()).toBeNull();
    h.queue([row("a")]);
    await h.settled;
    expect(total()).toBe(5);
    expect(view()).toHaveLength(1);
  });
});

describe("Q8 / Q9 / Q12 (store side): a refusal is kept visible, never an empty queue", () => {
  it("Q9: before the first snapshot nothing is loaded and there are no counts", () => {
    const s = useHumanTaskStore.getState();
    expect(s.queueLoaded).toBe(false);
    expect(s.needsYou).toBeNull();
    expect(s.queueError).toBeNull();
  });

  it("Q8: 503 authorization_unavailable after a good snapshot keeps the rows and names the message; the next success clears it", async () => {
    await refreshHeld().land([row("kept")], 1);
    wire.fetchMyQueue.mockRejectedValueOnce(Object.assign(new Error("Request failed with status code 503"), {
      response: { status: 503, data: { detail: { error: "authorization_unavailable", message: "the authorizer cannot be asked" } } },
    }));
    wire.fetchNeedsYou.mockResolvedValueOnce({ counts: {}, total: 0 });
    await refresher.refresh();
    const s = useHumanTaskStore.getState();
    expect(s.queueError).toBe("the authorizer cannot be asked");
    expect(view()).toEqual(["kept:pending:title kept"]);
    expect(s.needsYou?.total).toBe(1);
    expect(s.queueLoaded).toBe(true);
    await refreshHeld().land([row("kept")], 1);
    expect(useHumanTaskStore.getState().queueError).toBeNull();
  });

  it("Q8: a failure before the first snapshot leaves queueLoaded false and carries the error", async () => {
    wire.fetchMyQueue.mockRejectedValueOnce(new Error("boom"));
    wire.fetchNeedsYou.mockResolvedValueOnce({ counts: {}, total: 0 });
    await refresher.refresh();
    const s = useHumanTaskStore.getState();
    expect(s.queueLoaded).toBe(false);
    expect(s.queueError).toBe("boom");
  });

  const malformed: Array<[string, unknown, unknown]> = [
    ["tasks is not an array", { tasks: {} }, { counts: { k: 1 }, total: 1 }],
    ["tasks is missing", { email: null }, { counts: { k: 1 }, total: 1 }],
    ["counts is not an object of integers", { tasks: [] }, { counts: { k: "1" }, total: 1 }],
    ["counts holds a fraction", { tasks: [] }, { counts: { k: 1.5 }, total: 1 }],
    ["counts is an array", { tasks: [] }, { counts: [1], total: 1 }],
    ["total is missing", { tasks: [] }, { counts: { k: 1 } }],
    ["the queue reply is not an object", "nope", { counts: {}, total: 0 }],
    // task_id and kind are REQUIRED (saf 2026-11-15, Chris 2026-11-16). Before, such a row was dropped
    // silently, and needs_you counted a task the list never showed.
    ["a row's task_id is null", { tasks: [row("a"), { ...row("b"), task_id: null }] }, { counts: { k: 2 }, total: 2 }],
    ["a row has no kind", { tasks: [{ ...row("b"), kind: undefined }] }, { counts: { k: 1 }, total: 1 }],
  ];
  for (const [name, q, n] of malformed) {
    it(`Q12: ${name}: an error state, rows kept, never an empty queue`, async () => {
      await refreshHeld().land([row("kept")], 1);
      wire.fetchMyQueue.mockResolvedValueOnce(q);
      wire.fetchNeedsYou.mockResolvedValueOnce(n);
      await refresher.refresh();
      const s = useHumanTaskStore.getState();
      expect(s.queueError, name).not.toBeNull();
      expect(view(), name).toEqual(["kept:pending:title kept"]);
      expect(s.needsYou?.total, name).toBe(1);
    });
  }

  it("Q12: a row without task_id is named in the error, by position and key, not skipped", async () => {
    wire.fetchMyQueue.mockResolvedValueOnce({ tasks: [row("a"), { ...row("b"), task_id: null, kind: "" }] });
    wire.fetchNeedsYou.mockResolvedValueOnce({ counts: { k: 2 }, total: 2 });
    await refresher.refresh();
    const s = useHumanTaskStore.getState();
    expect(String(s.queueError)).toContain("task row 1 has no task_id, kind");
    expect(s.queueLoaded).toBe(false);
  });

  it("Q12: a malformed FIRST reply is not an empty loaded queue", async () => {
    wire.fetchMyQueue.mockResolvedValueOnce({ tasks: "x" });
    wire.fetchNeedsYou.mockResolvedValueOnce({ counts: {}, total: 0 });
    await refresher.refresh();
    expect(useHumanTaskStore.getState().queueLoaded).toBe(false);
    expect(useHumanTaskStore.getState().queueError).not.toBeNull();
  });

  it("an undeclared key on either reply is tolerated", async () => {
    wire.fetchMyQueue.mockResolvedValueOnce({ tasks: [row("a")], email: "x", surprise: 1 });
    wire.fetchNeedsYou.mockResolvedValueOnce({ counts: { k: 1 }, total: 1, extra: [] });
    await refresher.refresh();
    expect(useHumanTaskStore.getState().queueError).toBeNull();
    expect(view()).toHaveLength(1);
  });
});

describe("Q13: a task this viewer resolved locally stays suppressed against an earlier-requested snapshot", () => {
  it("a task this user RESOLVES after the request stays resolved, as one row", async () => {
    await refreshHeld().land([row("mine")]);
    const h = refreshHeld(refresher, { force: true });
    markTaskResolvedByTaskId("t-mine");
    await h.land([row("mine")]);
    expect(view()).toEqual(["mine:approved:title mine"]);
  });

  it("a task resolved BEFORE the request, still pending in a lagging snapshot, stays resolved as one row", async () => {
    // The act was accepted; the read side has not caught up. The old reconcile kept both rows.
    await refreshHeld().land([row("acted")]);
    markTaskResolvedByTaskId("t-acted");
    await refreshHeld(refresher, { force: true }).land([row("acted")]);
    expect(view()).toEqual(["acted:approved:title acted"]);
  });
});

describe("a LOCAL write inside the snapshot's window is newer than the snapshot (was: a feed write)", () => {
  it("a task written locally after the request survives a snapshot that lacks it", async () => {
    const h = refreshHeld();
    useHumanTaskStore.getState().upsertTask(rowTask("new"));
    await h.land([]);
    expect(view()).toEqual(["new:pending:title new"]);
  });

  it("a task updated locally after the request keeps the local version, as one row", async () => {
    useHumanTaskStore.getState().upsertTask(rowTask("upd", "old"));
    const h = refreshHeld();
    useHumanTaskStore.getState().upsertTask(rowTask("upd", "newer"));
    await h.land([row("upd", "old")]);
    expect(view()).toEqual(["upd:pending:newer"]);
  });
});

describe("the snapshot still reconciles everything it is newer than (the near side)", () => {
  it("a pending task not written since the request, and absent from the snapshot, is dropped", async () => {
    useHumanTaskStore.getState().upsertTask(rowTask("stale"));
    await refreshHeld().land([]);
    expect(view()).toEqual([]);
  });

  it("a task written locally BEFORE the request is overruled by the snapshot", async () => {
    useHumanTaskStore.getState().upsertTask(rowTask("x", "local title"));
    await refreshHeld().land([row("x", "snapshot title")]);
    expect(view()).toEqual(["x:pending:snapshot title"]);
  });
});

describe("Q14: the session purge", () => {
  it("clears rows, counts, error and queueLoaded", async () => {
    await refreshHeld().land([row("a")], 3);
    wire.fetchMyQueue.mockRejectedValueOnce(new Error("later failure"));
    wire.fetchNeedsYou.mockResolvedValueOnce({ counts: {}, total: 0 });
    await refresher.refresh();
    expect(useHumanTaskStore.getState().queueError).not.toBeNull();
    purgeUserScopedState();
    const s = useHumanTaskStore.getState();
    expect(s.tasks).toEqual([]);
    expect(s.needsYou).toBeNull();
    expect(s.delegated).toBeNull();
    expect(s.queueError).toBeNull();
    expect(s.queueLoaded).toBe(false);
  });

  it("a snapshot requested before the purge cannot repopulate the store after it", async () => {
    const h = refreshHeld();
    purgeUserScopedState();
    await h.land([row("previous-owner")], 4);
    expect(view()).toEqual([]);
    expect(useHumanTaskStore.getState().needsYou).toBeNull();
    expect(useHumanTaskStore.getState().queueLoaded).toBe(false);
  });

  it("a failure requested before the purge cannot set an error after it", async () => {
    wire.fetchMyQueue.mockImplementationOnce(() => new Promise((_, rej) => setTimeout(() => rej(new Error("late")), 0)));
    wire.fetchNeedsYou.mockResolvedValueOnce({ counts: {}, total: 0 });
    const p = refresher.refresh();
    purgeUserScopedState();
    await p;
    expect(useHumanTaskStore.getState().queueError).toBeNull();
  });
});
