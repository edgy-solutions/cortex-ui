/**
 * The stage's locked scrolls are pinned (2026-11-16). While a card owns the camera the stage root and its
 * [data-stage-scroll] scroller are overflow hidden, so a scroll there (a browser scrollIntoView) can never be
 * undone by the viewer. Both snap back to 0; a free board still scrolls legitimately.
 */
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, cleanup, act, fireEvent } from "@testing-library/react";
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

const art = (id: string, i: number): Artifact =>
  ({
    id,
    status: "complete",
    created_at: 1_700_000_000_000 - i * 3_600_000,
    watermark: 0,
    question_text: id,
    summary: id,
    rendered_output: { archetype: "MULTI_SERIES", components: [{ archetype: "MULTI_SERIES", rows: [] }] },
    routing: { about: { instance_resolved: false, label: "Program" } },
  }) as unknown as Artifact;

const seed = () => useCanvasStore.setState({ artifacts: [art("a1", 0), art("a2", 1)], currentArtifactId: null });
const scroller = () => document.querySelector<HTMLElement>("[data-stage-scroll]")!;

describe("stage scroll pin", () => {
  it("a card owns the camera: the inner scroller snaps back to 0", () => {
    seed();
    render(<GlobalCanvasStage />);
    act(() => useStageStore.getState().focus("a1"));
    const s = scroller();
    s.scrollTop = 120;
    s.scrollLeft = 40;
    fireEvent.scroll(s);
    expect(s.scrollTop).toBe(0);
    expect(s.scrollLeft).toBe(0);
  });
  it("a card owns the camera: the stage root snaps back to 0", () => {
    seed();
    render(<GlobalCanvasStage />);
    act(() => useStageStore.getState().focus("a1"));
    const root = scroller().parentElement!;
    root.scrollTop = 120;
    root.scrollLeft = 40;
    fireEvent.scroll(root);
    expect(root.scrollTop).toBe(0);
    expect(root.scrollLeft).toBe(0);
  });
  it("free camera: the scroller keeps its scroll", () => {
    seed();
    render(<GlobalCanvasStage />);
    const s = scroller();
    s.scrollTop = 120;
    fireEvent.scroll(s);
    expect(s.scrollTop).toBe(120);
  });
});
