/**
 * THE FIXTURES DISCRIMINATE — ADR-0055 §2, second card, and the first with a REFUSAL to flip.
 *
 * `ContributionRanking`'s set never exercised a card that STOPS. Here one does, and that branch
 * needs its own care: when the card refuses, every other absence is absent because NOTHING WAS
 * DRAWN, not because the payload was complete. Those two states are identical from outside, so
 * the refusal fixture names the refusal rather than declaring nothing — and the quiet-payload
 * property below is what keeps the two apart.
 */
import type React from "react";
import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { CompetingMeasures } from "./CompetingMeasures";
import {
  COMPETING_MEASURES_ABSENCES,
  COMPETING_MEASURES_FIXTURES,
} from "./fixtures/competingMeasures";

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


type CardProps = React.ComponentProps<typeof CompetingMeasures>;

/**
 * Render a fixture through the real component.
 *
 * The cast is at the BOUNDARY and once: a fixture is a PAYLOAD — deliberately typed loosely so
 * it can carry the malformed shapes the refusal branch exists for — and the component takes a
 * validated prop type. Casting here keeps that seam visible instead of weakening either side.
 */
const draw = (f: (typeof COMPETING_MEASURES_FIXTURES)[number]) =>
  render(<CompetingMeasures {...({ rows: f.rows, ...f.envelope } as unknown as CardProps)} />);

describe("COMPETING_MEASURES fixtures discriminate", () => {
  it.each(COMPETING_MEASURES_FIXTURES.map((f) => [f.name, f] as const))(
    "%s — declares exactly what it names",
    (_name, f) => {
      draw(f);
      for (const absence of COMPETING_MEASURES_ABSENCES) {
        const present = document.querySelector(`[${absence}]`) !== null;
        expect(present, `${absence} expected ${f.declares.includes(absence) ? "present" : "ABSENT"}`).toBe(
          f.declares.includes(absence),
        );
      }
    },
  );

  it("every declared absence is FLIPPED by the set — both directions", () => {
    for (const absence of COMPETING_MEASURES_ABSENCES) {
      const shown = COMPETING_MEASURES_FIXTURES.filter((f) => f.declares.includes(absence));
      const hidden = COMPETING_MEASURES_FIXTURES.filter((f) => !f.declares.includes(absence));
      expect(shown.length, `${absence} is never declared`).toBeGreaterThan(0);
      expect(hidden.length, `${absence} is declared by EVERY fixture — it cannot flip`).toBeGreaterThan(0);
    }
  });

  it("some payload leaves the card ENTIRELY QUIET, and it is NOT the refusal", () => {
    // THE DISTINCTION THIS CARD ADDS. A refusal also shows no other absence — because nothing
    // rendered. If the refusal fixture were allowed to satisfy this property, "the card drew
    // everything cleanly" and "the card drew nothing at all" would be one claim, and a card that
    // refused every payload would pass.
    const quiet = COMPETING_MEASURES_FIXTURES.filter((f) => f.declares.length === 0);
    expect(quiet.length, "no fixture exercises a payload the card draws completely").toBeGreaterThan(0);
    for (const f of quiet) {
      cleanup();
      draw(f);
      for (const absence of COMPETING_MEASURES_ABSENCES) {
        expect(document.querySelector(`[${absence}]`), `${f.name} declared ${absence}`).toBeNull();
      }
      // And it really drew — the proof that quiet is not refusal wearing its clothes.
      expect(document.querySelector("[data-competing-measures]"), "quiet but nothing drawn").not.toBeNull();
    }
  });

  it("the refusal fixture STOPS the card — the other direction of the same distinction", () => {
    const refusals = COMPETING_MEASURES_FIXTURES.filter((f) => f.declares.includes("data-refused"));
    expect(refusals.length, "no fixture reaches the refusal branch").toBeGreaterThan(0);
    for (const f of refusals) {
      cleanup();
      draw(f);
      expect(document.querySelector("[data-competing-measures]"), "refused and still drew").toBeNull();
    }
  });

  it("the absence list matches the CARD, not a memory of it", () => {
    const unique = renderedAttributes(join(__dirname, "CompetingMeasures.tsx"));
    // Structural, not absences: the container, the per-method key, the spread and range values
    // themselves. Named rather than silently excluded — an exclusion nobody recorded is
    // indistinguishable from a branch nobody looked at.
    const structural = new Set([
      "data-competing-measures",
      "data-method",
      "data-spread",
      "data-range",
    ]);
    const covered = new Set<string>([...COMPETING_MEASURES_ABSENCES, ...structural]);
    expect(unique.filter((a) => !covered.has(a)), "the card declares an absence no fixture flips").toEqual([]);
  });
});
