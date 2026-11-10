import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, cleanup, screen, act, fireEvent } from "@testing-library/react";

const fetchCase = vi.fn();
// The REAL reader stays: the served fixtures below go through it, as fetchCase's do.
vi.mock("@/lib/cases", async (orig) => ({
  ...(await orig<typeof import("@/lib/cases")>()),
  fetchCase: (...a: unknown[]) => fetchCase(...a),
}));
// The real card is sealed elsewhere; here it only has to be handed the case. It is stubbed, so
// "read-only" below asserts that THIS panel adds no verb of its own.
vi.mock("@/components/registry/SemanticInterpreter", () => ({
  SemanticInterpreter: () => <div data-testid="interp" />,
}));

import { DeepLinkLanding } from "./DeepLinkLanding";
import { useHumanTaskStore, type HumanTask } from "@/store/useHumanTaskStore";
import { useCanvasStore } from "@/store/useCanvasStore";
import { useStageStore } from "@/store/useStageStore";
import { useComposerPrefillStore } from "@/store/useComposerPrefillStore";
import { taskArtifactId } from "@/lib/taskArtifact";
import { readWorkflowCasePayload } from "@/lib/cases";

// THE SERVED SHAPE (0.4.85 walk). The first version of this file handed the landing
// `approvals[].task`, which `case_projection.project_approvals` never serves ("omitted per the roll
// spec"), so every arm was green while the real link never opened a task. The case below is built as
// `project_workflow_case` builds it (instance ids `{case}~{n}`, approvals with no `task`), goes through
// the real reader as `fetchCase` does, and the viewer's tasks are store rows as `electricHumanTasks`
// maps them: `taskId` `{workflow_id}:{step_id}`, `workflowId` stamped.
const WF1 = "case-1~1";
const WF2 = "case-1~2";
const def = (step: string) => ({
  id: "def", name: "def", participants: [], domain_stages: [],
  steps: [{ id: step, kind: "human_await", title: step, audience: "aud:x" }],
});
const served = (approvals: unknown[]) => {
  const read = readWorkflowCasePayload(JSON.parse(JSON.stringify({
    subject_ref: "case-1",
    stage: "running",
    episode_id: "EP-1",
    episode_id_source: "event",
    predecessor: null,
    instances: [
      { workflow_id: WF1, definition: def("choose"), current_stage: null, status: "completed" },
      { workflow_id: WF2, definition: def("release"), current_stage: null, status: "running" },
    ],
    history: [],
    approvals,
    output_artifact: null,
  })));
  if (!read.ok) throw new Error(`the reader refused the served body: ${read.detail}`);
  return read;
};
const pendingOn = (wf: string, step: string) => ({ workflow_id: wf, step_id: step, status: "pending" });
const task = (id: string, wf: string | null, taskId: string, status: HumanTask["status"] = "pending"): HumanTask =>
  ({ id, taskId, workflowId: wf, audience: "a", kind: "k", status, title: "t", summary: "s",
    requestedBy: "r", subjectRef: null, createdAt: 0 }) as HumanTask;
const go = (path: string) => window.history.replaceState({}, "", path);
const flush = () => act(async () => { await Promise.resolve(); await Promise.resolve(); });
const land = async () => {
  go("/case/case-1");
  render(<DeepLinkLanding />);
  await flush();
};
const expectPanel = () => {
  expect(document.querySelector('[data-case-link="case"]')).not.toBeNull();
  expect(useStageStore.getState().fullPane).toBe(false);
  expect(useCanvasStore.getState().currentArtifactId).toBe("other");
};
const expectOpened = (rowId: string) => {
  expect(useCanvasStore.getState().currentArtifactId).toBe(taskArtifactId(rowId));
  expect(useStageStore.getState().fullPane).toBe(true);
  // The stage focuses the ARTIFACT id, as onCardDouble does — not the store row id.
  expect(useStageStore.getState().focusId).toBe(taskArtifactId(rowId));
  expect(document.querySelector("[data-deep-link-panel]")).toBeNull();
};

beforeEach(() => {
  fetchCase.mockReset();
  useHumanTaskStore.setState({ tasks: [] });
  useComposerPrefillStore.setState({ text: null });
  useCanvasStore.getState().setCurrentArtifact("other");
  useStageStore.setState({ fullPane: false, focusId: null });
});
afterEach(() => { cleanup(); go("/"); });

describe("DeepLinkLanding /case", () => {
  it("a: the served case carries no approvals[].task, and the viewer's held task opens anyway", async () => {
    const res = served([pendingOn(WF1, "choose")]);
    expect(res.ok && res.payload.approvals?.[0]?.task).toBeFalsy(); // the premise, from the reader
    useHumanTaskStore.setState({ tasks: [task("row1", WF1, `${WF1}:choose`)] });
    fetchCase.mockResolvedValue(res);
    await land();
    expect(fetchCase).toHaveBeenCalledWith("case-1");
    expectOpened("row1");
    expect(window.location.pathname).toBe("/");
  });

  it("a later step in the chain opens for the viewer who holds it (the releaser's link)", async () => {
    useHumanTaskStore.setState({ tasks: [task("row2", WF2, `${WF2}:release`)] });
    fetchCase.mockResolvedValue(served([{ ...pendingOn(WF1, "choose"), status: "decided" }, pendingOn(WF2, "release")]));
    await land();
    expectOpened("row2");
  });

  // Each condition of "held on THIS case" on its own: the near side of each branch.
  it("a held row that is no longer pending opens nothing", async () => {
    useHumanTaskStore.setState({ tasks: [task("row1", WF1, `${WF1}:choose`, "approved")] });
    fetchCase.mockResolvedValue(served([pendingOn(WF1, "choose")]));
    await land();
    expectPanel();
  });

  it("a pending task on ANOTHER case's instance opens nothing", async () => {
    useHumanTaskStore.setState({ tasks: [task("row9", "case-9~1", "case-9~1:choose")] });
    fetchCase.mockResolvedValue(served([pendingOn(WF1, "choose")]));
    await land();
    expectPanel();
  });

  it("the instance stamp without the id prefix, or the prefix without the stamp, opens nothing", async () => {
    useHumanTaskStore.setState({ tasks: [task("row1", WF1, "grouped-review-1"), task("row2", null, `${WF1}:choose`)] });
    fetchCase.mockResolvedValue(served([pendingOn(WF1, "choose")]));
    await land();
    expectPanel();
  });

  it("b: task arrives after the case loaded: panel, then opened and closed", async () => {
    fetchCase.mockResolvedValue(served([pendingOn(WF1, "choose")]));
    await land();
    expectPanel();
    act(() => useHumanTaskStore.setState({ tasks: [task("row1", WF1, `${WF1}:choose`)] }));
    expectOpened("row1");
  });

  it("c: nothing held shows a read-only panel; Esc closes it", async () => {
    fetchCase.mockResolvedValue(served([pendingOn(WF1, "choose")]));
    await land();
    expectPanel();
    const buttons = screen.getAllByRole("button");
    expect(buttons).toHaveLength(1);
    expect(buttons[0].getAttribute("aria-label")).toBe("Close case");
    fireEvent.keyDown(window, { key: "Escape" });
    expect(document.querySelector("[data-deep-link-panel]")).toBeNull();
  });

  it("d: two held shows the panel and opens nothing", async () => {
    useHumanTaskStore.setState({ tasks: [task("row1", WF1, `${WF1}:choose`), task("row2", WF2, `${WF2}:release`)] });
    fetchCase.mockResolvedValue(served([pendingOn(WF1, "choose"), pendingOn(WF2, "release")]));
    await land();
    expectPanel();
  });

  it.each([
    [{ ok: false, reason: "not_found" }, "absent", "No case case-1 that you can see."],
    [{ ok: false, reason: "runner_unavailable" }, "unavailable", "The case service is unavailable. Try the link again shortly."],
    [{ ok: false, reason: "http_500" }, "error", "Could not read case case-1 (http_500)."],
  ])("e: %j", async (res, attr, text) => {
    fetchCase.mockResolvedValue(res);
    await land();
    const el = document.querySelector(`[data-case-link="${attr}"]`);
    expect(el?.textContent).toBe(text);
  });
});

describe("DeepLinkLanding other paths", () => {
  it("f: /ask?q= offers the text and consumes the URL", () => {
    go("/ask?q=Why%20is%20X%3F");
    const { container } = render(<DeepLinkLanding />);
    expect(useComposerPrefillStore.getState().text).toBe("Why is X?");
    expect(window.location.pathname + window.location.search).toBe("/");
    expect(container.innerHTML).toBe("");
    expect(fetchCase).not.toHaveBeenCalled();
  });

  it("g: non-link paths render nothing and leave the URL alone", () => {
    for (const p of ["/", "/elsewhere"]) {
      go(p);
      const { container, unmount } = render(<DeepLinkLanding />);
      expect(container.innerHTML).toBe("");
      expect(window.location.pathname).toBe(p);
      unmount();
    }
    expect(fetchCase).not.toHaveBeenCalled();
  });
});
