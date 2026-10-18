import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, cleanup, screen, act, fireEvent } from "@testing-library/react";

const fetchCase = vi.fn();
vi.mock("@/lib/cases", () => ({ fetchCase: (...a: unknown[]) => fetchCase(...a) }));
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

const task = (id: string, taskId: string): HumanTask =>
  ({ id, taskId, workflowId: null, audience: "a", kind: "k", status: "pending", title: "t", summary: "s",
    requestedBy: "r", subjectRef: null, createdAt: 0 }) as HumanTask;
const approval = (taskId?: string) => ({
  workflow_id: "w", step_id: "s", status: "pending", ...(taskId ? { task: { task_id: taskId } } : {}),
});
const ok = (approvals: unknown[]) => ({ ok: true, payload: { approvals } });
const go = (path: string) => window.history.replaceState({}, "", path);
const flush = () => act(async () => { await Promise.resolve(); await Promise.resolve(); });

beforeEach(() => {
  fetchCase.mockReset();
  useHumanTaskStore.setState({ tasks: [] });
  useComposerPrefillStore.setState({ text: null });
  useCanvasStore.getState().setCurrentArtifact("other");
  useStageStore.setState({ fullPane: false, focusId: null });
});
afterEach(() => { cleanup(); go("/"); });

describe("DeepLinkLanding /case", () => {
  it("a: one held + task in store opens it, no panel, URL consumed", async () => {
    useHumanTaskStore.setState({ tasks: [task("row1", "T1")] });
    fetchCase.mockResolvedValue(ok([approval("T1")]));
    go("/case/C1");
    render(<DeepLinkLanding />);
    await flush();
    expect(fetchCase).toHaveBeenCalledWith("C1");
    expect(useCanvasStore.getState().currentArtifactId).toBe(taskArtifactId("row1"));
    expect(useStageStore.getState().fullPane).toBe(true);
    // The stage focuses the ARTIFACT id, as onCardDouble does — not the store row id.
    expect(useStageStore.getState().focusId).toBe(taskArtifactId("row1"));
    expect(document.querySelector("[data-deep-link-panel]")).toBeNull();
    expect(window.location.pathname).toBe("/");
  });

  // Each of the two "pending" conditions on its own: the near side of each branch.
  it("a decided approval that still carries a task opens nothing", async () => {
    useHumanTaskStore.setState({ tasks: [task("row1", "T1")] });
    fetchCase.mockResolvedValue(ok([{ ...approval("T1"), status: "decided" }]));
    go("/case/C1");
    render(<DeepLinkLanding />);
    await flush();
    expect(document.querySelector('[data-case-link="case"]')).not.toBeNull();
    expect(useStageStore.getState().fullPane).toBe(false);
    expect(useCanvasStore.getState().currentArtifactId).toBe("other");
  });

  it("a held task whose store row is no longer pending opens nothing", async () => {
    useHumanTaskStore.setState({ tasks: [{ ...task("row1", "T1"), status: "approved" } as HumanTask] });
    fetchCase.mockResolvedValue(ok([approval("T1")]));
    go("/case/C1");
    render(<DeepLinkLanding />);
    await flush();
    expect(document.querySelector('[data-case-link="case"]')).not.toBeNull();
    expect(useStageStore.getState().fullPane).toBe(false);
    expect(useCanvasStore.getState().currentArtifactId).toBe("other");
  });

  it("b: task arrives after the case loaded: panel, then opened and closed", async () => {
    fetchCase.mockResolvedValue(ok([approval("T1")]));
    go("/case/C1");
    render(<DeepLinkLanding />);
    await flush();
    expect(document.querySelector('[data-case-link="case"]')).not.toBeNull();
    expect(useStageStore.getState().fullPane).toBe(false);
    act(() => useHumanTaskStore.setState({ tasks: [task("row1", "T1")] }));
    expect(useCanvasStore.getState().currentArtifactId).toBe(taskArtifactId("row1"));
    expect(useStageStore.getState().fullPane).toBe(true);
    expect(document.querySelector("[data-deep-link-panel]")).toBeNull();
  });

  it("c: zero held shows a read-only panel; Esc closes it", async () => {
    fetchCase.mockResolvedValue(ok([approval()]));
    go("/case/C1");
    render(<DeepLinkLanding />);
    await flush();
    expect(document.querySelector('[data-case-link="case"]')).not.toBeNull();
    const buttons = screen.getAllByRole("button");
    expect(buttons).toHaveLength(1);
    expect(buttons[0].getAttribute("aria-label")).toBe("Close case");
    fireEvent.keyDown(window, { key: "Escape" });
    expect(document.querySelector("[data-deep-link-panel]")).toBeNull();
  });

  it("d: two held shows the panel and opens nothing", async () => {
    useHumanTaskStore.setState({ tasks: [task("row1", "T1"), task("row2", "T2")] });
    fetchCase.mockResolvedValue(ok([approval("T1"), approval("T2")]));
    go("/case/C1");
    render(<DeepLinkLanding />);
    await flush();
    expect(document.querySelector('[data-case-link="case"]')).not.toBeNull();
    expect(useStageStore.getState().fullPane).toBe(false);
    expect(useCanvasStore.getState().currentArtifactId).toBe("other");
  });

  it.each([
    [{ ok: false, reason: "not_found" }, "absent", "No case C1 that you can see."],
    [{ ok: false, reason: "runner_unavailable" }, "unavailable", "The case service is unavailable. Try the link again shortly."],
    [{ ok: false, reason: "http_500" }, "error", "Could not read case C1 (http_500)."],
  ])("e: %j", async (res, attr, text) => {
    fetchCase.mockResolvedValue(res);
    go("/case/C1");
    render(<DeepLinkLanding />);
    await flush();
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
