/**
 * THE FIXTURES DISCRIMINATE — ADR-0055 §2, for `SHORTFALL_GRID`.
 *
 * Since #528 (80dcbbae, 2026-11-23) the package declares one absence, `data-served-provenance`
 * (the producer's source sentence). It used to declare `noAbsence`; the seal's own remedy was to
 * declare the attribute and drop the claim. Every fixture's `declares` must equal what
 * `readDeclaredAbsences` finds on its own render, and the absence must FLIP across the set.
 */
import type React from "react";
import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import pkg from "./index";
import { ShortfallGrid } from "./Card";
import { readDeclaredAbsences } from "../defineArchetype";
import { SHORTFALL_GRID_ABSENCES, SHORTFALL_GRID_FIXTURES } from "./fixtures";

afterEach(cleanup);

type CardProps = React.ComponentProps<typeof ShortfallGrid>;

/** The cast is at the BOUNDARY and once: a fixture is a PAYLOAD, deliberately typed loosely. */
const draw = (f: (typeof SHORTFALL_GRID_FIXTURES)[number]) =>
  render(<ShortfallGrid {...({ rows: f.rows, ...f.envelope } as unknown as CardProps)} />);

describe("SHORTFALL_GRID fixtures discriminate", () => {
  it("the package declares the absences the fixtures know, and no noAbsence", () => {
    expect([...pkg.absences]).toEqual([...SHORTFALL_GRID_ABSENCES]);
    expect(pkg.noAbsence).toBeUndefined();
  });

  it("the fixture set is not empty — an empty set would make every arm below vacuous", () => {
    expect(SHORTFALL_GRID_FIXTURES.length).toBeGreaterThan(0);
  });

  it.each(SHORTFALL_GRID_FIXTURES.map((f) => [f.name, f] as const))("%s — declares exactly what it names", (_name, f) => {
    const { container } = draw(f);
    const declared = readDeclaredAbsences(container, SHORTFALL_GRID_ABSENCES);
    for (const absence of SHORTFALL_GRID_ABSENCES) {
      expect(declared.includes(absence), `${absence} expected ${f.declares.includes(absence) ? "present" : "ABSENT"}`).toBe(
        f.declares.includes(absence),
      );
    }
  });

  it("every declared absence is FLIPPED by the set — both directions", () => {
    for (const absence of SHORTFALL_GRID_ABSENCES) {
      expect(SHORTFALL_GRID_FIXTURES.filter((f) => f.declares.includes(absence)).length, `${absence} is never declared`).toBeGreaterThan(0);
      expect(SHORTFALL_GRID_FIXTURES.filter((f) => !f.declares.includes(absence)).length, `${absence} is declared by EVERY fixture`).toBeGreaterThan(0);
    }
  });
});
