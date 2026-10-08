/**
 * THE FIXTURES DISCRIMINATE — ADR-0055 §2, for `VARIANCE_TREE`.
 *
 * Every fixture's `declares` must equal what `readDeclaredAbsences` finds on its own render, and
 * every absence must FLIP across the set (present on one fixture, absent on another).
 *
 * `data-variance-node` and `data-depth` flip only because a REFUSAL draws no tree: when the card
 * refuses, every other absence is absent because NOTHING WAS DRAWN, not because the payload was
 * complete. The two refusal fixtures say so by declaring nothing, and the property below keeps
 * that state apart from a drawn tree that is merely quiet.
 */
import type React from "react";
import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { VarianceTree } from "./Card";
import { readDeclaredAbsences } from "../defineArchetype";
import { VARIANCE_TREE_ABSENCES, VARIANCE_TREE_FIXTURES } from "./fixtures";

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

type CardProps = React.ComponentProps<typeof VarianceTree>;

/** The cast is at the BOUNDARY and once: a fixture is a PAYLOAD, deliberately typed loosely. */
const draw = (f: (typeof VARIANCE_TREE_FIXTURES)[number]) =>
  render(<VarianceTree {...({ rows: f.rows, ...f.envelope } as unknown as CardProps)} />);

describe("VARIANCE_TREE fixtures discriminate", () => {
  it.each(VARIANCE_TREE_FIXTURES.map((f) => [f.name, f] as const))(
    "%s — declares exactly what it names",
    (_name, f) => {
      const { container } = draw(f);
      // Scoped to this render's container, per ADR-0055 §2's collision rule.
      const declared = readDeclaredAbsences(container, VARIANCE_TREE_ABSENCES);
      for (const absence of VARIANCE_TREE_ABSENCES) {
        expect(
          declared.includes(absence),
          `${absence} expected ${f.declares.includes(absence) ? "present" : "ABSENT"}`,
        ).toBe(f.declares.includes(absence));
      }
    },
  );

  it("every declared absence is FLIPPED by the set — both directions", () => {
    for (const absence of VARIANCE_TREE_ABSENCES) {
      const shown = VARIANCE_TREE_FIXTURES.filter((f) => f.declares.includes(absence));
      const hidden = VARIANCE_TREE_FIXTURES.filter((f) => !f.declares.includes(absence));
      expect(shown.length, `${absence} is never declared`).toBeGreaterThan(0);
      expect(hidden.length, `${absence} is declared by EVERY fixture — it cannot flip`).toBeGreaterThan(0);
    }
  });

  it("the refusal fixtures draw NO tree — absent because nothing was drawn", () => {
    const refusals = VARIANCE_TREE_FIXTURES.filter((f) => !f.declares.includes("data-variance-node"));
    expect(refusals.length, "no fixture reaches the refusal branch").toBeGreaterThan(0);
    for (const f of refusals) {
      cleanup();
      const { container } = draw(f);
      expect(container.querySelector("[data-variance-node]"), `${f.name}: refused and still drew`).toBeNull();
      expect(readDeclaredAbsences(container, VARIANCE_TREE_ABSENCES)).toEqual([]);
    }
  });

  it("the absence list matches the CARD, not a memory of it", () => {
    const unique = renderedAttributes(join(__dirname, "Card.tsx"));
    const covered = new Set<string>(VARIANCE_TREE_ABSENCES);
    expect(unique.filter((a) => !covered.has(a)), "the card declares an absence no fixture flips").toEqual([]);
  });
});
