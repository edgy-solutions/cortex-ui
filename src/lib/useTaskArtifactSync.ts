/**
 * Mirror the HITL task store into synthetic task-artifacts in the canvas store,
 * so tasks ride the SAME timeline / global canvas / HUD rails as answers off the
 * single `currentArtifactId` selection signal. One effect, decoupled: it watches
 * `useHumanTaskStore.tasks` and reconciles `useCanvasStore`'s `task:`-prefixed
 * artifacts to match — the reconciler preserves any lazy-fetched review batch
 * across a task-state update, and drops a task-artifact when its task leaves.
 *
 * Mount once (App). Pending and resolved tasks both map; state lives on
 * `task_ref.task_state` (pending-is-a-state), so a resolved task settles into
 * the timeline as history at its chronological position rather than vanishing.
 */
import { useEffect, useRef } from "react";
import { useHumanTaskStore } from "@/store/useHumanTaskStore";
import { useCanvasStore } from "@/store/useCanvasStore";
import { taskToArtifact, TASK_ARTIFACT_PREFIX } from "@/lib/taskArtifact";
import { taskKindDisplay } from "@/lib/taskKindRegistry";
import { fetchReviewBatch } from "@/api/client";

export function useTaskArtifactSync(): void {
  const tasks = useHumanTaskStore((s) => s.tasks);
  const reconcile = useCanvasStore((s) => s.reconcileTaskArtifacts);
  useEffect(() => {
    reconcile(tasks.map((t) => taskToArtifact(t)));
  }, [tasks, reconcile]);

  // Lazy-load the review batch when a grouped-review task-card is SELECTED. The
  // task-artifact has no body until then (get_batch is authored per-approver, so
  // it isn't eagerly fetched for every task in the queue). On first selection,
  // fetch it and write the GROUPED_REVIEW component — the canvas card + full pane
  // then render the real review, and the reconciler preserves it thereafter.
  const currentId = useCanvasStore((s) => s.currentArtifactId);
  const fetching = useRef<Set<string>>(new Set());
  useEffect(() => {
    if (!currentId || !currentId.startsWith(TASK_ARTIFACT_PREFIX)) return;
    const st = useCanvasStore.getState();
    const art = st.artifacts.find((a) => a.id === currentId);
    if (!art?.task_ref) return;
    if (taskKindDisplay(art.task_ref.kind).archetype !== "GROUPED_REVIEW") return;
    if ((art.rendered_output?.components.length ?? 0) > 0) return; // already loaded
    const wf = art.task_ref.workflowId;
    if (!wf || fetching.current.has(currentId)) return;
    fetching.current.add(currentId);
    fetchReviewBatch(wf)
      .then((batch) => {
        useCanvasStore.getState().updateArtifact(
          currentId,
          { rendered_output: { components: [{ archetype: "GROUPED_REVIEW", batch }] } },
          "local:task_batch"
        );
      })
      .catch(() => {
        /* leave body empty — the card falls back to the task title */
      })
      .finally(() => fetching.current.delete(currentId));
  }, [currentId]);
}

/**
 * Settle a task once its review/approval is submitted (via the sealed /act path,
 * inside GroupedReviewTable / ApprovalTaskCard). Marks the matching task
 * `approved` in the store — the reconciler then re-styles its timeline row as
 * resolved history (it stays at its chronological spot; pending-is-a-state).
 */
export function markTaskResolvedByTaskId(taskId: string): void {
  const store = useHumanTaskStore.getState();
  const task = store.tasks.find((t) => t.taskId === taskId);
  if (task && task.status === "pending") {
    store.upsertTask({ ...task, status: "approved" });
  }
}
