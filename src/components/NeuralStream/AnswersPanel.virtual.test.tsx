/**
 * D. THE ANSWERS LIST IS WINDOWED, and E. its search reads summary fields only.
 *
 * 10,000 answers must render a window, not 10,000 rows; scrolling moves the window; a click on a
 * row still selects it.
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, cleanup, fireEvent, act } from "@testing-library/react";
import type { Artifact } from "@/api/types";

vi.mock("./LiveAnswerStrip", () => ({ LiveAnswerStrip: () => null }));
vi.mock("./useLiveStages", () => ({ useLiveStages: () => ({ active: false }) }));

import { AnswersPanel } from "./AnswersPanel";
import { useCanvasStore } from "@/store/useCanvasStore";
import { useAnswerPanelStore } from "@/store/useAnswerPanelStore";

afterEach(() => {
  cleanup();
  useCanvasStore.setState({ artifacts: [], currentArtifactId: null });
  useAnswerPanelStore.setState({ sortMode: "TIME", search: "" });
});

const NOW = Date.UTC(2026, 9, 10, 12, 0, 0);
const answer = (i: number, over: Partial<Artifact> = {}): Artifact =>
  ({
    id: `ans-${i}`,
    status: "complete",
    created_at: NOW - i * 60_000 * 7,
    watermark: 0,
    question_text: `question ${i}`,
    summary: `summary ${i}`,
    rendered_output: { archetype: "MULTI_SERIES", components: [{ archetype: "MULTI_SERIES", rows: [] }] },
    routing: { about: { instance_resolved: true, instance_identifier: `urn:s:${i % 50}`, label: `Topic ${i % 9}` } },
    ...over,
  }) as unknown as Artifact;

const many = (n: number) => Array.from({ length: n }, (_, i) => answer(i));
const items = () => document.querySelectorAll("[data-virtual-item]");
const scroller = () => document.querySelector("[data-answers-scroll]") as HTMLElement;
const rowIds = () => [...document.querySelectorAll("[data-virtual-item]")].map((e) => e.textContent!);

describe("AnswersPanel is windowed", () => {
  for (const mode of ["TIME", "TOPIC", "TYPE", "GRAPH"] as const) {
    it(`${mode}: 10,000 answers render a bounded window`, () => {
      useAnswerPanelStore.setState({ sortMode: mode });
      useCanvasStore.setState({ artifacts: many(10_000) });
      render(<AnswersPanel />);
      expect(items().length).toBeGreaterThan(0);
      expect(items().length).toBeLessThanOrEqual(60);
    });
  }

  it("scrolling changes which rows render", () => {
    useCanvasStore.setState({ artifacts: many(10_000) });
    render(<AnswersPanel />);
    const before = rowIds();
    expect(before.join("|")).toContain("summary 0");
    act(() => {
      scroller().scrollTop = 150_000;
      fireEvent.scroll(scroller());
    });
    const after = rowIds();
    expect(after.join("|")).not.toContain("summary 0");
    expect(after.length).toBeLessThanOrEqual(60);
    expect(after).not.toEqual(before);
  });

  it("the spacer carries the full height, so the scrollbar is the real length", () => {
    useCanvasStore.setState({ artifacts: many(1000) });
    render(<AnswersPanel />);
    const list = document.querySelector("[data-virtual-list]") as HTMLElement;
    expect(parseInt(list.style.height, 10)).toBeGreaterThan(1000 * 28);
  });

  it("clicking a row still selects it", () => {
    useCanvasStore.setState({ artifacts: many(200) });
    render(<AnswersPanel />);
    const row = [...items()].find((e) => e.textContent!.includes("summary 3 "))
      ?? [...items()].find((e) => e.textContent!.includes("summary 3"))!;
    const target = row.querySelector("p") as HTMLElement;
    fireEvent.pointerDown(target, { button: 0, clientX: 5, clientY: 5 });
    fireEvent.pointerUp(document, { clientX: 5, clientY: 5 });
    expect(useCanvasStore.getState().currentArtifactId).toBe("ans-3");
  });
});

describe("AnswersPanel search is summary-index only", () => {
  const withBodyOnly = answer(1, {
    summary: "plain headline",
    rendered_output: { archetype: "KNOWLEDGE_DOCUMENT", components: [{ markdown_content: "zebracrossing appears only in the body" }] },
  } as Partial<Artifact>);

  it("a term only in rendered_output does NOT match", () => {
    useCanvasStore.setState({ artifacts: [withBodyOnly, answer(2)] });
    useAnswerPanelStore.setState({ search: "zebracrossing" });
    render(<AnswersPanel />);
    expect(items()).toHaveLength(0);
  });

  it("a term in the summary matches", () => {
    useCanvasStore.setState({ artifacts: [withBodyOnly, answer(2)] });
    useAnswerPanelStore.setState({ search: "plain headline" });
    render(<AnswersPanel />);
    expect(rowIds().filter((t) => t.includes("plain headline"))).toHaveLength(1);
  });
});
