import { readFileSync } from "node:fs";
import path from "node:path";
/**
 * The defect this guards already happened once, quietly, for weeks.
 *
 * `SemanticInterpreter` dispatched twelve archetypes that `AnswerArchetype` had never heard
 * of, so every one of them fell through to UNKNOWN and drew a question mark in the answer
 * list. Nothing failed; the list simply said "I do not know what this is" about answers the
 * app rendered correctly two panes away.
 *
 * It stayed invisible because of a coincidence worth remembering: the chart answers came back
 * through the DesignUI fallback AS `CHART_WIDGET`, which the union DID know, so they drew a
 * proper glyph. The question marks only appeared once routing started working and answers
 * began arriving through the registered path carrying their REAL archetype. The symptom
 * surfaced when the system got healthier.
 *
 * So the guard is not "these twelve have glyphs" — that would pass today and rot the same way.
 * It is DERIVED: every archetype the interpreter dispatches must have a display identity, and
 * a thirteenth added tomorrow fails this file before anyone sees a question mark.
 */
import { describe, it, expect } from "vitest";
import { glyphFor } from "./ArchetypeGlyph";
import {
  DISPLAY_ARCHETYPES,
  archetypeLabel,
  type AnswerArchetype,
} from "@/lib/answerDisplay";

const INTERPRETER = readFileSync(
  path.join(__dirname, "../registry/SemanticInterpreter.tsx"),
  "utf8",
);

/** What the app actually renders, read from the dispatch itself rather than restated. */
const dispatched = [
  ...new Set(
    [...INTERPRETER.matchAll(/case "([A-Z_0-9]+)":/g)].map((m) => m[1]),
  ),
];

describe("every archetype the interpreter renders has a display identity", () => {
  it("the dispatch table is actually being read — positive control", () => {
    // A regex that stopped matching would turn the completeness assertion below into a pass
    // over an empty list, which is the exact shape of a guard that reads as coverage.
    expect(dispatched.length).toBeGreaterThanOrEqual(15);
    expect(dispatched).toContain("INTERVAL_TIMELINE");
    expect(dispatched).toContain("CHART_WIDGET");
  });

  it("NOTHING the interpreter dispatches falls through to a question mark", () => {
    // The original defect, stated as its own test. `answerArchetype` maps a payload string to
    // a display archetype; anything it cannot place becomes UNKNOWN and draws HelpCircle.
    const missing = dispatched.filter(
      (a) => !(DISPLAY_ARCHETYPES as readonly string[]).includes(a),
    );
    expect(missing).toEqual([]);
  });

  it("every display archetype has a glyph that is NOT the unknown fallback", () => {
    const unknown = glyphFor("UNKNOWN");
    for (const a of DISPLAY_ARCHETYPES) {
      expect(glyphFor(a).Icon, `${a} has no glyph of its own`).not.toBe(unknown.Icon);
    }
  });

  it("every display archetype has a label that is NOT the generic one", () => {
    // "Answer" is the fallback label. An archetype reaching it is the same silent gap as the
    // question mark, one field over.
    for (const a of DISPLAY_ARCHETYPES) {
      expect(archetypeLabel(a), `${a} has no label of its own`).not.toBe("Answer");
    }
  });

  it("glyphs are DISTINCT enough to identify by — no two share an icon", () => {
    // A glyph table is identification. Two archetypes sharing an icon is a list the reader
    // cannot use, which is a quieter version of the same failure.
    const icons = DISPLAY_ARCHETYPES.map((a) => glyphFor(a).Icon);
    expect(new Set(icons).size).toBe(icons.length);
  });

  it("DISPLAY_ARCHETYPES covers the union — the hand list cannot drift from the type", () => {
    // `satisfies` proves every member is a VALID archetype; it does not prove the list is
    // EXHAUSTIVE, so an archetype added to the union and forgotten here would be invisible to
    // the compiler and to every sweep that iterates this constant. Derived from the union's
    // own source, comments stripped, so prose cannot narrow the population.
    const src = readFileSync(path.join(__dirname, "../../lib/answerDisplay.ts"), "utf8").replace(
      /\/\/[^\n]*/g,
      "",
    );
    const block = src.match(/export type AnswerArchetype\s*=([^;]*);/)?.[1] ?? "";
    const declared = [...block.matchAll(/"([A-Z0-9_]+)"/g)].map((m) => m[1]);

    expect(declared).toContain("UNKNOWN"); // positive control on the extraction
    expect(declared.length).toBeGreaterThan(10);
    expect([...DISPLAY_ARCHETYPES].sort()).toEqual(
      declared.filter((d) => d !== "UNKNOWN").sort(),
    );
  });

  it("UNKNOWN stays reachable — an unregistered payload must still render something", () => {
    // The escape hatch is deliberate and must not be closed. The rule is that nothing
    // DISPATCHED lands here, not that nothing can.
    expect(glyphFor("UNKNOWN" as AnswerArchetype).Icon).toBeTruthy();
    expect(archetypeLabel("UNKNOWN")).toBe("Answer");
  });
});

/**
 * A GLYPH BELONGS TO ITS ARCHETYPE, AND CHANGING ONE MUST BE DELIBERATE.
 *
 * The existing seals here require every archetype to HAVE a glyph and no two to SHARE one.
 * Both passed while `PERIOD_SERIES` silently lost its icon: adding `FORECAST_MEASURE` involved
 * a string replace on `Icon: TrendingUp`, which matched PERIOD_SERIES's line first. The result
 * was still complete and still distinct, so nothing fired — and a shipped commit whose message
 * claimed to add one archetype had also reassigned another's glyph.
 *
 * Readers navigate that list by shape. An icon that changes under them is a small betrayal of
 * exactly the affordance the glyphs exist to provide, and it is invisible in a diff that is
 * mostly additions.
 *
 * So the ASSIGNMENTS are pinned. This is deliberately rigid: a redesign updates this list, and
 * that edit is the review the change deserves.
 */
describe("each archetype keeps its own glyph", () => {
  const PINNED: Record<string, string> = {
    PERIOD_SERIES: "TrendingUp",
    FORECAST_MEASURE: "Target",
    CONTRIBUTION_RANKING: "ListOrdered",
    VARIANCE_TREE: "Workflow",
    MULTI_SERIES: "LineChart",
    THRESHOLD_GRID: "Grid3x3",
    MATRIX_GRID: "Grid2x2",
    SHORTFALL_GRID: "Scale",
    DELTA_SET: "GitCompare",
    INTERVAL_TIMELINE: "GanttChartSquare",
  };

  const SRC = readFileSync(path.join(__dirname, "ArchetypeGlyph.tsx"), "utf8");

  it("the source is read — positive control", () => {
    expect(SRC).toContain("case \"PERIOD_SERIES\":");
  });

  for (const [archetype, icon] of Object.entries(PINNED)) {
    it(`${archetype} uses ${icon}`, () => {
      const start = SRC.indexOf(`case "${archetype}":`);
      expect(start, `${archetype} has no case`).toBeGreaterThan(0);
      const block = SRC.slice(start, SRC.indexOf("case ", start + 10));
      expect(block, `${archetype} no longer uses ${icon}`).toContain(`Icon: ${icon}`);
    });
  }
});
