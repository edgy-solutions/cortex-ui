/**
 * WORKFLOW_CASE — the card standard: click-to-select rows, arrow keys, a detail pane, a top line.
 * The two definitions share a step id ("review") with DIFFERENT titles, and two approvals share
 * that step id across workflows, so the `workflow_id` join is what decides every pane assertion.
 */
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render } from "@testing-library/react";
import { archetypePackage } from "../registry";
import { readTaskDeclaration } from "@/lib/taskDeclaration";
import { useTaskKindStore } from "@/store/useTaskKindStore";
import { WORKFLOW_CASE_FIXTURES } from "./fixtures";
import type { CaseInstance, WorkflowCasePayload } from "./contract";
import taskKindsCapture from "../../../sessions/2026-10-02-payload-task-kinds-rev-165-bob.json";

afterEach(() => {
  cleanup();
  useTaskKindStore.setState({ status: "idle", byKind: {} });
});

const Card = archetypePackage("WORKFLOW_CASE")!.Card;

function loadMenuFromCapture() {
  const kinds = (taskKindsCapture as { body: { kinds: Record<string, Record<string, unknown>> } }).body.kinds;
  const byKind: Record<string, ReturnType<typeof readTaskDeclaration>> = {};
  for (const [name, row] of Object.entries(kinds)) {
    const decl = readTaskDeclaration(row);
    if (decl) byKind[name] = decl;
  }
  useTaskKindStore.setState({ status: "loaded", byKind: byKind as never });
  return kinds;
}

const PENDING_TASK = WORKFLOW_CASE_FIXTURES[1].payload.approvals!.find((a) => a.status === "pending" && a.task)!.task!;

const INST_A: CaseInstance = {
  workflow_id: "wf-a",
  status: "completed",
  current_stage: "alpha_two",
  definition: {
    id: "def-a",
    name: "Alpha flow",
    participants: [{ role: "r" }],
    domain_stages: ["alpha_one", "alpha_two"],
    steps: [
      { id: "review", kind: "human_await", title: "Alpha review title", audience: "aud_a" },
      { id: "gate", kind: "human_await", title: "Alpha gate" },
    ],
  },
};
const INST_B: CaseInstance = {
  workflow_id: "wf-b",
  status: "running",
  current_stage: null,
  definition: {
    id: "def-b",
    name: "Beta flow",
    participants: [{ role: "r" }],
    domain_stages: ["beta_one"],
    steps: [{ id: "review", kind: "render", title: "Beta review title", audience: "aud_b" }],
  },
};

function payload(over: Partial<WorkflowCasePayload> = {}): WorkflowCasePayload {
  return {
    subject_ref: "SUBJ-1",
    instances: [INST_A, INST_B],
    history: [
      { at: "t0", workflow_id: "wf-a", event: "ev0", stage: "alpha_one", actor: "u0" },
      { at: "t1", workflow_id: "wf-a", event: "ev1", step_id: "review" },
      { at: "t2", workflow_id: "wf-a", event: "ev2", step_id: "gate" },
      { at: "t3", workflow_id: "wf-a", event: "ev3", step_id: "nope" },
      { at: "t4", workflow_id: "wf-b", event: "ev4" },
      { at: "t5", workflow_id: "wf-b", event: "ev5", step_id: "review" },
      { at: "t6", workflow_id: "wf-b", event: "ev6" },
    ],
    approvals: [
      {
        workflow_id: "wf-a",
        step_id: "review",
        status: "decided",
        decided_by: "alice",
        decision: "decision_alpha",
        reason: "reason alpha",
      },
      {
        workflow_id: "wf-b",
        step_id: "review",
        status: "decided",
        decided_by: "bob",
        decision: "decision_beta",
        reason: "reason beta",
      },
      { workflow_id: "wf-a", step_id: "gate", status: "pending", task: PENDING_TASK },
    ],
    ...over,
  };
}

const row = (c: HTMLElement, i: number) => c.querySelector(`[data-case-row="${i}"]`) as HTMLElement;
const pane = (c: HTMLElement) => c.querySelector("[data-case-pane]") as HTMLElement;

describe("A. default selection", () => {
  it("row 0 is selected on mount and the pane shows row 0", () => {
    const { container } = render(<Card case={payload()} />);
    expect(row(container, 0).getAttribute("aria-selected")).toBe("true");
    expect(row(container, 0).hasAttribute("data-selected")).toBe(true);
    expect(pane(container).getAttribute("data-case-pane-row")).toBe("0");
    expect(pane(container).textContent).toContain("ev0");
  });

  it("no history: data-history-absent and no pane", () => {
    const { container } = render(<Card case={payload({ history: [] })} />);
    expect(container.querySelector("[data-history-absent]")).not.toBeNull();
    expect(pane(container)).toBeNull();
  });
});

describe("B. clicking a row selects it", () => {
  it("click row 5 on its text: only row 5 selected; the step comes from wf-b's definition; its approval is wf-b's", () => {
    const { container } = render(<Card case={payload()} />);
    fireEvent.click(row(container, 5).querySelector("span")!);
    const selected = [...container.querySelectorAll('[role="option"]')].filter(
      (el) => el.getAttribute("aria-selected") === "true",
    );
    expect(selected).toHaveLength(1);
    expect(selected[0]).toBe(row(container, 5));
    expect(container.querySelectorAll("[data-selected]")).toHaveLength(1);
    const p = pane(container);
    expect(p.getAttribute("data-case-pane-row")).toBe("5");
    expect(p.textContent).toContain("ev5");
    expect(p.querySelector("[data-case-pane-step]")!.textContent).toContain("Beta review title");
    expect(p.textContent).not.toContain("Alpha review title");
    const ap = p.querySelector("[data-case-pane-approval]")!.textContent!;
    expect(ap).toContain("decision_beta");
    expect(ap).toContain("reason beta");
    expect(ap).not.toContain("decision_alpha");
  });
});

describe("C. arrow keys", () => {
  it("ArrowDown moves 5 -> 6, clamps at the last row; ArrowUp from row 0 stays", () => {
    const { container } = render(<Card case={payload()} />);
    const list = container.querySelector('[role="listbox"]') as HTMLElement;
    expect(list.getAttribute("tabindex")).toBe("0");
    fireEvent.click(row(container, 5));
    fireEvent.keyDown(list, { key: "ArrowDown" });
    expect(pane(container).getAttribute("data-case-pane-row")).toBe("6");
    fireEvent.keyDown(list, { key: "ArrowDown" });
    expect(container.querySelector("[data-case-pane]")?.getAttribute("data-case-pane-row"), "ArrowDown past the last row: the pane must stay on row 6").toBe("6");
    expect(row(container, 6).getAttribute("aria-selected")).toBe("true");
    fireEvent.click(row(container, 0));
    fireEvent.keyDown(list, { key: "ArrowUp" });
    expect(pane(container).getAttribute("data-case-pane-row")).toBe("0");
    expect(row(container, 0).getAttribute("aria-selected")).toBe("true");
  });
});

describe("D. the pending approval's verbs are drawn once", () => {
  it("with the pending entry selected, the pane says act below and the task card is drawn only once", () => {
    const kinds = loadMenuFromCapture();
    const { container } = render(<Card case={payload()} />);
    const accepts = ((kinds[PENDING_TASK.kind] as { accepts?: string[] }).accepts ?? []).length;
    expect(accepts).toBeGreaterThan(0);
    fireEvent.click(row(container, 2));
    expect(pane(container).querySelector("[data-case-pane-approval]")!.textContent).toContain(
      "awaiting a decision; act on it below",
    );
    expect(container.querySelectorAll(".glass-panel")).toHaveLength(1);
    expect(container.querySelectorAll("[data-verb]")).toHaveLength(accepts);
    expect(pane(container).querySelector(".glass-panel")).toBeNull();
  });
});

describe("E. an entry without a step_id", () => {
  it("shows data-case-pane-step-absent (and so does an unknown step_id)", () => {
    const { container } = render(<Card case={payload()} />);
    fireEvent.click(row(container, 4));
    expect(pane(container).querySelector("[data-case-pane-step-absent]")).not.toBeNull();
    expect(pane(container).querySelector("[data-case-pane-step]")).toBeNull();
    expect(pane(container).querySelector("[data-case-pane-approval]")).toBeNull();
    fireEvent.click(row(container, 3));
    expect(pane(container).querySelector("[data-case-pane-step-absent]")).not.toBeNull();
  });
});

describe("F. the top line names the LAST instance", () => {
  it("last instance has no current_stage: its name and 'stage not stated'", () => {
    const { container } = render(<Card case={payload()} />);
    const top = container.querySelector("[data-case-topline]") as HTMLElement;
    expect(top.firstElementChild!.textContent).toBe("SUBJ-1");
    expect(top.textContent).toContain("Beta flow");
    expect(top.textContent).not.toContain("Alpha flow");
    expect(top.textContent).toContain("running");
    expect(top.textContent).toContain("stage not stated");
    expect(top.querySelector("[data-case-topline-stage-absent]")).not.toBeNull();
  });

  it("a current_stage not in domain_stages is also 'stage not stated'", () => {
    const bad = { ...INST_B, current_stage: "elsewhere" };
    const { container } = render(<Card case={payload({ instances: [INST_A, bad] })} />);
    const top = container.querySelector("[data-case-topline]") as HTMLElement;
    expect(top.querySelector("[data-case-topline-stage-absent]")).not.toBeNull();
    expect(top.textContent).not.toContain("elsewhere");
  });

  it("a valid stage on the last instance is named", () => {
    const ok = { ...INST_B, current_stage: "beta_one" };
    const { container } = render(<Card case={payload({ instances: [INST_A, ok] })} />);
    const top = container.querySelector("[data-case-topline]") as HTMLElement;
    expect(top.textContent).toContain("beta_one");
    expect(top.querySelector("[data-case-topline-stage-absent]")).toBeNull();
  });

  it("no instances: the subject only", () => {
    const { container } = render(<Card case={payload({ instances: [] })} />);
    expect(container.querySelector("[data-case-topline]")!.textContent).toBe("SUBJ-1");
  });
});

describe("G. the artifact absence is worded as an absence", () => {
  it("no artifact: data-artifact-absent, 'no artifact', and 'not yet released' nowhere", () => {
    const { container } = render(<Card case={payload()} />);
    const el = container.querySelector("[data-artifact-absent]")!;
    expect(el.textContent).toBe("no artifact");
    expect(container.textContent).not.toContain("not yet released");
  });
});
