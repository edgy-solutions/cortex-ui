/**
 * Task → Artifact adapter.
 *
 * Tasks and answers are ONE citizen in two states: both are "things the mesh
 * produced that await your attention" — answers await reading, tasks await
 * action. So a HITL task becomes a synthetic `Artifact` in the SAME
 * `useCanvasStore.artifacts` collection the answer timeline + global canvas +
 * HUD all key off `currentArtifactId`. No second selection space, no bespoke
 * task surface: a task-artifact rides the timeline (TimeRow), the canvas
 * (StageCard → SemanticInterpreter), and the HUD for free, distinguished by
 * STATE not location (`task_ref.task_state`), rendered by ARCHETYPE
 * (GROUPED_REVIEW for reviews, APPROVAL_TASK for accept/reject tasks).
 */
import type { Artifact, TaskRef } from "@/api/types";
import type { HumanTask } from "@/store/useHumanTaskStore";
import type { ReviewBatch } from "@/components/GroupedReview/types";
import { taskKindDisplay } from "@/lib/taskKindRegistry";

export const TASK_ARTIFACT_PREFIX = "task:";

export const taskArtifactId = (taskRowId: string): string =>
  TASK_ARTIFACT_PREFIX + taskRowId;

/** The task-store row id behind a task-artifact id, or null if not one. */
export const taskRowIdOf = (artifactId: string): string | null =>
  artifactId.startsWith(TASK_ARTIFACT_PREFIX)
    ? artifactId.slice(TASK_ARTIFACT_PREFIX.length)
    : null;

export const isTaskArtifact = (a: Pick<Artifact, "id" | "task_ref">): boolean =>
  !!a.task_ref || a.id.startsWith(TASK_ARTIFACT_PREFIX);

// Display hints (badge/title/archetype) come from the single taskKindRegistry —
// the ONE address for per-kind presentation, awaiting served hints. Re-exported
// so existing imports keep one path; new code should read the registry.
export { taskKindLabel, taskKindTitle } from "@/lib/taskKindRegistry";

/**
 * The archetype component a task renders as on the canvas — keyed on the kind's
 * ARCHETYPE (from the registry), NOT on the kind string. A GROUPED_REVIEW needs
 * the fetched ReviewBatch (absent until lazy-fetched on selection); everything
 * else is an APPROVAL_TASK card (accept/reject, no batch).
 */
function taskComponents(task: HumanTask, batch?: ReviewBatch): unknown[] {
  if (taskKindDisplay(task.kind).archetype === "GROUPED_REVIEW") {
    return batch ? [{ archetype: "GROUPED_REVIEW", batch }] : [];
  }
  return [
    {
      archetype: "APPROVAL_TASK",
      task: {
        task_id: task.taskId,
        kind: task.kind,
        task_state: task.status,
        title: task.title,
        summary: task.summary,
        audience: task.audience,
        requested_by: task.requestedBy,
        subject_ref: task.subjectRef,
      },
    },
  ];
}

/**
 * Adapt a HumanTask into a synthetic Artifact. `status` is always `complete`
 * (so it displays — pending tasks are the LAST thing to hide); the task's own
 * lifecycle rides `task_ref.task_state`. A grouped-review artifact has no body
 * until its batch is fetched — the card then shows its title until selected.
 */
export function taskToArtifact(task: HumanTask, batch?: ReviewBatch): Artifact {
  const components = taskComponents(task, batch);
  const task_ref: TaskRef = {
    taskId: task.taskId,
    workflowId: task.workflowId,
    kind: task.kind,
    task_state: task.status,
    audience: task.audience,
    requestedBy: task.requestedBy,
    subjectRef: task.subjectRef,
  };
  return {
    id: taskArtifactId(task.id),
    created_at: task.createdAt,
    updated_at: task.createdAt,
    valid_as_of: task.createdAt,
    valid_until: null,
    question_text: task.summary,
    summary: task.title, // the timeline lead line (answerSummary reads this)
    resolved_intent: {},
    message_id: "",
    status: "complete",
    rendered_output: components.length ? { components } : null,
    produced_by: { actor_type: "agent", actor_id: "hitl" },
    produced_for: {
      user_id: task.requestedBy || "",
      is_authenticated: true,
      entitlement_source: "none",
    },
    routing: null,
    sources: [],
    graph_trace: [],
    graph_trace_alternates: [],
    derived_from_artifact_id: null,
    durability_status: "durable",
    watermark: 0,
    task_ref,
  };
}
