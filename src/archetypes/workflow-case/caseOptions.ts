import type { HumanTask } from "@/store/useHumanTaskStore";
import { offeredVerbs, readTaskDeclaration, verbLabel, type TaskDeclaration } from "@/lib/taskDeclaration";
import type { CaseOption, WorkflowCasePayload } from "./contract";

export type CaseOptions =
  | { source: "case"; options: CaseOption[] }
  | { source: "task"; taskId: string; options: CaseOption[] }
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
    const task = pending.find((t) => t.workflowId === wf && t.taskId.startsWith(`${wf}:`));
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
    return {
      source: "task",
      taskId: task.taskId,
      options: offeredVerbs(decl).map((v) => ({ id: v, label: verbLabel(v), data: {}, artifact_uri: null })),
    };
  }
  return { source: "none" };
}
