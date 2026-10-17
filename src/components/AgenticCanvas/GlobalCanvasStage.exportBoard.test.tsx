/**
 * The stage hands export THE BOARD it draws, never the canvas store (Chris's ruling, directive item
 * 4: "856 answers for a 3-card board is a bug"). The button is stubbed to record its `board` prop;
 * everything above it (stores, layout, entries) is real.
 */
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, cleanup } from "@testing-library/react";
import type { Artifact } from "@/api/types";

const boards: string[][] = [];
vi.mock("@/components/elicitation/AskedSection", () => ({ AskedSection: () => null }));
vi.mock("./AnswerBody", () => ({ AnswerBody: () => null }));
vi.mock("./CanvasPane", () => ({ CanvasPane: () => null }));
vi.mock("./DockBar", () => ({ DockBar: () => null }));
vi.mock("./PlanningChrome", () => ({ PlanningChrome: () => null }));
vi.mock("./CanvasExportButton", () => ({
  CanvasExportButton: ({ board }: { board: { id: string }[] }) => {
    boards.push(board.map((a) => a.id));
    return null;
  },
}));
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
  boards.length = 0;
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
  useStageStore.setState({ focusId: null, fullPane: false, view: "global", groupKey: null, canvases: [] });
  useAnswerPanelStore.setState({ sortMode: "TIME" });
});

const answer = (i: number): Artifact =>
  ({
    id: `ans-${i}`,
    status: "complete",
    created_at: 1_700_000_000_000 - i * 3_600_000,
    watermark: 0,
    question_text: `question ${i}`,
    summary: `summary ${i}`,
    rendered_output: { archetype: "MULTI_SERIES", components: [{ archetype: "MULTI_SERIES", rows: [] }] },
    routing: { about: { instance_resolved: false, label: "Program" } },
  }) as unknown as Artifact;

const lastBoard = () => boards[boards.length - 1];

describe("export is handed the board, not the store", () => {
  it("a 3-card canvas over an 856-answer store: the button gets exactly those 3, in the canvas's order", () => {
    useCanvasStore.setState({ artifacts: Array.from({ length: 856 }, (_, i) => answer(i)), currentArtifactId: null });
    useStageStore.setState({
      canvases: [{ id: "walk", name: "walk", items: [{ id: "ans-12", x: 0, y: 0 }, { id: "ans-3", x: 400, y: 0 }, { id: "ans-700", x: 800, y: 0 }] }],
      view: "walk",
    });
    render(<GlobalCanvasStage />);
    expect(lastBoard()).toEqual(["ans-12", "ans-3", "ans-700"]);
  });

  it("a canvas slot whose answer is not in the store is not drawn, and not sent", () => {
    useCanvasStore.setState({ artifacts: [answer(1), answer(2)], currentArtifactId: null });
    useStageStore.setState({
      canvases: [{ id: "walk", name: "walk", items: [{ id: "ans-1", x: 0, y: 0 }, { id: "gone", x: 400, y: 0 }] }],
      view: "walk",
    });
    render(<GlobalCanvasStage />);
    expect(lastBoard()).toEqual(["ans-1"]);
  });

  it("the global view: the board is every card global draws", () => {
    useCanvasStore.setState({ artifacts: [answer(1), answer(2), answer(3)], currentArtifactId: null });
    render(<GlobalCanvasStage />);
    expect([...lastBoard()].sort()).toEqual(["ans-1", "ans-2", "ans-3"]);
  });
});
