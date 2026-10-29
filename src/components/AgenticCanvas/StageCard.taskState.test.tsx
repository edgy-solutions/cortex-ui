/**
 * A TASK CARD'S META LINE SAYS THE TASK'S STATE, NEVER THE ANSWER ROW'S.
 *
 * Chris's liaison screenshot, 10-28: two canvas task cards read "PENDING" in the header and
 * "complete · 24h ago" under the title. A task-artifact's `status` is `complete` by construction
 * (taskToArtifact makes it so the card displays); the lifecycle rides `task_ref.task_state`.
 *
 * The artifact is built by the REAL `taskToArtifact`, the function the live sync runs, so the
 * fixture cannot carry a status the producer would not.
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, cleanup } from "@testing-library/react";
import type { TaskState } from "@/api/types";
import type { HumanTask } from "@/store/useHumanTaskStore";
import { taskToArtifact } from "@/lib/taskArtifact";

vi.mock("@/components/elicitation/AskedSection", () => ({ AskedSection: () => null }));
vi.mock("./AnswerBody", () => ({ AnswerBody: () => <div data-testid="answer-body" /> }));

import { StageCard } from "./StageCard";

vi.stubGlobal("ResizeObserver", class { observe() {} disconnect() {} unobserve() {} });
afterEach(cleanup);

/** Every TaskState. A Record keyed on the union, so tsc refuses this list the day one is added
 *  (proved 10-28: written with 13 of the 15, it failed TS2739; a hand-counted length arm beside
 *  it agreed with the short list and passed, so it was removed). */
const ALL_STATES: Record<TaskState, true> = {
  pending: true, approved: true, rejected: true, expired: true,
  acknowledged: true, redriven: true,
  accepted: true, concurred: true, not_concurred: true, returned_for_rework: true,
  linked: true, new_hazard: true, dismissed: true,
  redrafted: true, withdrawn: true,
};

const humanTask = (status: TaskState): HumanTask => ({
  id: `row-${status}`,
  taskId: `t-${status}`,
  workflowId: "wf-1",
  audience: "maint_fault_approval:SUSTAINMENT",
  kind: "workflow_ack",
  status: status as HumanTask["status"],
  title: "Fault MRAD-ARR-0417 on dis:2:1:1010: choose a disposition",
  summary: "Four options, each citing the manual and the spares",
  requestedBy: "",
  subjectRef: null,
  payload: null,
  createdAt: Date.now() - 24 * 3_600_000,
});

const metaOf = (status: TaskState): string => {
  const a = taskToArtifact(humanTask(status));
  render(<StageCard artifact={a} focused={false} onClick={() => {}} onDoubleClick={() => {}} style={{}} />);
  const meta = document.querySelector('[data-testid="stage-tile-meta"]');
  // The meta line is the subject; a card that drew none would pass every "not complete" arm.
  expect(meta, "the task card drew no meta line").not.toBeNull();
  return meta!.textContent!;
};

describe("a canvas task card shows the task's state, not the answer's", () => {
  it("the producer really does stamp a task-artifact `complete` (the premise of this seal)", () => {
    expect(taskToArtifact(humanTask("pending")).status).toBe("complete");
  });

  it("a PENDING task reads pending, with its age", () => {
    const meta = metaOf("pending");
    expect(meta).toContain("pending · ");
    expect(meta).toContain("24h ago");
    expect(meta).not.toContain("complete");
  });

  it("every task state reads as itself, and none reads complete", () => {
    const wrong: string[] = [];
    for (const s of Object.keys(ALL_STATES) as TaskState[]) {
      const meta = metaOf(s);
      if (!meta.startsWith(`${s} · `) || meta.includes("complete")) wrong.push(`${s} → "${meta}"`);
      cleanup();
    }
    expect(wrong).toEqual([]);
  });

  it("an answer still reads its own status (the task branch did not swallow it)", () => {
    const a = { ...taskToArtifact(humanTask("pending")), id: "ans-1", task_ref: undefined };
    render(<StageCard artifact={a} focused={false} onClick={() => {}} onDoubleClick={() => {}} style={{}} />);
    expect(document.querySelector('[data-testid="stage-tile-meta"]')!.textContent).toContain("complete · ");
  });
});
