/**
 * HITL Slice 2 — Electric subscription for the `human_task_projection` shape.
 *
 * Mirrors `@/lib/electric` (the answer-artifact subscription): connects to
 * cortex-bff's `/electric/shape` proxy (NOT Electric directly), which
 * server-injects the WHERE clause from the verified JWT. For this table the
 * proxy injects `recipient_id = <verified caller authz_id>` — so the browser
 * subscription only ever RECEIVES this user's tasks. The per-user isolation of
 * the queue is enforced at the REPLICATION layer here, deriving from the SAME
 * Topaz decision that materialized the rows (see cortex-bff human_tasks.py);
 * there is no client-side filtering to trust.
 *
 * Requires a Bearer token; skips when absent (App.tsx re-invokes on auth).
 */
import { ShapeStream, type Row, type Message } from "@electric-sql/client";
import { config } from "@/config";
import {
  useHumanTaskStore,
  type HumanTask,
} from "@/store/useHumanTaskStore";

/**
 * Convert an Electric row (snake_case, bigint-as-string) into a HumanTask.
 * Per [[verify-subtle-acceptance-by-inspection]] the conversion is the
 * load-bearing piece — fail loudly on a missing required field rather than
 * silently substituting.
 */
function rowToHumanTask(row: Row): HumanTask {
  const parseBigInt = (v: unknown): number => {
    if (v == null) return 0;
    if (typeof v === "number") return v;
    if (typeof v === "bigint") return Number(v);
    if (typeof v === "string") return Number(v);
    throw new Error(`Unexpected bigint shape: ${typeof v}`);
  };
  if (row.id == null) throw new Error("Electric human_task row missing required id");
  if (row.task_id == null) throw new Error("Electric human_task row missing required task_id");
  if (row.status == null) throw new Error("Electric human_task row missing required status");
  return {
    id: row.id as string,
    taskId: row.task_id as string,
    workflowId: (row.workflow_id as string | null) ?? null,
    audience: (row.audience as string) ?? "",
    kind: (row.kind as string) ?? "workflow_ack",
    status: row.status as HumanTask["status"],
    title: (row.title as string) ?? "",
    summary: (row.summary as string) ?? "",
    requestedBy: (row.requested_by as string) ?? "",
    subjectRef: (row.subject_ref as string | null) ?? null,
    createdAt: parseBigInt(row.created_at),
  };
}

export function startHumanTasksSubscription(token: string | null): () => void {
  if (!token) {
    console.info("[electric-tasks] no token yet; subscription deferred");
    return () => {};
  }
  const base = config.VITE_API_URL;
  if (!base) {
    console.info("[electric-tasks] VITE_API_URL empty; subscription skipped");
    return () => {};
  }
  const stream = new ShapeStream({
    url: `${base}/electric/shape`,
    headers: { Authorization: `Bearer ${token}` },
    params: { table: "human_task_projection" },
  });
  const unsubscribe = stream.subscribe(
    (messages: Message[]) => {
      for (const msg of messages) {
        if (!("headers" in msg)) continue;
        const op = (msg.headers as Record<string, unknown>).operation;
        if (op === "insert" || op === "update") {
          const row = (msg as { value: Row }).value;
          try {
            useHumanTaskStore.getState().upsertTask(rowToHumanTask(row));
          } catch (err) {
            console.error("[electric-tasks] row conversion failed", err, row);
          }
        } else if (op === "delete") {
          const row = (msg as { value: Row }).value;
          if (row?.id != null) {
            useHumanTaskStore.getState().removeTask(row.id as string);
          }
        }
      }
    },
    (err: Error) => {
      // Per [[feedback-trailing-steps-nonfatal]]: an Electric outage must not
      // break the session — the inbox stops updating live but the rest works.
      console.error("[electric-tasks] subscription error", err);
    }
  );
  return () => {
    unsubscribe();
  };
}
