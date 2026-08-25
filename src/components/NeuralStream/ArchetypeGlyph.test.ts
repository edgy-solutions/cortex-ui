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
