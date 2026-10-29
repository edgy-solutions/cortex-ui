/**
 * THE REST SNAPSHOT AND THE LIVE FEED OVERLAP; THE SNAPSHOT IS AS OLD AS ITS REQUEST (10-28).
 *
 * `seedFromRest` and the Electric task stream start together. A live write can land after the
 * server read the snapshot and before the browser received it. `replacePending` used to replace
 * wholesale, which dropped a task inserted in that window and resurrected one deleted or resolved
 * in it. Directive, 10-28: "cortex: fix the REST/feed overlap race you found regardless; it's real."
 *
 * Both paths are the shipping code: `seedFromRest` with the fetch deferred, and
 * `startHumanTasksSubscription` with `ShapeStream` replaced by a stub that hands its subscriber
 * the messages each arm pushes.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import type { Message, Row } from "@electric-sql/client";

const shape = vi.hoisted(() => ({ push: (_m: unknown[]) => {} }));
vi.mock("@electric-sql/client", () => ({
  ShapeStream: class {
    subscribe(cb: (m: unknown[]) => void) {
      shape.push = cb;
      return () => {};
    }
  },
}));
const rest = vi.hoisted(() => ({ fetchMyHumanTasks: vi.fn() }));
vi.mock("@/api/client", () => rest);

import { seedFromRest } from "./seedHumanTasks";
import { startHumanTasksSubscription } from "./electricHumanTasks";
import { markTaskResolvedByTaskId } from "./useTaskArtifactSync";
import { useHumanTaskStore } from "@/store/useHumanTaskStore";
import { purgeUserScopedState } from "./sessionIsolation";

const row = (id: string, title = `title ${id}`): Row => ({
  id, task_id: `t-${id}`, workflow_id: null, audience: "a:B", kind: "workflow_ack",
  status: "pending", title, summary: "", requested_by: "", subject_ref: null, payload: null,
  created_at: "1",
});
const live = (op: "insert" | "update" | "delete", r: Row) =>
  shape.push([{ headers: { operation: op }, value: r } as unknown as Message]);

/** Start a seed whose response is held until `land(rows)` is called. */
const seed = () => {
  let land!: (rows: Row[]) => Promise<void>;
  rest.fetchMyHumanTasks.mockImplementationOnce(
    () => new Promise((resolve) => {
      land = async (rows) => { resolve({ tasks: rows }); await new Promise((r) => setTimeout(r, 0)); };
    }),
  );
  seedFromRest();
  return (rows: Row[]) => land(rows);
};

const view = () =>
  useHumanTaskStore.getState().tasks.map((t) => `${t.id}:${t.status}:${t.title}`).sort();

beforeEach(() => {
  useHumanTaskStore.getState().reset();
  rest.fetchMyHumanTasks.mockReset();
  startHumanTasksSubscription("token");
});

describe("a live write inside the snapshot's window is newer than the snapshot", () => {
  it("a task the feed INSERTS after the request survives a snapshot that lacks it", async () => {
    const land = seed();
    live("insert", row("new"));
    await land([]);
    expect(view()).toEqual(["new:pending:title new"]);
  });

  it("a task the feed DELETES after the request is not resurrected by a snapshot that has it", async () => {
    live("insert", row("gone"));
    const land = seed();
    live("delete", row("gone"));
    await land([row("gone")]);
    expect(view()).toEqual([]);
  });

  it("a task this user RESOLVES after the request stays resolved, as one row", async () => {
    live("insert", row("mine"));
    const land = seed();
    markTaskResolvedByTaskId("t-mine");
    await land([row("mine")]);
    expect(view()).toEqual(["mine:approved:title mine"]);
  });

  it("a task the feed UPDATES after the request keeps the live version, as one row", async () => {
    live("insert", row("upd", "old"));
    const land = seed();
    live("update", row("upd", "newer"));
    await land([row("upd", "old")]);
    expect(view()).toEqual(["upd:pending:newer"]);
  });
});

describe("the snapshot still reconciles everything it is newer than (the near side)", () => {
  it("a pending task not written since the request, and absent from the snapshot, is dropped", async () => {
    live("insert", row("stale"));
    const land = seed();
    await land([]);
    expect(view()).toEqual([]);
  });

  it("a task written live BEFORE the request is overruled by the snapshot", async () => {
    live("insert", row("x", "live title"));
    const land = seed();
    await land([row("x", "snapshot title")]);
    expect(view()).toEqual(["x:pending:snapshot title"]);
  });

  it("a task resolved BEFORE the request, still pending in a lagging snapshot, stays resolved as one row", async () => {
    // The act was accepted; the projection has not caught up. The old reconcile kept both rows.
    live("insert", row("acted"));
    markTaskResolvedByTaskId("t-acted");
    const land = seed();
    await land([row("acted")]);
    expect(view()).toEqual(["acted:approved:title acted"]);
  });
});

describe("snapshots are ordered by their requests", () => {
  it("an older snapshot that lands after a newer one is ignored", async () => {
    const landOld = seed();
    live("insert", row("between"));
    const landNew = seed();
    await landNew([row("between"), row("fresh")]);
    await landOld([row("ancient")]);
    expect(view()).toEqual(["between:pending:title between", "fresh:pending:title fresh"]);
  });

  it("a snapshot requested before the session purge cannot repopulate the store after it", async () => {
    const land = seed();
    purgeUserScopedState();
    await land([row("previous-owner")]);
    expect(view()).toEqual([]);
  });
});
