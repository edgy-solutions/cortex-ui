/**
 * THE EYEBROW WRAPS; NOTHING IS CUT (ruled 2026-11-19: "wrap the header to a second line, so
 * neither subject nor verb is cut"). The notice answer's subject read "PCN26-182…" under
 * `truncate`. Both faces (front and back) draw the header, so both copies are asserted.
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, cleanup } from "@testing-library/react";
import type { Artifact } from "@/api/types";

vi.mock("@/components/elicitation/AskedSection", () => ({ AskedSection: () => null }));
vi.mock("./AnswerBody", () => ({ AnswerBody: () => <div data-testid="answer-body" /> }));

import { StageCard } from "./StageCard";

vi.stubGlobal("ResizeObserver", class { observe() {} disconnect() {} unobserve() {} });
afterEach(cleanup);

const SUBJECT = "PCN26-182 SOME VERY LONG NOTICE SUBJECT";
const VERB = "assess the change";

const answer = {
  id: "ans-1",
  status: "complete",
  created_at: Date.now() - 3_600_000,
  question_text: "q",
  summary: "s",
  routing: { about: { label: SUBJECT }, action: { label: VERB } },
  rendered_output: { archetype: "MULTI_SERIES", components: [{ archetype: "MULTI_SERIES", rows: [] }] },
} as unknown as Artifact;

describe("the card eyebrow wraps instead of truncating", () => {
  for (const face of ["front", "back"]) {
    it(`${face} face: no truncate, title is the full subject · verb`, () => {
      render(
        <StageCard
          artifact={answer}
          focused={false}
          onClick={() => {}}
          onDoubleClick={() => {}}
          onRemove={() => {}}
          style={{}}
        />,
      );
      const span = document.querySelector(
        `[data-face="${face}"] [data-eyebrow-subject]`,
      ) as HTMLElement | null;
      expect(span, `${face} face drew no eyebrow subject`).not.toBeNull();
      expect(span!.className).not.toMatch(/\btruncate\b/);
      expect(span!.className).toMatch(/\bmin-w-0\b/);
      expect(span!.className).toMatch(/\bbreak-words\b/);
      expect(span!.title).toBe(`${SUBJECT} · ${VERB}`);
    });
  }
});
