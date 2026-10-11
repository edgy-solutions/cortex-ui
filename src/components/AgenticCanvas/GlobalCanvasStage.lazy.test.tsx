/**
 * B + C through the real stage: the board culls to the camera, and edges are lazy on open.
 *
 * Everything above the stage is real (stores, layout, edges, StageCard); only the heavy leaves
 * (AnswerBody, the full-pane CanvasPane, the dock) are stubbed, and AnswerBody is the counter.
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
  // a 1200 x 700 pane; jsdom measures 0 x 0 by default
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

const answer = (i: number, subject: string | null = null): Artifact =>
  ({
    id: `ans-${i}`,
    status: "complete",
    created_at: 1_700_000_000_000 - i * 3_600_000,
    watermark: 0,
    question_text: `question ${i}`,
    summary: `summary ${i}`,
    rendered_output: { archetype: "MULTI_SERIES", components: [{ archetype: "MULTI_SERIES", rows: [] }] },
    routing: subject
      ? { about: { instance_resolved: true, instance_identifier: subject, label: "Program" } }
      : { about: { instance_resolved: false, label: "Program" } },
  }) as unknown as Artifact;

const mounted = () => document.querySelectorAll("[data-answer-id], [data-stage-dot]").length;
const bodies = () => document.querySelectorAll('[data-testid="answer-body"]').length;

describe("the global stage culls to the camera", () => {
  it("2,000 answers, one focused: the mounted card count is small, not proportional to N", () => {
    const arts = Array.from({ length: 2000 }, (_, i) => answer(i));
    useCanvasStore.setState({ artifacts: arts, currentArtifactId: null });
    render(<GlobalCanvasStage />);
    act(() => useStageStore.getState().focus("ans-1000"));
    const n = mounted();
    expect(n).toBeGreaterThan(0);
    expect(n).toBeLessThan(120);
    // the focused card is mounted and is the only body
    expect(document.querySelector('[data-answer-id="ans-1000"]')).not.toBeNull();
    expect(bodies()).toBe(1);
  });

  it("fit-everything overview: unopened cards are one-element dots, no body anywhere", () => {
    const arts = Array.from({ length: 300 }, (_, i) => answer(i));
    useCanvasStore.setState({ artifacts: arts, currentArtifactId: null });
    render(<GlobalCanvasStage />);
    expect(document.querySelectorAll("[data-stage-dot]").length).toBeGreaterThan(200);
    expect(bodies()).toBe(0);
  });

  it("the current answer is always mounted with a body, wherever the camera is", () => {
    const arts = Array.from({ length: 300 }, (_, i) => answer(i));
    useCanvasStore.setState({ artifacts: arts, currentArtifactId: "ans-150" });
    render(<GlobalCanvasStage />);
    expect(document.querySelector('[data-answer-id="ans-150"]')).not.toBeNull();
    expect(bodies()).toBe(1);
  });
});

describe("GRAPH edges are lazy on open", () => {
  const arts = [
    ...Array.from({ length: 10 }, (_, i) => answer(i, "urn:s:shared")),
    ...Array.from({ length: 20 }, (_, i) => answer(100 + i)),
  ];
  const lines = () => document.querySelectorAll("svg line").length;

  it("none opened: 0 lines, although 10 answers share a subject", () => {
    useAnswerPanelStore.setState({ sortMode: "GRAPH" });
    useCanvasStore.setState({ artifacts: arts, currentArtifactId: null });
    render(<GlobalCanvasStage />);
    expect(lines()).toBe(0);
  });

  it("one opened: k-1 = 9 lines", () => {
    useAnswerPanelStore.setState({ sortMode: "GRAPH" });
    useCanvasStore.setState({ artifacts: arts, currentArtifactId: null });
    render(<GlobalCanvasStage />);
    act(() => useCanvasStore.setState({ currentArtifactId: "ans-3" }));
    expect(lines()).toBe(9);
  });
});
