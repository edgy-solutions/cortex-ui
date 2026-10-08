/**
 * THE FIXTURES DISCRIMINATE — ADR-0055 §2, for `MULTI_SERIES`.
 *
 * Every fixture's `declares` must equal what `readDeclaredAbsences` finds on its own render, and
 * every absence must FLIP across the set (present on one fixture, absent on another).
 *
 * The card has two absences, both small: the producer's verdict, and a reference the payload
 * declared but the card could not read. A REFUSAL draws neither, because it draws nothing — the
 * refused fixtures say so by declaring nothing, and the property below keeps "refused" apart from
 * "drawn and quiet" by their words, not their silence.
 */
import type React from "react";
import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { MultiSeries } from "./Card";
import { readDeclaredAbsences } from "../defineArchetype";
import { MULTI_SERIES_ABSENCES, MULTI_SERIES_FIXTURES } from "./fixtures";

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

/** The attributes a component actually RENDERS, with comments removed first (prose about a name is not the name). */
function renderedAttributes(file: string): string[] {
  const src = stripComments(readFileSync(file, "utf8"));
  return [...new Set([...src.matchAll(/data-[a-z-]+/g)].map((m) => m[0]))].sort();
}

type CardProps = React.ComponentProps<typeof MultiSeries>;

/** The cast is at the BOUNDARY and once: a fixture is a PAYLOAD, deliberately typed loosely. */
const draw = (f: (typeof MULTI_SERIES_FIXTURES)[number]) =>
  render(<MultiSeries {...({ rows: f.rows, ...f.envelope } as unknown as CardProps)} />);

describe("MULTI_SERIES fixtures discriminate", () => {
  it.each(MULTI_SERIES_FIXTURES.map((f) => [f.name, f] as const))(
    "%s — declares exactly what it names",
    (_name, f) => {
      const { container } = draw(f);
      // Scoped to this render's container, per ADR-0055 §2's collision rule.
      const declared = readDeclaredAbsences(container, MULTI_SERIES_ABSENCES);
      for (const absence of MULTI_SERIES_ABSENCES) {
        expect(
          declared.includes(absence),
          `${absence} expected ${f.declares.includes(absence) ? "present" : "ABSENT"}`,
        ).toBe(f.declares.includes(absence));
      }
    },
  );

  it("every declared absence is FLIPPED by the set — both directions", () => {
    for (const absence of MULTI_SERIES_ABSENCES) {
      const shown = MULTI_SERIES_FIXTURES.filter((f) => f.declares.includes(absence));
      const hidden = MULTI_SERIES_FIXTURES.filter((f) => !f.declares.includes(absence));
      expect(shown.length, `${absence} is never declared`).toBeGreaterThan(0);
      expect(hidden.length, `${absence} is declared by EVERY fixture — it cannot flip`).toBeGreaterThan(0);
    }
  });

  it("the refused fixtures SAY so, and declare nothing — absent because nothing was drawn", () => {
    const refusals = MULTI_SERIES_FIXTURES.filter((f) => f.name.startsWith("refused"));
    expect(refusals.length, "no fixture reaches the refusal branch").toBeGreaterThan(0);
    for (const f of refusals) {
      cleanup();
      const { container } = draw(f);
      expect(container.textContent, `${f.name}: refused without saying so`).toMatch(/nothing to draw/);
      expect(readDeclaredAbsences(container, MULTI_SERIES_ABSENCES)).toEqual([]);
    }
  });

  it("some payload is drawn and ENTIRELY QUIET — and it is not a refusal", () => {
    const quiet = MULTI_SERIES_FIXTURES.filter((f) => !f.name.startsWith("refused") && f.declares.length === 0);
    expect(quiet.length, "no fixture exercises a payload the card draws completely").toBeGreaterThan(0);
    for (const f of quiet) {
      cleanup();
      const { container } = draw(f);
      expect(container.textContent, `${f.name}: quiet but nothing drawn`).not.toMatch(/nothing to draw/);
    }
  });

  it("the absence list matches the CARD, not a memory of it", () => {
    const unique = renderedAttributes(join(__dirname, "Card.tsx"));
    const covered = new Set<string>(MULTI_SERIES_ABSENCES);
    expect(unique.filter((a) => !covered.has(a)), "the card declares an absence no fixture flips").toEqual([]);
  });
});
