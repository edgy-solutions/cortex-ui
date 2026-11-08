/**
 * The case panel against `GET /cases/{id}` as invincible-agent #283 serves it (live in 0.4.81). The body
 * below is built field by field from `project_workflow_case` in `src/iagent/case_projection.py` at
 * c3b51ed7: history rows carry no `step_id`, the case's own transitions are attributed to the case id,
 * `output_artifact` is `{uri, artifact_id, label, released_at}` with `label` null when the record has none,
 * and `options` + `options_declaration` are served on a CLOSED case. It goes through the real guard first.
 */
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render } from "@testing-library/react";
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
