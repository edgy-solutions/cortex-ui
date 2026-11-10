/**
 * OPTION DATA IS DRAWN BY ITS OWN FIELDS (0.4.85 walk: the OpenDDIL option cards drew
 * "[object Object]" for parts, spares and task_refs).
 *
 * The options below are built as `policy/overlays/openddil-lab/workflows/maint_fault_propose.yaml`
 * (invincible-agent f9fa4d7b) builds its render step's options: `verb`, `label` and the keys the
 * workflow writes beside them. Every nested value is the transcribed SDK shape, not invented here:
 * `task`, `task_refs` and `parts` are `MAINT_ACTION_APPROVED.work_order`'s, `spares`, `nearest_spare`
 * and `battle_condition` are `MAINT_EVENT.picture`'s. The one addition is a task_ref whose
 * `graph_uri` is null, which is how the template writes one it has no graph node for.
 *
 * Both roads an option reaches the card by are walked: the case's own `options` (as
 * `project_options` serves them, through the real reader) and the pending task's `payload.options`
 * (as the task row carries them). The expectation is computed from the VALUE, walking its shape, not
 * from the renderer: a list must draw one item per element, a record one field per key in order, a
 * scalar its own text, and null must say "none".
 */
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { WorkflowCase } from "./Card";
import { OptionValue } from "./OptionValue";
import { WORKFLOW_CASE_FIXTURES } from "./fixtures";
import { MAINT_ACTION_APPROVED, MAINT_EVENT } from "./fixtures/maintenanceBridge";
import { readWorkflowCasePayload } from "@/lib/cases";
import { useHumanTaskStore, type HumanTask } from "@/store/useHumanTaskStore";
import type { WorkflowCasePayload } from "./contract";

afterEach(() => {
  cleanup();
  useHumanTaskStore.setState({ tasks: [] });
});

const WO = MAINT_ACTION_APPROVED.work_order;
const PIC = MAINT_EVENT.picture;
const TASK_REFS = [...WO.task_refs, { graph_uri: null, data_module_code: "DMC-2" }];

const TEMPLATE_OPTIONS: Record<string, unknown>[] = [
  {
    verb: "replace_now",
    label: "Replace now",
    readiness: PIC.readiness,
    takes_offline: true,
    task: WO.task,
    task_refs: TASK_REFS,
    parts: WO.parts,
    spares: PIC.spares,
    input_revision: 3,
    battle_condition: PIC.battle_condition,
  },
  {
    verb: "replace_after_resupply",
    label: "Replace after resupply",
    readiness: "PMC",
    takes_offline: false,
    task: WO.task,
    task_refs: TASK_REFS,
    parts: WO.parts.map((p) => ({ ...p, lead_time_days: 5, lead_time_source: null })),
    spares: PIC.spares,
    nearest_spare: PIC.nearest_spare,
    input_revision: 3,
  },
];

const BASE = WORKFLOW_CASE_FIXTURES[0].payload;
const WF = BASE.instances[0].workflow_id;

/** The case's own key, as `project_options` builds it: id=verb, data=every other key, through the reader. */
function servedWithOptions(): WorkflowCasePayload {
  const options = TEMPLATE_OPTIONS.map(({ verb, label, ...data }) => ({ id: verb, label, data, artifact_uri: null }));
  const read = readWorkflowCasePayload(JSON.parse(JSON.stringify({ ...BASE, options, options_declaration: null })));
  if (!read.ok) throw new Error(`the reader refused the served body: ${read.detail}`);
  return read.payload;
}

function withoutOptions(): WorkflowCasePayload {
  const { options: _o, options_declaration: _d, ...rest } = BASE;
  return rest as WorkflowCasePayload;
}

const pendingTaskCarrying = (options: unknown[]): HumanTask =>
  ({
    id: "r1", taskId: `${WF}:propose`, workflowId: WF, audience: "a", kind: "maint_fault_approval", status: "pending",
    title: "", summary: "", requestedBy: "", subjectRef: null, createdAt: 0,
    payload: { options: JSON.parse(JSON.stringify(options)) },
  }) as HumanTask;

/** Walk the VALUE and require the drawn element to have the same shape, field by field. */
function expectDrawn(el: Element | null, value: unknown, path: string): void {
  expect(el, `${path}: nothing drawn`).not.toBeNull();
  const kind = el!.getAttribute("data-option-value");
  if (value === null || value === undefined) {
    expect(kind, path).toBe("none");
    return;
  }
  if (typeof value !== "object") {
    expect(kind, path).toBe("scalar");
    expect(el!.textContent, path).toBe(String(value));
    return;
  }
  if (Array.isArray(value)) {
    expect(kind, path).toBe(value.length === 0 ? "empty-list" : "list");
    const items = el!.querySelectorAll(":scope > [data-option-item]");
    expect(items, path).toHaveLength(value.length);
    items.forEach((li, i) => expectDrawn(li.firstElementChild, value[i], `${path}[${i}]`));
    return;
  }
  const keys = Object.keys(value);
  expect(kind, path).toBe(keys.length === 0 ? "empty-record" : "record");
  const fields = [...el!.querySelectorAll(":scope > [data-option-field]")];
  expect(fields.map((f) => f.getAttribute("data-option-field")), path).toEqual(keys);
  fields.forEach((f, i) =>
    expectDrawn(f.querySelector(":scope > dd")!.firstElementChild, (value as Record<string, unknown>)[keys[i]], `${path}.${keys[i]}`),
  );
}

function expectEveryOptionDrawnByItsFields(container: HTMLElement) {
  expect(container.textContent).not.toContain("[object Object]");
  const lis = container.querySelectorAll("[data-option]");
  expect(lis).toHaveLength(TEMPLATE_OPTIONS.length);
  TEMPLATE_OPTIONS.forEach(({ verb, label, ...data }, o) => {
    const li = lis[o];
    expect(li.querySelector(":scope > p")!.textContent).toBe(label);
    const fields = [...li.querySelectorAll(":scope > dl > [data-option-field]")];
    expect(fields.map((f) => f.getAttribute("data-option-field")), String(verb)).toEqual(Object.keys(data));
    for (const f of fields) {
      const key = f.getAttribute("data-option-field")!;
      expectDrawn(f.querySelector(":scope > dd")!.firstElementChild, data[key], `${verb}.${key}`);
    }
  });
  // The reader's view, spelled once: a task_ref shows its data module code and its graph node, or "none".
  const ref = (o: number, i: number, k: string) =>
    lis[o].querySelector(`:scope > dl > [data-option-field="task_refs"] [data-option-item="${i}"] [data-option-field="${k}"] > dd`)!
      .textContent;
  expect(ref(0, 0, "data_module_code")).toBe("DMC-1");
  expect(ref(0, 0, "graph_uri")).toBe("graph://node-1");
  expect(ref(0, 1, "graph_uri")).toBe("none");
}

describe("option data is drawn by its declared fields, never by string coercion", () => {
  it("the case's own options (served by project_options, through the reader)", () => {
    const { container } = render(<WorkflowCase case={servedWithOptions()} />);
    expect(container.querySelector("[data-options]")!.getAttribute("data-options-source")).toBe("case");
    expectEveryOptionDrawnByItsFields(container);
  });

  it("the pending task's payload.options (the case carries no options key)", () => {
    useHumanTaskStore.setState({ tasks: [pendingTaskCarrying(TEMPLATE_OPTIONS)] });
    const { container } = render(<WorkflowCase case={withoutOptions()} />);
    expect(container.querySelector("[data-options]")!.getAttribute("data-options-source")).toBe("task");
    expectEveryOptionDrawnByItsFields(container);
  });
});

describe("OptionValue: absences say which absence they are", () => {
  const drawn = (value: unknown) => {
    const { container } = render(<OptionValue value={value} />);
    return container.firstElementChild!;
  };

  it("null, an empty list and an empty record are three different words", () => {
    expect([drawn(null), drawn([]), drawn({})].map((e) => [e.getAttribute("data-option-value"), e.textContent])).toEqual([
      ["none", "none"],
      ["empty-list", "none listed"],
      ["empty-record", "no fields"],
    ]);
  });

  it("a scalar keeps its own text, false and 0 included", () => {
    expect([drawn(false), drawn(0), drawn("x")].map((e) => e.textContent)).toEqual(["false", "0", "x"]);
  });

  it("past the depth bound the fields still show, as JSON, never as a coerced object", () => {
    let deep: unknown = { leaf: "L" };
    for (let i = 0; i < 8; i++) deep = { n: deep };
    const el = drawn(deep);
    expect(el.textContent).not.toContain("[object Object]");
    expect(el.textContent).toContain('{"leaf":"L"}');
  });
});
