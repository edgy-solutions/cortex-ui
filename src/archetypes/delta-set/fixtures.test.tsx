/**
 * THE FIXTURES AGREE WITH THE PACKAGE'S "NO ABSENCE" — ADR-0055 §2, for `DELTA_SET`.
 *
 * This package declares no absences, so every fixture's `declares` must be `[]` (which
 * `defineArchetype` already enforces at load), and the `noAbsence` reason must be a stated
 * fact rather than a blank. That the claim is TRUE is `noAbsence.test.tsx`'s job.
 */
import { describe, it, expect } from "vitest";
import pkg from "./index";
import { DELTA_SET_FIXTURES } from "./fixtures";

describe("DELTA_SET fixtures carry the no-absence declaration", () => {
  it("the package declares no absences, and says why", () => {
    expect(pkg.absences).toEqual([]);
    expect(pkg.noAbsence?.reason.trim().length, "noAbsence.reason is blank").toBeGreaterThan(0);
  });

  it("the fixture set is not empty — an empty set would make every arm below vacuous", () => {
    expect(DELTA_SET_FIXTURES.length).toBeGreaterThan(0);
  });

  it.each(DELTA_SET_FIXTURES.map((f) => [f.name, f] as const))("%s — declares nothing", (_name, f) => {
    expect(f.declares).toEqual([]);
  });
});
