/**
 * THE FIXTURES DISCRIMINATE, AND THIS IS WHAT MAKES THAT A FACT RATHER THAN A LABEL.
 *
 * ADR-0055 §2: *a fixture discriminates against the card's declared absences — each flips at
 * least one.* §6 lists "the fixture discriminates" as a seal whose subject is "a fixture that
 * cannot fail — the decorative-seal problem, and the reason 'at least one' is not enough on its
 * own".
 *
 * So this asserts three things, and the third is the one that stops the set rotting:
 *
 *   1. every fixture declares exactly the absences it names — present where named, ABSENT where
 *      not. Half of that is the control: a card declaring everything always would satisfy only
 *      the first half.
 *   2. every declared absence is FLIPPED by the set — some fixture shows it and some fixture
 *      does not. An absence only ever seen present is untested in the direction that matters.
 *   3. the absence list matches the card's ACTUAL attributes, read from the source. A card that
 *      gains an attribute without a fixture is the gap this whole sequence exists to close, and
 *      a hand-kept list would drift from the card exactly as the tuple table drifted.
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ContributionRanking } from "./ContributionRanking";
import {
  CONTRIBUTION_RANKING_ABSENCES,
  CONTRIBUTION_RANKING_FIXTURES,
} from "./fixtures/contributionRanking";

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

/**
 * The attributes a component actually RENDERS, with comments removed first.
 *
 * SCANNING SOURCE TEXT FOR data- MATCHES PROSE ABOUT ATTRIBUTES. This seal first reported
 * data-share-absent on CompetingMeasures — from a COMMENT cross-referencing the ranking card,
 * where the attribute genuinely lives. A search by name finds prose about the name, which is
 * the law this repo cites elsewhere, reproduced inside the seal written to prevent drift.
 */
function renderedAttributes(file: string): string[] {
  const src = stripComments(readFileSync(file, "utf8"));
  return [...new Set([...src.matchAll(/data-[a-z-]+/g)].map((m) => m[0]))].sort();
}


describe("CONTRIBUTION_RANKING fixtures discriminate", () => {
  it.each(CONTRIBUTION_RANKING_FIXTURES.map((f) => [f.name, f] as const))(
    "%s — declares exactly what it names",
    (_name, f) => {
      render(<ContributionRanking rows={f.rows} value_unit={f.value_unit} />);
      for (const absence of CONTRIBUTION_RANKING_ABSENCES) {
        const present = document.querySelector(`[${absence}]`) !== null;
        const expected = f.declares.includes(absence);
        expect(present, `${absence} expected ${expected ? "present" : "ABSENT"}`).toBe(expected);
      }
    },
  );

  it("every declared absence is FLIPPED by the set — both directions", () => {
    // An absence only ever seen PRESENT is untested in the direction that matters: a card that
    // declares it unconditionally passes every fixture that names it.
    for (const absence of CONTRIBUTION_RANKING_ABSENCES) {
      const shown = CONTRIBUTION_RANKING_FIXTURES.filter((f) => f.declares.includes(absence));
      const hidden = CONTRIBUTION_RANKING_FIXTURES.filter((f) => !f.declares.includes(absence));
      expect(shown.length, `${absence} is never declared by any fixture`).toBeGreaterThan(0);
      expect(hidden.length, `${absence} is declared by EVERY fixture — it cannot flip`).toBeGreaterThan(0);
    }
  });

  it("some payload leaves the card ENTIRELY QUIET — found by a surviving mutant", () => {
    // Deleting the all-complete fixture killed nothing: the flip check was satisfied by other
    // fixtures each happening not to declare a given absence, so no payload was required where
    // the card declares NOTHING AT ALL.
    //
    // That property is its own claim and a strong one: a card with nothing missing must say
    // nothing is missing. Without it, a card that always declared SOMETHING — one absence on
    // every payload, never the same one — would satisfy every assertion above.
    const quiet = CONTRIBUTION_RANKING_FIXTURES.filter((f) => f.declares.length === 0);
    expect(quiet.length, "no fixture exercises a payload the card can draw completely").toBeGreaterThan(0);
    for (const f of quiet) {
      cleanup();
      render(<ContributionRanking rows={f.rows} value_unit={f.value_unit} />);
      for (const absence of CONTRIBUTION_RANKING_ABSENCES) {
        expect(document.querySelector(`[${absence}]`), `${f.name} declared ${absence}`).toBeNull();
      }
    }
  });

  it("the absence list matches the CARD, not a memory of it", () => {
    // DERIVED, NOT RESTATED. A hand-kept list drifts from the component exactly as the
    // passthrough tuple table drifted from the archetypes — one fact in two places, and the copy
    // is the one that goes stale while continuing to pass.
    const unique = renderedAttributes(join(__dirname, "ContributionRanking.tsx"));
    // `data-legend-unjudged` is the legend's rendering of `no-verdict` rather than a separate
    // claim — the same fact said twice on one card, which the fixture set covers through
    // `data-no-verdict`. Named here rather than silently excluded.
    const covered = new Set<string>([...CONTRIBUTION_RANKING_ABSENCES, "data-legend-unjudged"]);
    const uncovered = unique.filter((a) => !covered.has(a));
    expect(uncovered, "the card declares an absence no fixture flips").toEqual([]);
  });
});
