/**
 * The answer footer, as both rows draw it: separately labelled numbers, each only when it exists.
 *
 * TIME mode draws `TimeRow` and TOPIC mode draws `ClusterRow`; both are mounted through the real panel
 * so a row that kept the old `12s · 2 hops` string, or dropped the footer, fails here. `wall clock` and
 * `hops` are not served yet, so neither may appear on any row.
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, cleanup } from "@testing-library/react";
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

const NOW = Date.UTC(2026, 10, 10, 12, 0, 0);
const answer = (id: string, duration_ms: number | null, over: Partial<Artifact> = {}): Artifact =>
  ({
    id,
    status: "complete",
    created_at: NOW,
    watermark: 0,
    duration_ms,
    question_text: `question ${id}`,
    summary: `summary ${id}`,
    rendered_output: { archetype: "MULTI_SERIES", components: [{ archetype: "MULTI_SERIES", rows: [] }] },
    routing: { about: { instance_resolved: true, instance_identifier: "urn:s:1", label: "Topic" } },
    ...over,
  }) as unknown as Artifact;

const rowOf = (id: string) =>
  [...document.querySelectorAll("[data-virtual-item]")].find((e) => e.textContent!.includes(`summary ${id}`)) as HTMLElement;
const numbers = (row: HTMLElement) =>
  [...row.querySelectorAll("[data-footer-number]")].map((n) => `${n.getAttribute("data-footer-number")}=${n.textContent}`);

describe("both rows draw the footer as labelled numbers", () => {
  for (const mode of ["TIME", "TOPIC"] as const) {
    it(`${mode}: a two-artifact answer shows work and artifacts, and no wall clock or hops`, () => {
      useAnswerPanelStore.setState({ sortMode: mode });
      useCanvasStore.setState({
        artifacts: [
          answer("ask", 8000, { created_at: NOW - 60_000 }),
          answer("ans", 4400, { derived_from_artifact_id: "ask" } as Partial<Artifact>),
        ],
      });
      render(<AnswersPanel />);
      const row = rowOf("ans");
      expect(row, "the answer row").toBeTruthy();
      expect(row.querySelectorAll("[data-answer-footer]")).toHaveLength(1);
      expect(numbers(row)).toEqual(["work=work 12s", "artifacts=artifacts 2"]);
      expect(row.textContent).not.toMatch(/\bhops?\b|wall clock/);
      expect(row.querySelector('[data-footer-number="work"]')!.getAttribute("title")).toMatch(/not a wall clock/);
    });

    it(`${mode}: an unmeasured answer draws no work, never a 0s`, () => {
      useAnswerPanelStore.setState({ sortMode: mode });
      useCanvasStore.setState({ artifacts: [answer("bare", null)] });
      render(<AnswersPanel />);
      expect(numbers(rowOf("bare"))).toEqual(["artifacts=artifacts 1"]);
    });
  }
});
