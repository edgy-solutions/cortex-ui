/**
 * THRESHOLD_GRID contract tests.
 *
 * The union check is the load-bearing one, same as every other contract in this tree. The
 * grid-specific tests below it defend two claims a field-name list could not carry and that a
 * later refactor would find tempting to "simplify": the threshold is PER CELL, and an absent
 * cell is not a zero.
 */
import { describe, expect, it } from "vitest";
import {
  THRESHOLD_GRID_CONTRACT,
  THRESHOLD_GRID_REFUSAL_REASONS,
  gridAxes,
  validateThresholdGrid,
  type ThresholdCell,
} from "./ThresholdGrid.contract";

const cells: ThresholdCell[] = [
  { subject_id: "S1", subject_name: "Site A", period: "FY26-Q3", value: 1.8, threshold: 2.0, over_threshold: false, contributors: ["P3", "P4"] },
  { subject_id: "S2", subject_name: "Site B", period: "FY26-Q4", value: 2.7, threshold: 2.0, over_threshold: true, contributors: ["P8", "P12", "P13"] },
  { subject_id: "S4", subject_name: "Site D", period: "FY27-Q1", value: 2.0, threshold: 2.5, over_threshold: false, contributors: ["P5", "P14"] },
];

describe("THRESHOLD_GRID contract — the refusal vocabulary fires", () => {
  it("refuses an empty grid", () => {
    expect(validateThresholdGrid([])).toEqual({ kind: "empty", reason: "no cells" });
  });

  it("refuses a non-array", () => {
    expect(validateThresholdGrid(undefined)).toEqual({ kind: "empty", reason: "no cells" });
  });

  it("refuses a cell with no subject", () => {
    expect(validateThresholdGrid([{ period: "FY26-Q3", value: 1 }]))
      .toEqual({ kind: "empty", reason: "cell is missing its subject or period" });
  });

  it("refuses a cell with no period", () => {
    expect(validateThresholdGrid([{ subject_id: "S1", value: 1 }]))
      .toEqual({ kind: "empty", reason: "cell is missing its subject or period" });
  });

  it("refuses non-object cells", () => {
    expect(validateThresholdGrid(["S1", "S2"]))
      .toEqual({ kind: "empty", reason: "cell is missing its subject or period" });
  });

  it("refuses a payload with no numeric value anywhere", () => {
    expect(validateThresholdGrid([{ subject_id: "S1", period: "FY26-Q3", value: "high" }]))
      .toEqual({ kind: "empty", reason: "no cell carries a numeric value" });
  });
});

describe("THRESHOLD_GRID contract — acceptance", () => {
  it("accepts a well-formed grid", () => {
    expect(validateThresholdGrid(cells).kind).toBe("ok");
  });

  it("ACCEPTS a zero-value cell — measured-and-idle is data, not a refusal", () => {
    const r = validateThresholdGrid([
      { subject_id: "S3", period: "FY26-Q2", value: 0, threshold: 2.5, over_threshold: false },
    ]);
    expect(r.kind).toBe("ok");
  });
});

describe("THRESHOLD_GRID contract — the two claims a simplification would break", () => {
  it("the threshold is PER CELL, so two subjects at the same value colour differently", () => {
    // Site D at 2.0/2.5 is FINE; Site B at 2.7/2.0 is OVER. A grid-level threshold — the
    // obvious simplification — would paint one of them wrong, and which one depends on which
    // value got hoisted.
    const [, siteB, siteD] = cells;
    expect(siteB.threshold).not.toBe(siteD.threshold);
    expect(siteD.value).toBeLessThan(siteD.threshold);
    expect(siteB.value).toBeGreaterThan(siteB.threshold);
    expect(THRESHOLD_GRID_CONTRACT.rowRequirements.thresholdIsPerCell).toBe(true);
  });

  it("axes are DERIVED from the cells, so an absent pair stays absent", () => {
    // S1 has only Q3; S2 only Q4. The axis product has 9 intersections and only 3 cells —
    // the other 6 must render as gaps, never as backfilled zeros. A 0.0 in a heat grid reads
    // as "measured, and fine", which is a different claim from "nothing was happening".
    const { subjects, periods } = gridAxes(cells);
    expect(subjects).toEqual(["S1", "S2", "S4"]);
    expect(periods).toEqual(["FY26-Q3", "FY26-Q4", "FY27-Q1"]);
    expect(subjects.length * periods.length).toBe(9);
    expect(cells.length).toBe(3);
    expect(THRESHOLD_GRID_CONTRACT.rowRequirements.absentCellsAreNotZero).toBe(true);
  });

  it("period order is the payload's, not sorted — the renderer knows no fiscal calendar", () => {
    const scrambled: ThresholdCell[] = [
      { subject_id: "S1", period: "FY27-Q1", value: 1, threshold: 2, over_threshold: false },
      { subject_id: "S1", period: "FY26-Q3", value: 1, threshold: 2, over_threshold: false },
    ];
    expect(gridAxes(scrambled).periods).toEqual(["FY27-Q1", "FY26-Q3"]);
  });
});

describe("THRESHOLD_GRID contract — the contract and the component cannot disagree", () => {
  it("every refusal reason the contract publishes is one the validator can emit", () => {
    const emitted = new Set<string>();
    for (const probe of [
      [], undefined,
      [{ period: "FY26-Q3", value: 1 }],
      [{ subject_id: "S1", period: "FY26-Q3", value: "high" }],
    ] as unknown[]) {
      const r = validateThresholdGrid(probe);
      if (r.kind === "empty") emitted.add(r.reason);
    }
    for (const reason of THRESHOLD_GRID_REFUSAL_REASONS) {
      expect(emitted, `contract publishes "${reason}" but nothing emitted it`).toContain(reason);
    }
  });

  it("does NOT publish live_view_requires_registration — that is the SELECTOR's refusal", () => {
    expect(THRESHOLD_GRID_REFUSAL_REASONS as readonly string[])
      .not.toContain("live_view_requires_registration");
  });

  it("declares recomputes:true", () => {
    expect(THRESHOLD_GRID_CONTRACT.recomputes).toBe(true);
  });

  it("names a STRUCTURAL archetype carrying no domain vocabulary", () => {
    expect(THRESHOLD_GRID_CONTRACT.archetype).toBe("THRESHOLD_GRID");
    for (const w of ["SITE", "LOAD", "COST", "SATURATION", "PORTFOLIO", "CAPABILITY"]) {
      expect(THRESHOLD_GRID_CONTRACT.archetype).not.toContain(w);
      expect(THRESHOLD_GRID_CONTRACT.component.toUpperCase()).not.toContain(w);
    }
  });
});
