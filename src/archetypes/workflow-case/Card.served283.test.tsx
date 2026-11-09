/**
 * The case panel against `GET /cases/{id}` as invincible-agent #283 serves it (live in 0.4.81). The body
 * below is built field by field from `project_workflow_case` in `src/iagent/case_projection.py` at
 * c3b51ed7: history rows carry no `step_id`, the case's own transitions are attributed to the case id,
 * `output_artifact` is `{uri, artifact_id, label, released_at}` with `label` null when the record has none,
 * and `options` + `options_declaration` are served on a CLOSED case. It goes through the real guard first.
 */
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render } from "@testing-library/react";
import { WorkflowCase } from "./Card";
import { WORKFLOW_CASE_FIXTURES } from "./fixtures";
import { readWorkflowCasePayload } from "@/lib/cases";
import type { WorkflowCasePayload } from "./contract";

afterEach(cleanup);

const BASE = WORKFLOW_CASE_FIXTURES[2].payload;
const WF = BASE.instances[0]!.workflow_id;

function served(over: Record<string, unknown> = {}): WorkflowCasePayload {
  const body = {
    subject_ref: "case-283",
    stage: "closed",
    episode_id: "EP-1",
    episode_id_source: "event",
    predecessor: null,
    instances: BASE.instances,
    history: [
      { at: "2026-11-07T09:00:00Z", workflow_id: "case-283", event: "received", stage: "received", actor: "system" },
      { at: "2026-11-07T09:00:01Z", workflow_id: WF, event: "decided", stage: "closed", actor: "alex" },
    ],
    approvals: [],
    output_artifact: { uri: "/cases/case-283/action", artifact_id: "AR-77", label: null, released_at: "2026-11-07T09:01:00Z" },
    options: BASE.options,
    options_declaration: { definition_id: "decl-x", version: 3 },
    ...over,
  };
  const read = readWorkflowCasePayload(JSON.parse(JSON.stringify(body)));
  if (!read.ok) throw new Error(`the guard refused the served body: ${read.detail}`);
  return read.payload;
}
const q = (c: HTMLElement, s: string) => c.querySelector(s);

describe("the artifact link, against #283's output_artifact", () => {
  it("a null label is named by artifact_id, never the uri and never an invented word", () => {
    const { container } = render(<WorkflowCase case={served()} />);
    expect(q(container, "button[data-artifact]")!.textContent).toBe("AR-77");
  });
  it("the record's own label wins when served", () => {
    const art = { uri: "/cases/case-283/action", artifact_id: "AR-77", label: "Record L", released_at: "2026-11-07T09:01:00Z" };
    const { container } = render(<WorkflowCase case={served({ output_artifact: art })} />);
    expect(q(container, "button[data-artifact]")!.textContent).toBe("Record L");
  });
  it("null output_artifact (not released) is the absence", () => {
    const { container } = render(<WorkflowCase case={served({ output_artifact: null })} />);
    expect(q(container, "[data-artifact]")).toBeNull();
    expect(q(container, "[data-artifact-absent]")).not.toBeNull();
  });
});

describe("the offered options on a closed case", () => {
  it("stage closed: every served option is drawn, from the case's own key", () => {
    const { container } = render(<WorkflowCase case={served()} />);
    expect(q(container, "[data-options]")!.getAttribute("data-options-source")).toBe("case");
    expect(container.querySelectorAll("[data-option]")).toHaveLength(BASE.options!.length);
    expect(q(container, "[data-options-absent]")).toBeNull();
  });
  it("the declaration they ran under is drawn as served: id and version", () => {
    const { container } = render(<WorkflowCase case={served()} />);
    expect(q(container, "[data-options-declaration]")!.textContent).toBe("decl-x · 3");
  });
  it("a null declaration (a row before the runner stamped it) is said, not hidden", () => {
    const { container } = render(<WorkflowCase case={served({ options_declaration: null })} />);
    expect(q(container, "[data-options-declaration]")).toBeNull();
    expect(q(container, "[data-options-declaration-absent]")).not.toBeNull();
  });
  it("an absent declaration (a BFF older than #283) draws neither line", () => {
    const body = served();
    delete body.options_declaration;
    const { container } = render(<WorkflowCase case={body} />);
    expect(q(container, "[data-options-declaration]")).toBeNull();
    expect(q(container, "[data-options-declaration-absent]")).toBeNull();
  });
});

describe("the case's own stage, top level", () => {
  it("is drawn verbatim in the top line", () => {
    const { container } = render(<WorkflowCase case={served({ stage: "attached" })} />);
    expect(q(container, '[data-topline="case-stage"]')!.textContent).toBe("attached");
  });
  it("absent (a BFF older than #283): no case-stage span", () => {
    const body = served();
    delete body.stage;
    const { container } = render(<WorkflowCase case={body} />);
    expect(q(container, '[data-topline="case-stage"]')).toBeNull();
  });
});

describe("the guard, on #283's new fields", () => {
  const ok = JSON.parse(JSON.stringify(served()));
  it("accepts the served body", () => expect(readWorkflowCasePayload(ok).ok).toBe(true));
  it("refuses an artifact with no uri", () =>
    expect(readWorkflowCasePayload({ ...ok, output_artifact: { artifact_id: "AR-77" } })).toEqual({
      ok: false,
      detail: "output_artifact.uri is not a non-empty string",
    }));
  it("refuses a numeric artifact_id", () =>
    expect(readWorkflowCasePayload({ ...ok, output_artifact: { ...ok.output_artifact, artifact_id: 7 } }).ok).toBe(false));
  it("refuses an empty stage", () =>
    expect(readWorkflowCasePayload({ ...ok, stage: "" })).toEqual({ ok: false, detail: "stage is not a non-empty string" }));
  it("refuses a non-object options_declaration", () =>
    expect(readWorkflowCasePayload({ ...ok, options_declaration: "decl-x" }).ok).toBe(false));
});

describe("the opening row's label, against #321's top-level intake", () => {
  // The sample Lane 01 sent (11-09) is `intake: reported`; any served word is drawn verbatim.
  const LABEL = "reported";
  it("served: the case's own first row is labelled in the list and in the pane", () => {
    const { container } = render(<WorkflowCase case={served({ intake: LABEL })} />);
    expect(q(container, '[data-case-row="0"] [data-case-row-intake]')!.textContent).toBe(`${LABEL} · `);
    expect(q(container, "[data-case-pane-intake]")!.textContent).toBe(LABEL);
    expect(q(container, "[data-case-pane-step-absent]")).toBeNull();
  });
  it("any word: the card spells none of its own", () => {
    const { container } = render(<WorkflowCase case={served({ intake: "lbl-x" })} />);
    expect(q(container, "[data-case-pane-intake]")!.textContent).toBe("lbl-x");
  });
  it("absent (a trigger that declares none, or a case opened before the stamp): no step recorded, no label", () => {
    const { container } = render(<WorkflowCase case={served()} />);
    expect(q(container, "[data-case-pane-intake]")).toBeNull();
    expect(q(container, "[data-case-row-intake]")).toBeNull();
    expect(q(container, "[data-case-pane-step-absent]")).not.toBeNull();
  });
  it("an instance's row is never the opening row: selecting it draws no label", () => {
    const { container } = render(<WorkflowCase case={served({ intake: LABEL })} />);
    fireEvent.click(q(container, '[data-case-row="1"]')!);
    expect(q(container, "[data-case-pane-intake]")).toBeNull();
    expect(container.querySelectorAll("[data-case-row-intake]")).toHaveLength(1);
  });
  it("a case-id row AFTER the first instance's rows is not the opening row", () => {
    const history = [
      { at: "2026-11-07T09:00:01Z", workflow_id: WF, event: "decided", stage: "closed", actor: "alex" },
      { at: "2026-11-07T09:00:02Z", workflow_id: "case-283", event: "e2", stage: "s2", actor: "system" },
    ];
    const { container } = render(<WorkflowCase case={served({ intake: LABEL, history })} />);
    expect(q(container, "[data-case-row-intake]")).toBeNull();
    fireEvent.click(q(container, '[data-case-row="1"]')!);
    expect(q(container, "[data-case-pane-intake]")).toBeNull();
  });
  it("a subject_ref that names an instance has no opening row of its own", () => {
    const { container } = render(<WorkflowCase case={served({ intake: LABEL, subject_ref: WF })} />);
    expect(q(container, "[data-case-row-intake]")).toBeNull();
    expect(q(container, "[data-case-pane-intake]")).toBeNull();
  });
  it("only the FIRST case-id row before the instances is labelled", () => {
    const history = [
      { at: "2026-11-07T09:00:00Z", workflow_id: "case-283", event: "e0", stage: "s0", actor: "system" },
      { at: "2026-11-07T09:00:00Z", workflow_id: "case-283", event: "e1", stage: "s1", actor: "system" },
      { at: "2026-11-07T09:00:01Z", workflow_id: WF, event: "decided", stage: "closed", actor: "alex" },
    ];
    const { container } = render(<WorkflowCase case={served({ intake: LABEL, history })} />);
    const labelled = [...container.querySelectorAll("[data-case-row-intake]")].map((el) => el.closest("[data-case-row]")!.getAttribute("data-case-row"));
    expect(labelled).toEqual(["0"]);
  });
  const ok = JSON.parse(JSON.stringify(served()));
  it("the guard refuses an empty intake (served never as \"\")", () =>
    expect(readWorkflowCasePayload({ ...ok, intake: "" })).toEqual({ ok: false, detail: "intake is not a non-empty string" }));
  it("the guard refuses a null intake (the key is omitted, never null)", () =>
    expect(readWorkflowCasePayload({ ...ok, intake: null }).ok).toBe(false));
  it("the guard accepts a served intake", () => expect(readWorkflowCasePayload({ ...ok, intake: LABEL }).ok).toBe(true));
});
