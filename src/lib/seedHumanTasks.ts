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
 * lacks an id/task_id, the same refusal this always applied, inline.
 *
 * `declaration` is carried ONLY when the row HAS the key (`"declaration" in t`) — a row that
 * never mentions it stays without the field, distinguishable from one that mentions it as
 * null/undefined. `ApprovalTaskCard`'s `readTaskDeclaration(task.declaration)` falls back to the
 * `/task_kinds` registry on anything it cannot read, so this distinction has nowhere else to go
 * once it is lost here.
 */
export function humanTaskFromRow(t: Record<string, unknown>): HumanTask | null {
  if (t.id == null || t.task_id == null) return null;
  const task: HumanTask = {
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
    payload: parseTaskPayload(t.payload),
    createdAt: Number(t.created_at ?? 0),
  };
  if ("declaration" in t) task.declaration = t.declaration;
  return task;
}
