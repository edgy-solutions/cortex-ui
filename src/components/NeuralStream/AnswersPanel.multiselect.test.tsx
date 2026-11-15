/**
 * The answers list's multi-select: Ctrl/Cmd-click toggles, Shift-click ranges, a plain click clears it and
 * selects as before. The bar is the stage lasso's own `SelectionActionBar`, wired by the SAME
 * `useSelectionActions` hook (never a copy), so "Add to / New / Export as…" mean what they mean on the lasso.
 */
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, cleanup, fireEvent, within } from "@testing-library/react";
import type { Artifact } from "@/api/types";

vi.mock("./LiveAnswerStrip", () => ({ LiveAnswerStrip: () => null }));
vi.mock("./useLiveStages", () => ({ useLiveStages: () => ({ active: false }) }));
const canExport = vi.hoisted(() => ({ value: true }));
vi.mock("@/lib/useCanExportSelection", () => ({ useCanExportSelection: () => canExport.value }));

import { AnswersPanel } from "./AnswersPanel";
import { useCanvasStore } from "@/store/useCanvasStore";
import { useAnswerPanelStore } from "@/store/useAnswerPanelStore";
import { useStageStore } from "@/store/useStageStore";

const NOW = Date.UTC(2026, 9, 16, 12, 0, 0);
const answer = (i: number): Artifact =>
  ({
    id: `a-${i}`,
    status: "complete",
    created_at: NOW - i * 120_000,
    watermark: 0,
    question_text: `question ${i}`,
    summary: `summary ${i}`,
    // Even ids are a second archetype, so TYPE mode groups them apart: screen order differs from data order.
    rendered_output: (() => {
      const arch = i % 2 ? "MULTI_SERIES" : "KNOWLEDGE_DOCUMENT";
      return { archetype: arch, components: [{ archetype: arch, rows: [] }] };
    })(),
  }) as unknown as Artifact;

const addItemAuto = vi.fn();
const createCanvas = vi.fn(() => "new-1");

beforeEach(() => {
  canExport.value = true;
  addItemAuto.mockClear();
  createCanvas.mockClear();
  useCanvasStore.setState({ artifacts: [1, 2, 3, 4].map(answer), currentArtifactId: null });
  useAnswerPanelStore.setState({ sortMode: "TIME", search: "" });
  useStageStore.setState({
    canvases: [{ id: "X", name: "Board", items: [] }],
    addItemAuto,
    createCanvas,
  } as never);
});
afterEach(() => {
  cleanup();
  useCanvasStore.setState({ artifacts: [], currentArtifactId: null });
});

const row = (c: HTMLElement, id: string) => c.querySelector(`[data-answer-row="${id}"]`) as HTMLElement;
const selectedIds = (c: HTMLElement) =>
  Array.from(c.querySelectorAll('[data-answer-row][data-selected="true"]')).map((e) => e.getAttribute("data-answer-row"));
const press = (el: HTMLElement, mods: Record<string, boolean> = {}) => {
  fireEvent.pointerDown(el, { button: 0, clientX: 5, clientY: 5, ...mods });
  fireEvent.pointerUp(document, { clientX: 5, clientY: 5, ...mods });
};

describe("answers list multi-select", () => {
  it("L1: Ctrl-click two rows, Cmd-click toggles one off, a plain click clears AND selects as before", () => {
    const { container } = render(<AnswersPanel />);
    press(row(container, "a-1"), { ctrlKey: true });
    press(row(container, "a-3"), { ctrlKey: true });
    expect(selectedIds(container).sort()).toEqual(["a-1", "a-3"]);
    expect(row(container, "a-1").getAttribute("aria-selected")).toBe("true");
    press(row(container, "a-1"), { metaKey: true });
    expect(selectedIds(container)).toEqual(["a-3"]);
    press(row(container, "a-2"));
    expect(selectedIds(container)).toEqual([]);
    expect(useCanvasStore.getState().currentArtifactId).toBe("a-2");
  });

  it("L2: Shift-click selects the range from the last toggled row, in list order", () => {
    const { container } = render(<AnswersPanel />);
    press(row(container, "a-1"), { ctrlKey: true });
    press(row(container, "a-3"), { shiftKey: true });
    expect(selectedIds(container)).toEqual(["a-1", "a-2", "a-3"]);
  });

  it("L2 (TYPE): Shift-click ranges over the rows as DRAWN, not the data order", () => {
    useAnswerPanelStore.setState({ sortMode: "TYPE" });
    const { container } = render(<AnswersPanel />);
    const drawn = Array.from(container.querySelectorAll("[data-answer-row]")).map((e) => e.getAttribute("data-answer-row"));
    // The arm can fail only if the two orders differ.
    expect(drawn).not.toEqual(["a-1", "a-2", "a-3", "a-4"]);
    expect(drawn.slice().sort()).toEqual(["a-1", "a-2", "a-3", "a-4"]);
    press(row(container, drawn[0]!), { ctrlKey: true });
    press(row(container, drawn[2]!), { shiftKey: true });
    expect(selectedIds(container).sort()).toEqual(drawn.slice(0, 3).sort());
  });

  it("L8: dragging a selected row pins every selected id in screen order; an unselected row pins only itself", () => {
    useAnswerPanelStore.setState({ sortMode: "TYPE" });
    const pinAnswer = vi.fn();
    const setCanvasOpen = vi.fn();
    useAnswerPanelStore.setState({ pinAnswer, setCanvasOpen, pins: [{ id: "p0" }] } as never);
    const { container } = render(<AnswersPanel />);
    const zone = document.createElement("div");
    zone.setAttribute("data-canvas-dropzone", "");
    zone.getBoundingClientRect = () => ({ left: 0, top: 0, right: 1000, bottom: 1000 }) as DOMRect;
    document.body.appendChild(zone);
    const drawn = Array.from(container.querySelectorAll("[data-answer-row]")).map((e) => e.getAttribute("data-answer-row")!);
    expect(drawn).not.toEqual(["a-1", "a-2", "a-3", "a-4"]);
    const drag = (id: string) => {
      fireEvent.pointerDown(row(container, id), { button: 0, clientX: 5, clientY: 5 });
      fireEvent.pointerMove(document, { clientX: 60, clientY: 60 });
      fireEvent.pointerUp(document, { clientX: 60, clientY: 60 });
    };
    press(row(container, drawn[3]!), { ctrlKey: true });
    press(row(container, drawn[1]!), { ctrlKey: true });
    drag(drawn[1]!);
    // pins.length is 1, so the cascade continues at n = 1, 2.
    expect(pinAnswer.mock.calls).toEqual([
      [drawn[1], 62, 62],
      [drawn[3], 92, 92],
    ]);
    expect(setCanvasOpen).toHaveBeenCalledTimes(1);
    expect(selectedIds(container)).toEqual([]);
    pinAnswer.mockClear();
    press(row(container, drawn[3]!), { ctrlKey: true });
    drag(drawn[0]!);
    expect(pinAnswer.mock.calls).toEqual([[drawn[0], 62, 62]]);
    expect(selectedIds(container)).toEqual([drawn[3]]);
    zone.remove();
  });

  it("L3: the bar shows iff at least one row is selected; Escape clears", () => {
    const { container } = render(<AnswersPanel />);
    expect(container.querySelector("[data-export-as]")).toBeNull();
    expect(container.textContent).not.toContain("selected → Add to");
    press(row(container, "a-2"), { ctrlKey: true });
    expect(container.textContent).toContain("1 selected → Add to");
    fireEvent.keyDown(document, { key: "Escape" });
    expect(selectedIds(container)).toEqual([]);
    expect(container.textContent).not.toContain("selected → Add to");
  });

  it("L4: Add to canvas X adds each selected id in list order, then clears", () => {
    const { container } = render(<AnswersPanel />);
    press(row(container, "a-3"), { ctrlKey: true });
    press(row(container, "a-1"), { ctrlKey: true });
    fireEvent.click(within(container).getByText("Board"));
    expect(addItemAuto.mock.calls).toEqual([["X", "a-1"], ["X", "a-3"]]);
    expect(selectedIds(container)).toEqual([]);
  });

  it("L4 (TYPE): Add to canvas and New add the selection in the order the rows are DRAWN", () => {
    useAnswerPanelStore.setState({ sortMode: "TYPE" });
    const { container } = render(<AnswersPanel />);
    const drawn = Array.from(container.querySelectorAll("[data-answer-row]")).map((e) => e.getAttribute("data-answer-row")!);
    // The arm can fail only if the two orders differ.
    expect(drawn).not.toEqual(["a-1", "a-2", "a-3", "a-4"]);
    const selectAll = () => ["a-1", "a-2", "a-3", "a-4"].forEach((id) => press(row(container, id), { ctrlKey: true }));
    selectAll();
    fireEvent.click(within(container).getByText("Board"));
    expect(addItemAuto.mock.calls.map((c) => c[1])).toEqual(drawn);
    addItemAuto.mockClear();
    selectAll();
    fireEvent.click(within(container).getByText("New"));
    expect(addItemAuto.mock.calls.map((c) => c[1])).toEqual(drawn);
  });

  it("L5: New creates one canvas, then adds each id", () => {
    const { container } = render(<AnswersPanel />);
    press(row(container, "a-1"), { ctrlKey: true });
    press(row(container, "a-2"), { ctrlKey: true });
    fireEvent.click(within(container).getByText("New"));
    expect(createCanvas).toHaveBeenCalledTimes(1);
    expect(addItemAuto.mock.calls).toEqual([["new-1", "a-1"], ["new-1", "a-2"]]);
  });

  it("L6: Export as… is absent when the lasso would hide it, present when it shows and opens the dialog", () => {
    canExport.value = false;
    const off = render(<AnswersPanel />);
    press(row(off.container, "a-1"), { ctrlKey: true });
    expect(off.container.querySelector("[data-export-as]")).toBeNull();
    cleanup();
    canExport.value = true;
    const on = render(<AnswersPanel />);
    press(row(on.container, "a-1"), { ctrlKey: true });
    press(row(on.container, "a-2"), { ctrlKey: true });
    fireEvent.click(on.container.querySelector("[data-export-as]")!);
    const dlg = document.querySelector("[data-export-dialog]");
    expect(dlg).not.toBeNull();
    // L7: portaled to body, not left inside the panel.
    expect(dlg!.parentElement).toBe(document.body);
    expect(dlg!.textContent).toContain("2 selected");
  });
});
