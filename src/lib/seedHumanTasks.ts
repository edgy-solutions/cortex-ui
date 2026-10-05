/**
 * Reconcile the pending HumanTask set from the authoritative REST snapshot
 * (/me/human_tasks returns only PENDING rows, filtered by the caller's authz_id).
 *
 * This is the source of truth for the task store — it drops tasks resolved
 * out-of-band even when the Electric live-update didn't arrive, and clears stale
 * rows. Electric is a best-effort live layer on top; the acting user's own result
 * comes from the optimistic update at the act site, not the round-trip.
 *
 * Lives here (not in a component) because the tasks it seeds are timeline
 * CITIZENS — read by the Tasks filter badge and the canvas task-artifacts. It was
 * previously exported from the HumanTaskInbox drawer; the drawer is gone (tasks
 * are timeline citizens, not a second surface), the seed is not.
 */
import { fetchMyHumanTasks } from "@/api/client";
import { useHumanTaskStore, type HumanTask } from "@/store/useHumanTaskStore";
import { parseTaskPayload } from "@/lib/taskPayload";

/**
 * The per-row mapping from a raw `/me/human_tasks` row to a `HumanTask` — exported so a seal can
 * call the SAME function the live seed runs, rather than hand-build a row. `null` where the row
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

export function seedFromRest() {
  fetchMyHumanTasks()
    .then((resp) => {
      const tasks: HumanTask[] = [];
      for (const t of resp.tasks) {
        const task = humanTaskFromRow(t);
        if (task) tasks.push(task);
      }
      useHumanTaskStore.getState().replacePending(tasks);
    })
    .catch((err) => console.warn("[hitl] REST seed failed (live via Electric)", err));
}
