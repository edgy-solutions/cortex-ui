/**
 * WORKFLOW_CASE — ADR-0055 §2, second package. Behavioral assertions against the real fixtures,
 * through the real registry (never a direct `import { WorkflowCase }` for the dispatch tests —
 * see `fixtures.test.tsx` for the one place identity with the direct import is itself the proof).
 */
import { afterEach, describe, expect, it } from "vitest";
import { act, cleanup, render, screen } from "@testing-library/react";
import { archetypePackage } from "../registry";
import { readTaskDeclaration } from "@/lib/taskDeclaration";
import { useTaskKindStore } from "@/store/useTaskKindStore";
import { useHumanTaskStore } from "@/store/useHumanTaskStore";
import { SemanticInterpreter } from "@/components/registry/SemanticInterpreter";
import { WORKFLOW_CASE_FIXTURES } from "./fixtures";
import taskKindsCapture from "../../../sessions/2026-10-02-payload-task-kinds-rev-165-bob.json";

afterEach(() => {
  cleanup();
  useTaskKindStore.setState({ status: "idle", byKind: {} });
});

const pkg = archetypePackage("WORKFLOW_CASE")!;
const Card = pkg.Card;

const FIXTURE_1 = WORKFLOW_CASE_FIXTURES[0];
const FIXTURE_3 = WORKFLOW_CASE_FIXTURES[2];

/** Seeds the task-kind store from the SAME capture `fixtures/index.ts` reads, never a literal
 *  copy of its `accepts`/`reason_required` arrays. */
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

describe("the card renders through the registry, not a direct import", () => {
  it("archetypePackage(\"WORKFLOW_CASE\") resolves and draws", () => {
    expect(pkg).toBeTruthy();
    const { container } = render(<Card case={FIXTURE_1.payload} />);
    expect(container.querySelector('[data-archetype="WORKFLOW_CASE"]')).not.toBeNull();
  });
});

describe("stages — only the current, named-known stage is marked, never a guess", () => {
  it("fixture 1: data-stage-current marks exactly one stage, matching current_stage", () => {
    const { container } = render(<Card case={FIXTURE_1.payload} />);
    const instance = FIXTURE_1.payload.instances[0];
    const current = container.querySelectorAll("[data-stage-current]");
    expect(current).toHaveLength(1);
    expect(current[0].getAttribute("data-stage")).toBe(instance.current_stage);
  });

  it("fixture 2: EACH of the two instances draws its OWN full stage strip (mutant M6's target)", () => {
    const { container } = render(<Card case={WORKFLOW_CASE_FIXTURES[1].payload} />);
    for (const instance of WORKFLOW_CASE_FIXTURES[1].payload.instances) {
      const strip = container.querySelector(`[data-workflow-id="${instance.workflow_id}"][data-stages] , [data-stages] [data-workflow-id="${instance.workflow_id}"]`);
      // The stages wrapper nests one <ol data-workflow-id=...> per instance — assert each
      // instance's own domain_stages are all present under ITS ol, not just instance 0's.
      const ol = container.querySelector(`ol[data-workflow-id="${instance.workflow_id}"]`);
      expect(ol, `instance ${instance.workflow_id} has no stage strip of its own`).not.toBeNull();
      for (const stage of instance.definition.domain_stages) {
        expect(ol!.querySelector(`[data-stage="${stage}"]`), `${instance.workflow_id} missing stage ${stage}`).not.toBeNull();
      }
      void strip;
    }
  });

  it("fixture 5: an unrecognised current_stage declares data-stage-unknown and marks no stage current", () => {
    const { container } = render(<Card case={WORKFLOW_CASE_FIXTURES[4].payload} />);
    expect(container.querySelector("[data-stage-unknown]")).not.toBeNull();
    expect(container.querySelectorAll("[data-stage-current]")).toHaveLength(0);
  });
});

describe("approval labels come from the definition's own step title", () => {
  it("fixture 1: the approval is labelled by the bound step title, not the step id", () => {
    const { container } = render(<Card case={FIXTURE_1.payload} />);
    const approval = FIXTURE_1.payload.approvals![0];
    const instance = FIXTURE_1.payload.instances[0];
    const step = instance.definition.steps.find((s) => s.id === approval.step_id)!;
    // Scoped to the approval's own label <p> — fixture 1's task payload happens to carry the
    // identical producer string on its own title, so an unscoped text query is ambiguous.
    const label = container.querySelector("[data-approval] > p");
    expect(label?.textContent).toBe(step.title);
  });

  it("decided approvals with no reason declare data-reason-absent, never a blank line", () => {
    const { container } = render(<Card case={WORKFLOW_CASE_FIXTURES[3].payload} />);
    expect(container.querySelector("[data-reason-absent]")).not.toBeNull();
  });
});

describe("options — every data key the fixture carries is drawn, with its value", () => {
  it("fixture 3: each option's own keys and values appear, iterated off the fixture", () => {
    const { container } = render(<Card case={FIXTURE_3.payload} />);
    const optionEls = container.querySelectorAll("[data-option]");
    const options = FIXTURE_3.payload.options!;
    expect(optionEls).toHaveLength(options.length);
    options.forEach((option, i) => {
      const el = optionEls[i];
      for (const [key, value] of Object.entries(option.data)) {
        expect(el.textContent).toContain(key);
        expect(el.textContent).toContain(String(value));
      }
    });
  });
});

describe("the artifact is shown iff released — both halves of the condition", () => {
  it("fixture 3: uri AND released_at present — shown, never the absence", () => {
    const { container } = render(<Card case={FIXTURE_3.payload} />);
    expect(container.querySelector("[data-artifact]")).not.toBeNull();
    expect(container.querySelector("[data-artifact-absent]")).toBeNull();
  });

  it("fixture 1: no output_artifact at all — the absence, never a link", () => {
    const { container } = render(<Card case={FIXTURE_1.payload} />);
    expect(container.querySelector("[data-artifact-absent]")).not.toBeNull();
    expect(container.querySelector("[data-artifact]")).toBeNull();
  });
});

describe("a pending approval with a task hands it to ApprovalTaskCard, unchanged", () => {
  it("fixture 1, with the task-kind menu loaded: offers exactly the served kind's accepts", () => {
    const kinds = loadMenuFromCapture();
    const { container } = render(<Card case={FIXTURE_1.payload} />);
    const task = FIXTURE_1.payload.approvals![0].task!;
    const served = kinds[task.kind] as { accepts?: string[] } | undefined;
    expect(served, `task-kind capture has no entry for ${task.kind}`).toBeTruthy();
    const verbs = [...container.querySelectorAll("[data-verb]")].map((el) => el.getAttribute("data-verb"));
    expect(verbs.slice().sort()).toEqual((served!.accepts ?? []).slice().sort());
  });

  it("renders exactly one ApprovalTaskCard per pending-with-task approval (.glass-panel marker)", () => {
    loadMenuFromCapture();
    const { container } = render(<Card case={WORKFLOW_CASE_FIXTURES[1].payload} />);
    const pendingWithTask = WORKFLOW_CASE_FIXTURES[1].payload.approvals!.filter(
      (a) => a.status === "pending" && a.task,
    );
    expect(container.querySelectorAll(".glass-panel")).toHaveLength(pendingWithTask.length);
  });
});

describe("the SemanticInterpreter dispatches WORKFLOW_CASE through the registry", () => {
  it("an envelope {archetype: WORKFLOW_CASE, case: ...} renders the card, not the not-found panel", () => {
    render(
      <SemanticInterpreter
        payload={{
          components: [
            {
              archetype: "WORKFLOW_CASE",
              case: FIXTURE_1.payload,
            },
          ],
        }}
      />,
    );
    expect(document.querySelector('[data-archetype="WORKFLOW_CASE"]')).not.toBeNull();
    expect(screen.queryByText(/no render registered for|render not drawn/)).toBeNull();
  });

  it("an envelope with NO case object does not draw the card (and does not throw)", () => {
    render(<SemanticInterpreter payload={{ components: [{ archetype: "WORKFLOW_CASE" }] }} />);
    expect(document.querySelector('[data-archetype="WORKFLOW_CASE"]')).toBeNull();
  });
});

describe("options source — the case's own key, else the pending task's, else the stated absence", () => {
  const FOUR = ["zeta", "alpha", "mid", "beta"];
  const wf = FIXTURE_1.payload.instances[0].workflow_id;
  const withoutOptions = () => {
    const { options: _o, ...rest } = FIXTURE_1.payload;
    return rest as typeof FIXTURE_1.payload;
  };
  const pendingTask = (over: Record<string, unknown> = {}) => ({
    id: "r1", taskId: `${wf}:t1`, workflowId: wf, audience: "a", kind: "some_kind", status: "pending" as const,
    title: "", summary: "", requestedBy: "", subjectRef: null, createdAt: 0,
    declaration: { kind: "some_kind", declared: true, accepts: FOUR, reason_required: [] },
    ...over,
  });
  afterEach(() => useHumanTaskStore.setState({ tasks: [] }));

  it("the four case: options absent + a pending task declaring four verbs draws 4 options, never 'no options'", () => {
    useHumanTaskStore.setState({ tasks: [pendingTask()] });
    const { container } = render(<Card case={withoutOptions()} />);
    expect(container.querySelectorAll("[data-option]")).toHaveLength(4);
    expect(container.querySelector("[data-options]")!.getAttribute("data-options-source")).toBe("task");
    expect(container.querySelector("[data-options-from-task]")).not.toBeNull();
    expect(container.textContent).not.toMatch(/no options/);
  });

  it("the four case, menu loaded AFTER the card drew: the registry's four verbs replace the two seed verbs", () => {
    // A row with no declaration of its own: the card falls back to the served menu, which loads on
    // boot and may land after the case panel has drawn.
    useHumanTaskStore.setState({ tasks: [pendingTask({ declaration: undefined })] });
    const { container } = render(<Card case={withoutOptions()} />);
    expect(container.querySelectorAll("[data-option]")).toHaveLength(2);
    act(() => {
      useTaskKindStore.setState({
        status: "loaded",
        byKind: { some_kind: readTaskDeclaration({ kind: "some_kind", declared: true, accepts: FOUR, reason_required: [] }) } as never,
      });
    });
    const ids = [...container.querySelectorAll("[data-option]")].map((li) => li.textContent);
    expect(ids).toHaveLength(4);
  });

  it("[] draws 'no options' under data-options-empty", () => {
    useHumanTaskStore.setState({ tasks: [pendingTask()] });
    const { container } = render(<Card case={{ ...FIXTURE_1.payload, options: [] }} />);
    expect(container.querySelector("[data-options-empty]")!.textContent).toBe("no options");
    expect(container.querySelector("[data-options-absent]")).toBeNull();
    expect(container.querySelector("[data-options]")!.getAttribute("data-options-source")).toBe("case");
  });

  it("absent with an empty store says the options were not recorded", () => {
    const { container } = render(<Card case={withoutOptions()} />);
    expect(container.querySelector("[data-options-absent]")!.textContent).toBe("options not recorded for this case");
    expect(container.querySelector("[data-options]")!.getAttribute("data-options-source")).toBe("none");
  });
});
