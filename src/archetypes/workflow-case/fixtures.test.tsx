/**
 * THE FIXTURES DISCRIMINATE — ADR-0055 §2, for `WORKFLOW_CASE`.
 *
 * Same walk as `competing-measures/fixtures.test.tsx`, adapted for a payload that is one nested
 * object (`{ case: WorkflowCasePayload }`) rather than a `rows` + envelope split, and for a card
 * that never refuses — there is no "quiet vs. refused" distinction to prove here, because
 * `WorkflowCase` always draws a section per key, absent or not.
 */
import type React from "react";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { WorkflowCase } from "./Card";
import { archetypePackage } from "../registry";
import { readDeclaredAbsences } from "../defineArchetype";
import { WORKFLOW_CASE_ABSENCES, WORKFLOW_CASE_FIXTURES } from "./fixtures";

afterEach(cleanup);

function stripComments(src: string): string {
  let out = "";
  let i = 0;
  while (i < src.length) {
    if (src.startsWith("/*", i)) {
      const end = src.indexOf("*/", i + 2);
      i = end === -1 ? src.length : end + 2;
      out += " ";
    } else if (src.startsWith("//", i)) {
      const end = src.indexOf("\n", i);
      i = end === -1 ? src.length : end;
      out += " ";
    } else {
      out += src[i];
      i += 1;
    }
  }
  return out;
}

function renderedAttributes(file: string): string[] {
  const src = stripComments(readFileSync(file, "utf8"));
  return [...new Set([...src.matchAll(/data-[a-z-]+/g)].map((m) => m[0]))].sort();
}

/** The forbidden-vocabulary guard: this card, its contract, its row, and its index must never
 *  name a verb, stage, step, role, domain, or kind by spelling — see `Card.tsx`'s own header.
 *  Fixtures MAY carry these words; they transcribe real producer facts. */
const FORBIDDEN = /maintenance|safety|hazard|risk|accept|concur/i;
const SOURCE_FILES = ["Card.tsx", "contract.ts", "row.ts", "index.ts"];

type CardProps = React.ComponentProps<typeof WorkflowCase>;

const draw = (f: (typeof WORKFLOW_CASE_FIXTURES)[number]) =>
  render(<WorkflowCase {...({ case: f.payload } as unknown as CardProps)} />);

describe("WORKFLOW_CASE fixtures discriminate", () => {
  it.each(WORKFLOW_CASE_FIXTURES.map((f) => [f.name, f] as const))(
    "%s — declares exactly what it names",
    (_name, f) => {
      const { container } = draw(f);
      const declared = readDeclaredAbsences(container, WORKFLOW_CASE_ABSENCES);
      expect(declared.slice().sort()).toEqual(f.declares.slice().sort());
    },
  );

  it("every declared absence is flipped by the set, both directions", () => {
    for (const absence of WORKFLOW_CASE_ABSENCES) {
      const declaredBySome = WORKFLOW_CASE_FIXTURES.some((f) => f.declares.includes(absence));
      const undeclaredBySome = WORKFLOW_CASE_FIXTURES.some((f) => !f.declares.includes(absence));
      expect(declaredBySome, `${absence} is never declared by any fixture`).toBe(true);
      expect(undeclaredBySome, `${absence} is declared by every fixture — no fixture shows it present`).toBe(true);
    }
  });

  it("the registry's Card IS this file's Card — fixtures 1 and 3 render through the same reference", () => {
    const pkg = archetypePackage("WORKFLOW_CASE");
    expect(pkg).toBeTruthy();
    expect(pkg!.Card).toBe(WorkflowCase);
    cleanup();
    const first = draw(WORKFLOW_CASE_FIXTURES[0]);
    expect(first.container.querySelector("[data-archetype]")).not.toBeNull();
    cleanup();
    const third = draw(WORKFLOW_CASE_FIXTURES[2]);
    expect(third.container.querySelector("[data-archetype]")).not.toBeNull();
  });

  it("the absence list matches the CARD, not a memory of it", () => {
    const unique = renderedAttributes(join(__dirname, "Card.tsx"));
    const structural = new Set([
      "data-archetype",
      "data-instance",
      "data-workflow-id",
      "data-stages",
      "data-stage",
      "data-stage-current",
      "data-history",
      "data-options",
      "data-option",
      "data-approvals",
      "data-approval",
      "data-approval-awaiting",
      "data-artifact-section",
      "data-artifact",
    ]);
    const covered = new Set<string>([...WORKFLOW_CASE_ABSENCES, ...structural]);
    expect(unique.filter((a) => !covered.has(a)), "the card declares an absence no fixture flips").toEqual([]);
  });

  it("names no verb, stage, step, role, domain, or kind by spelling — in the card, its contract, its row, or its index", () => {
    // RAW source, comments INCLUDED — a leaked domain word hiding in a comment (`// maintenance`,
    // M4's own mutant) is exactly the failure mode this guard exists to catch; stripping comments
    // first (as `renderedAttributes` does, for an unrelated reason) would make it invisible.
    for (const name of SOURCE_FILES) {
      const file = join(__dirname, name);
      const src = readFileSync(file, "utf8");
      const matches = [...src.matchAll(new RegExp(FORBIDDEN.source, "gi"))].map((m) => m[0]);
      expect(matches, `${name} contains forbidden word(s): ${JSON.stringify(matches)}`).toEqual([]);
    }
  });

  // Not yet exercisable: no producer route serves either shape today (see `contract.ts`'s
  // header) — these name the gap rather than letting it go unrecorded.
  it.todo("the maintenance case, from a served definition and a served instance");
  it.todo("the safety acceptance case, from a served instance (only the task row is served today)");
});
