/**
 * THE FIXTURES DISCRIMINATE — ADR-0055 §2, for `MODEL_EXPLANATION`. No fetch, no mock: the card
 * is a pure function of its payload.
 */
import type React from "react";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { ModelExplanation } from "./Card";
import { MODEL_QUESTIONS } from "./contract";
import { archetypePackage } from "../registry";
import { readDeclaredAbsences } from "../defineArchetype";
import { MODEL_EXPLANATION_ABSENCES, MODEL_EXPLANATION_FIXTURES } from "./fixtures";

afterEach(cleanup);

type CardProps = React.ComponentProps<typeof ModelExplanation>;
const draw = (f: (typeof MODEL_EXPLANATION_FIXTURES)[number]) =>
  render(<ModelExplanation {...({ model_explanation: f.payload } as unknown as CardProps)} />);

const MID_WAY = MODEL_EXPLANATION_FIXTURES[2];

describe("MODEL_EXPLANATION fixtures discriminate", () => {
  it.each(MODEL_EXPLANATION_FIXTURES.map((f) => [f.name, f] as const))(
    "%s — declares exactly what it names",
    (_name, f) => {
      const { container } = draw(f);
      const declared = readDeclaredAbsences(container, MODEL_EXPLANATION_ABSENCES);
      expect(declared.slice().sort()).toEqual(f.declares.slice().sort());
    },
  );

  it("every declared absence is flipped by the set, both directions", () => {
    for (const absence of MODEL_EXPLANATION_ABSENCES) {
      expect(
        MODEL_EXPLANATION_FIXTURES.some((f) => f.declares.includes(absence)),
        `${absence} is never declared by any fixture`,
      ).toBe(true);
      expect(
        MODEL_EXPLANATION_FIXTURES.some((f) => !f.declares.includes(absence)),
        `${absence} is declared by every fixture`,
      ).toBe(true);
    }
  });

  it("the registry's Card IS this file's Card", () => {
    const pkg = archetypePackage("MODEL_EXPLANATION");
    expect(pkg).toBeTruthy();
    expect(pkg!.Card).toBe(ModelExplanation);
  });

  it("the absence list matches the CARD, not a memory of it", () => {
    const src = readFileSync(join(__dirname, "Card.tsx"), "utf8");
    const unique = [...new Set([...src.matchAll(/data-[a-z-]+/g)].map((m) => m[0]))].sort();
    const covered = new Set<string>([
      "data-archetype",
      "data-question",
      ...MODEL_EXPLANATION_ABSENCES.map((a) => a.split("=")[0]),
    ]);
    expect(unique.filter((a) => !covered.has(a)), "the card declares an attribute no fixture flips").toEqual([]);
  });

  it("is read-only in every fixture", () => {
    for (const f of MODEL_EXPLANATION_FIXTURES) {
      const { container } = draw(f);
      expect(
        container.querySelectorAll(
          "button, input, textarea, select, [contenteditable], [draggable], [tabindex], a[href]",
        ),
        f.name,
      ).toHaveLength(0);
      cleanup();
    }
  });

  it("deferred is not not-recorded", () => {
    const { container } = draw(MID_WAY);
    const row = container.querySelector('tr[data-model-question="deferred"]')!;
    expect(row.textContent).toContain("Waiting on the reliability steward");
    expect(row.textContent).not.toContain("Not recorded");
  });

  it("a missing key reads differently from a malformed one", () => {
    const { container } = draw(MID_WAY);
    expect(container.querySelector('tr[data-question="lifecycle"]')!.textContent).toContain(
      "Not on the wire — unreadable.",
    );
    expect(container.querySelector('tr[data-question="consuming_domains"]')!.textContent).toContain(
      "Unreadable answer — not shown as one.",
    );
  });

  it("the count line reads what the mid-way answers imply (counted by hand)", () => {
    // answered: identity, system_of_record, cardinality, history_vs_property = 4
    // deferred: owning_domain = 1; not recorded: reuse = 1
    // unreadable: consuming_domains (blank reason), lifecycle (missing) = 2
    const { container } = draw(MID_WAY);
    expect(container.textContent).toContain("4 answered · 1 deferred · 1 not recorded · 2 unreadable");
  });

  it("a blank ratified_at is unstated, never 'Ratified model @ ' with nothing after it", () => {
    const f = MODEL_EXPLANATION_FIXTURES[0];
    const { container } = render(
      <ModelExplanation {...({ model_explanation: { ...f.payload, ratified_at: "  " } } as unknown as CardProps)} />,
    );
    expect(container.querySelector('[data-model-ratified="unstated"]')).not.toBeNull();
    expect(container.textContent).not.toContain("Ratified model @");
  });

  it("the eight rows render in MODEL_QUESTIONS order", () => {
    for (const f of MODEL_EXPLANATION_FIXTURES) {
      const { container } = draw(f);
      const keys = [...container.querySelectorAll("tr[data-question]")].map((r) =>
        r.getAttribute("data-question"),
      );
      expect(keys, f.name).toEqual([...MODEL_QUESTIONS]);
      cleanup();
    }
  });
});
