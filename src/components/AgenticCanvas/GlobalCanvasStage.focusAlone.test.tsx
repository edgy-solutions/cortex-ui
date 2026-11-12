/**
 * A focused card is ALONE on the stage.
 *
 * Chris's screenshots (2026-11-11): zoomed onto "PCN#20210316000.1", the neighbours' centred titles
 * ("Review 17 affected part(s) - notice OV-19-05", "PCN26-185 ... complete - 32d ago") showed through its
 * translucent glass face, magnified, because the other cards were only dimmed to opacity 0.4. The global
 * arrangement labels (26px in world space) bled through the same way.
 *
 * Mounted the way GlobalCanvasStage.lazy.test.tsx mounts it. jsdom cannot see a pixel, so this reads the
 * inline style the stage gives each root: visibility AND opacity, and it counts the visible roots.
 */
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, cleanup, act } from "@testing-library/react";
import type { Artifact } from "@/api/types";

vi.mock("@/components/elicitation/AskedSection", () => ({ AskedSection: () => null }));
vi.mock("./AnswerBody", () => ({ AnswerBody: () => <div data-testid="answer-body" /> }));
vi.mock("./CanvasPane", () => ({ CanvasPane: () => null }));
vi.mock("./DockBar", () => ({ DockBar: () => null }));
vi.mock("./PlanningChrome", () => ({ PlanningChrome: () => null }));
vi.mock("./CanvasExportButton", () => ({ CanvasExportButton: () => null }));
vi.mock("@/api/client", async (orig) => ({
  ...(await orig<object>()),
  fetchLineageEdges: vi.fn().mockResolvedValue([]),
  fetchCanvases: vi.fn().mockResolvedValue([]),
  saveCanvases: vi.fn().mockResolvedValue(undefined),
}));

import { GlobalCanvasStage } from "./GlobalCanvasStage";
import { useCanvasStore } from "@/store/useCanvasStore";
import { useStageStore } from "@/store/useStageStore";
import { useAnswerPanelStore } from "@/store/useAnswerPanelStore";

beforeEach(() => {
  Object.defineProperty(HTMLElement.prototype, "clientWidth", { configurable: true, get: () => 1200 });
  Object.defineProperty(HTMLElement.prototype, "clientHeight", { configurable: true, get: () => 700 });
  vi.stubGlobal(
    "ResizeObserver",
    class {
      cb: () => void;
      constructor(cb: () => void) {
        this.cb = cb;
      }
      observe() {
        this.cb();
      }
      disconnect() {}
      unobserve() {}
    },
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  useCanvasStore.setState({ artifacts: [], currentArtifactId: null });
  useStageStore.setState({ focusId: null, fullPane: false, view: "global", groupKey: null });
  useAnswerPanelStore.setState({ sortMode: "TIME" });
});

const base = (id: string, title: string, i: number): Artifact =>
  ({
    id,
    status: "complete",
    created_at: 1_700_000_000_000 - i * 3_600_000,
    watermark: 0,
    question_text: title,
    summary: title,
    rendered_output: { archetype: "MULTI_SERIES", components: [{ archetype: "MULTI_SERIES", rows: [] }] },
    routing: { about: { instance_resolved: false, label: "Program" } },
  }) as unknown as Artifact;

const taskArtifact = (id: string, title: string, i: number): Artifact =>
  ({
    ...base(id, title, i),
    task_ref: {
      taskId: `t-${i}`,
      workflowId: null,
      kind: "disposition_review",
      task_state: "pending",
      audience: "SAFETY_ENGINEER",
      requestedBy: "mesh",
      subjectRef: null,
    },
  }) as unknown as Artifact;

const FOCUSED = "task:focused";
const seed = () =>
  useCanvasStore.setState({
    artifacts: [
      taskArtifact(FOCUSED, "Review 1 affected part(s) — notice PCN#20210316000.1", 0),
      taskArtifact("task:neighbour", "Review 17 affected part(s) — notice OV-19-05", 1),
      base("ans-pcn26", "PCN26-185 · which Parts Does This Notice Affect", 2),
    ],
    currentArtifactId: null,
  });

const roots = () => [...document.querySelectorAll<HTMLElement>("[data-answer-id]")];
const dots = () => [...document.querySelectorAll<HTMLElement>("[data-stage-dot]")];
const visible = (el: HTMLElement) => el.style.visibility !== "hidden" && el.style.opacity !== "0";
const labels = () => [...document.querySelectorAll<HTMLElement>("[data-group-label]")];

describe("a focused card is alone on the stage (Chris's PCN#20210316000.1 screen)", () => {
  it("arm 1, no focus: every card root is visible", () => {
    seed();
    render(<GlobalCanvasStage />);
    expect(roots().length + dots().length).toBe(3);
    for (const el of [...roots(), ...dots()]) expect(visible(el), "an unfocused card must be visible").toBe(true);
  });

  it("arm 2, focus the first: exactly one root is visible, the focused one; the rest are hidden at opacity 0; no label shows", () => {
    seed();
    render(<GlobalCanvasStage />);
    act(() => useStageStore.getState().focus(FOCUSED));
    const all = roots();
    expect(all.length).toBeGreaterThanOrEqual(1);
    const shown = all.filter(visible);
    expect(shown, "exactly one card may be visible while one is focused").toHaveLength(1);
    expect(shown[0].getAttribute("data-answer-id")).toBe(FOCUSED);
    for (const el of all.filter((e) => e !== shown[0])) {
      expect(el.style.visibility).toBe("hidden");
      expect(el.style.opacity).toBe("0");
      expect(el.style.pointerEvents).toBe("none");
    }
    expect(labels().filter(visible), "arrangement labels bled through the glass face too").toHaveLength(0);
  });

  it("arm 3, unfocus: every card is visible again", () => {
    seed();
    render(<GlobalCanvasStage />);
    act(() => useStageStore.getState().focus(FOCUSED));
    act(() => useStageStore.getState().clearFocus());
    expect(roots().length + dots().length).toBe(3);
    for (const el of [...roots(), ...dots()]) expect(visible(el)).toBe(true);
  });
});

// StageDot: not sealed here. Focusing zooms the camera in, and the stage then culls every dot out of the DOM
// (checked: 300 answers, one focused, zero [data-stage-dot] mounted), so a dot cannot be observed hidden in jsdom.
// The dot still gets the same style, from the same goneStyle, in GlobalCanvasStage.tsx.
