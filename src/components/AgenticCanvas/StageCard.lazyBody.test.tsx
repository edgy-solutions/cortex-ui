/**
 * A. THE BODY MOUNTS ONLY ON OPEN.
 *
 * Profile of 816 answers: every card mounted an AnswerBody, every AnswerBody a
 * SemanticInterpreter, so every chart in every answer rendered at once. A card now is a summary
 * tile until it is opened, focused or placed on a canvas.
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, cleanup } from "@testing-library/react";
import type { Artifact } from "@/api/types";

vi.mock("@/components/elicitation/AskedSection", () => ({ AskedSection: () => null }));
vi.mock("./AnswerBody", () => ({
  AnswerBody: () => <div data-testid="answer-body" />,
}));

import { StageCard, tileAge } from "./StageCard";

vi.stubGlobal("ResizeObserver", class { observe() {} disconnect() {} unobserve() {} });
afterEach(cleanup);

const answer = (i: number): Artifact =>
  ({
    id: `ans-${i}`,
    status: "complete",
    created_at: Date.now() - 3 * 3_600_000,
    question_text: `question ${i}`,
    summary: `summary ${i}`,
    rendered_output: { archetype: "MULTI_SERIES", components: [{ archetype: "MULTI_SERIES", rows: [] }] },
  }) as unknown as Artifact;

const card = (a: Artifact, extra: Partial<React.ComponentProps<typeof StageCard>> = {}) => (
  <StageCard
    key={a.id}
    artifact={a}
    focused={false}
    onClick={() => {}}
    onDoubleClick={() => {}}
    style={{}}
    {...extra}
  />
);

const bodies = () => document.querySelectorAll('[data-testid="answer-body"]').length;

describe("StageCard body is lazy", () => {
  it("50 answers, none open: AnswerBody mounts 0 times", () => {
    render(<>{Array.from({ length: 50 }, (_, i) => card(answer(i)))}</>);
    expect(document.querySelectorAll("[data-answer-id]")).toHaveLength(50);
    expect(bodies()).toBe(0);
  });

  it("opening one mounts exactly 1", () => {
    const all = Array.from({ length: 50 }, (_, i) => answer(i));
    render(<>{all.map((a, i) => card(a, { open: i === 7 }))}</>);
    expect(bodies()).toBe(1);
    expect(document.querySelector('[data-answer-id="ans-7"] [data-testid="answer-body"]')).not.toBeNull();
  });

  it("a focused card mounts its body without being told it is open", () => {
    render(card(answer(1), { focused: true }));
    expect(bodies()).toBe(1);
  });

  it("a card placed on a custom canvas keeps its body (it was put there to be read)", () => {
    render(card(answer(1), { onRemove: () => {} }));
    expect(bodies()).toBe(1);
  });

  it("the tile names the answer: summary, status and age", () => {
    render(card(answer(4)));
    const text = document.querySelector("[data-answer-id]")!.textContent!;
    expect(text).toContain("summary 4");
    expect(document.querySelector('[data-testid="stage-tile-meta"]')!.textContent).toContain("complete");
    expect(document.querySelector('[data-testid="stage-tile-meta"]')!.textContent).toContain("3h ago");
  });

  it("an opened card shows no tile meta line (the body replaces the tile)", () => {
    render(card(answer(4), { open: true }));
    expect(document.querySelector('[data-testid="stage-tile-meta"]')).toBeNull();
  });
});

describe("tileAge", () => {
  const now = 1_000_000_000_000;
  it("is coarse and monotone", () => {
    expect(tileAge(now - 10_000, now)).toBe("just now");
    expect(tileAge(now - 5 * 60_000, now)).toBe("5m ago");
    expect(tileAge(now - 3 * 3_600_000, now)).toBe("3h ago");
    expect(tileAge(now - 5 * 86_400_000, now)).toBe("5d ago");
    expect(tileAge(undefined, now)).toBe("");
  });
});
