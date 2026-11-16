/**
 * The per-row mapping from a served `/me/queue` task row to a `HumanTask`. The queue read
 * (`@/lib/humanTaskQueue`) is the only production caller; it is exported so a seal can call the SAME
 * function rather than hand-build a row. (This file once also held the REST seed of the old direct read,
 * which is gone: tasks come only from the per-viewer queue.)
 */
import { type HumanTask } from "@/store/useHumanTaskStore";
import { parseTaskPayload } from "@/lib/taskPayload";

/**
 * The per-row mapping from a raw `/me/queue` task row to a `HumanTask`. `null` where the row
 * lacks an id, or lacks a `task_id` or `kind` that is a non-empty string.
 *
 * TASK_ID AND KIND ARE REQUIRED (saf, 2026-11-15; Chris, 2026-11-16: "Tighten task_id to required, per
 * saf"). Both are NOT NULL in the store (invincible-agent `sql/create_human_task_projection.sql:43`,
 * `src/iagent/human_tasks.py:70`); only the response model types them `str | None`. So a row
 * without one is a malformed reply, not a row to skip, and the queue read throws on it
 * (`missingRequired`). `kind` used to fall back to a hard-coded "workflow_ack", which named a case
 * in code and filed an unknown task under that kind. The fallback is gone.
 *
 * `declaration` is carried ONLY when the row HAS the key (`"declaration" in t`) — a row that
 * never mentions it stays without the field, distinguishable from one that mentions it as
 * null/undefined. `ApprovalTaskCard`'s `readTaskDeclaration(task.declaration)` falls back to the
 * `/task_kinds` registry on anything it cannot read, so this distinction has nowhere else to go
 * once it is lost here.
 */
/** The required keys a `/me/queue` row lacks, in a fixed order; empty when the row has them all. */
export function missingRequired(t: Record<string, unknown>): string[] {
  const missing: string[] = [];
  if (t.id == null) missing.push("id");
  for (const k of ["task_id", "kind"] as const) {
    if (typeof t[k] !== "string" || t[k] === "") missing.push(k);
  }
  return missing;
}

export function humanTaskFromRow(t: Record<string, unknown>): HumanTask | null {
  if (missingRequired(t).length > 0) return null;
  const task: HumanTask = {
    id: String(t.id),
    taskId: t.task_id as string,
    workflowId: (t.workflow_id as string | null) ?? null,
    audience: String(t.audience ?? ""),
    kind: t.kind as string,
    status: (t.status as HumanTask["status"]) ?? "pending",
    title: String(t.title ?? ""),
    summary: String(t.summary ?? ""),
    requestedBy: String(t.requested_by ?? ""),
    subjectRef: (t.subject_ref as string | null) ?? null,
    payload: parseTaskPayload(t.payload),
    createdAt: Number(t.created_at ?? 0),
  };
  if ("declaration" in t) task.declaration = t.declaration;
  return task;
}
