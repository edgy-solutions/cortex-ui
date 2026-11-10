import type { HumanTask } from "@/store/useHumanTaskStore";
import { offeredVerbs, readTaskDeclaration, verbLabel, type TaskDeclaration } from "@/lib/taskDeclaration";
import type { CaseOption, WorkflowCasePayload } from "./contract";

/** A task registered by instance `wf`: every `human_await` registers `{workflow_id}:{step_id}` and stamps
 *  `workflow_id` on the row, and the producer's `project_approvals` matches its rows the same way. */
export const isInstanceTask = (t: HumanTask, wf: string): boolean =>
  t.workflowId === wf && t.taskId.startsWith(`${wf}:`);

/**
 * The viewer's own pending tasks on this case, in chain order. The task store holds only this viewer's
 * rows (the BFF injects `recipient_id`), so a pending row there IS "held". The case read is not the
 * source: it never serves `approvals[].task` (`case_projection.project_approvals`: "omitted per the
 * roll spec"), and a landing keyed on it never opened a task on the walk (0.4.85).
 */
export function heldTasks(payload: WorkflowCasePayload, tasks: HumanTask[]): HumanTask[] {
  const out: HumanTask[] = [];
  for (const inst of payload.instances ?? []) {
    for (const t of tasks) if (t.status === "pending" && isInstanceTask(t, inst.workflow_id)) out.push(t);
  }
  return out;
}

export type CaseOptions =
  | { source: "case"; options: CaseOption[] }
  | { source: "task"; taskId: string; options: CaseOption[]; undeclared?: true }
  | { source: "none" };

/**
 * Where a case's options come from. `payload.options` when the producer sent the key (an empty
 * array is the producer saying the definition offered no choices, and is NEVER fallen back from).
 * When the key is absent (a case registered before the producer wrote it), the latest instance's
 * own pending task: its `payload.options` mapped as the producer maps them, else the verbs the
 * task card itself offers (declaration order, never sorted).
 */
export function caseOptions(
  payload: WorkflowCasePayload,
  pending: HumanTask[],
  declarationFor: (kind: string) => TaskDeclaration | null,
): CaseOptions {
  if (Array.isArray(payload.options)) return { source: "case", options: payload.options };
  const instances = payload.instances ?? [];
  for (let i = instances.length - 1; i >= 0; i--) {
    const wf = instances[i].workflow_id;
    const task = pending.find((t) => isInstanceTask(t, wf));
    if (!task) continue;
    const raw = task.payload?.options;
    if (Array.isArray(raw)) {
      const options: CaseOption[] = [];
      for (const el of raw) {
        if (typeof el !== "object" || el === null) continue;
        const { verb, label, ...rest } = el as Record<string, unknown>;
        if (typeof verb !== "string") continue;
        options.push({
          id: verb,
          label: typeof label === "string" && label ? label : verb,
          data: rest as CaseOption["data"],
          artifact_uri: null,
        });
      }
      return { source: "task", taskId: task.taskId, options };
    }
    const decl = readTaskDeclaration(task.declaration) ?? declarationFor(task.kind);
    // No payload options and no declaration: nothing is offered, and the card says so (architect 2026-10-30),
    // which is not the same fact as a declaration that offers none.
    if (!decl) return { source: "task", taskId: task.taskId, options: [], undeclared: true };
    return {
      source: "task",
      taskId: task.taskId,
      options: offeredVerbs(decl).map((v) => ({ id: v, label: verbLabel(v), data: {}, artifact_uri: null })),
    };
  }
  return { source: "none" };
}
