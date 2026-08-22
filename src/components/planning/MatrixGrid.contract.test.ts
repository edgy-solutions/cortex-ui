/**
 * MATRIX_GRID contract tests.
 *
 * Union check as always. The grid-specific tests defend the two claims a later refactor will
 * want to collapse: the target is per CELL, and NEVER-ASSESSED is not level 0.
 *
 * There is also a test asserting MATRIX_GRID and THRESHOLD_GRID stay distinct — the two look
 * similar enough that merging them is an obvious "simplification", and the reason not to is
 * that they answer opposite questions with the same colour ramp.
 */
import { describe, expect, it } from "vitest";
import {
  MATRIX_GRID_CONTRACT,
  MATRIX_GRID_REFUSAL_REASONS,
  matrixAxes,
  validateMatrixGrid,
  type MatrixCell,
} from "./MatrixGrid.contract";
import { THRESHOLD_GRID_CONTRACT } from "./ThresholdGrid.contract";

const cells: MatrixCell[] = [
  { row_id: "C1", row_name: "Financial Close", column_id: "S1", column_name: "Site A",
    level: 2.0, target_level: 4.0, gap: 2.0, assessed_at: "2026-06-30", assessed_by: "council", assessment_count: 3 },
  { row_id: "C1", row_name: "Financial Close", column_id: "S2", column_name: "Site B",
    level: 1.2, target_level: 4.0, gap: 2.8, assessed_at: "2025-12-31", assessed_by: "council", assessment_count: 2 },
  { row_id: "C5", row_name: "Inventory Visibility", column_id: "S4", column_name: "Site D",
    level: 1.0, target_level: 3.0, gap: 2.0, assessed_at: "2026-06-30", assessed_by: "council", assessment_count: 2 },
];

describe("MATRIX_GRID contract — the refusal vocabulary fires", () => {
  it("refuses an empty matrix", () => {
    expect(validateMatrixGrid([])).toEqual({ kind: "empty", reason: "no cells" });
  });

  it("refuses a non-array", () => {
    expect(validateMatrixGrid(null)).toEqual({ kind: "empty", reason: "no cells" });
  });

  it("refuses a cell missing its row", () => {
    expect(validateMatrixGrid([{ column_id: "S1", level: 1 }]))
      .toEqual({ kind: "empty", reason: "cell is missing its row or column" });
  });

  it("refuses a cell missing its column", () => {
    expect(validateMatrixGrid([{ row_id: "C1", level: 1 }]))
      .toEqual({ kind: "empty", reason: "cell is missing its row or column" });
  });

  it("refuses non-object cells", () => {
    expect(validateMatrixGrid([1, 2]))
      .toEqual({ kind: "empty", reason: "cell is missing its row or column" });
  });

  it("refuses a payload with no numeric level anywhere", () => {
    expect(validateMatrixGrid([{ row_id: "C1", column_id: "S1", level: "high" }]))
      .toEqual({ kind: "empty", reason: "no cell carries a numeric level" });
  });
});

describe("MATRIX_GRID contract — acceptance", () => {
  it("accepts a well-formed matrix", () => {
    expect(validateMatrixGrid(cells).kind).toBe("ok");
  });

  it("ACCEPTS level 0 — assessed-at-zero is a real measurement", () => {
    // The distinction this whole contract turns on: assessed-at-zero is DATA. It is
    // never-assessed that must be absent.
    const r = validateMatrixGrid([
      { row_id: "C9", column_id: "S9", level: 0, target_level: 3, gap: 3 },
    ]);
    expect(r.kind).toBe("ok");
  });
});

describe("MATRIX_GRID contract — the claims a simplification would break", () => {
  it("the target is PER CELL, so the same capability can be held to different goals", () => {
    const different = validateMatrixGrid([
      { row_id: "C1", column_id: "S1", level: 2, target_level: 4, gap: 2 },
      { row_id: "C1", column_id: "S9", level: 2, target_level: 2, gap: 0 },
    ]);
    expect(different.kind).toBe("ok");
    if (different.kind === "ok") {
      // Same capability, same level, opposite verdicts. A grid-level target cannot express it.
      expect(different.cells[0].gap).toBeGreaterThan(0);
      expect(different.cells[1].gap).toBe(0);
    }
    expect(MATRIX_GRID_CONTRACT.rowRequirements.targetIsPerCell).toBe(true);
  });

  it("NEVER-ASSESSED stays absent — axes are derived, so the product has gaps", () => {
    // 2 rows x 3 columns = 6 intersections, 3 cells. The other 3 were never assessed and must
    // render as gaps: "we have never measured this" and "we measured this at zero" have
    // different next actions (go assess / go fix).
    const { rows, columns } = matrixAxes(cells);
    expect(rows).toEqual(["C1", "C5"]);
    expect(columns).toEqual(["S1", "S2", "S4"]);
    expect(rows.length * columns.length).toBe(6);
    expect(cells.length).toBe(3);
    expect(MATRIX_GRID_CONTRACT.rowRequirements.absentCellsAreNotZero).toBe(true);
  });

  it("stays DISTINCT from THRESHOLD_GRID — they answer opposite questions", () => {
    // Merging them is the obvious simplification: both are subject x period-ish cells with a
    // number and a line. But a threshold grid asks "is this OVER a line" (answer: a breach,
    // read as danger) and a matrix grid asks "how far from the GOAL" (answer: a distance,
    // read as progress). One colour ramp cannot serve both readings of the same hue.
    expect(MATRIX_GRID_CONTRACT.archetype).not.toBe(THRESHOLD_GRID_CONTRACT.archetype);
    expect(MATRIX_GRID_CONTRACT.component).not.toBe(THRESHOLD_GRID_CONTRACT.component);
  });
});

describe("MATRIX_GRID contract — the contract and the component cannot disagree", () => {
  it("every refusal reason the contract publishes is one the validator can emit", () => {
    const emitted = new Set<string>();
    for (const probe of [
      [], null,
      [{ column_id: "S1", level: 1 }],
      [{ row_id: "C1", column_id: "S1", level: "high" }],
    ] as unknown[]) {
      const r = validateMatrixGrid(probe);
      if (r.kind === "empty") emitted.add(r.reason);
    }
    for (const reason of MATRIX_GRID_REFUSAL_REASONS) {
      expect(emitted, `contract publishes "${reason}" but nothing emitted it`).toContain(reason);
    }
  });

  it("does NOT publish live_view_requires_registration — that is the SELECTOR's refusal", () => {
    expect(MATRIX_GRID_REFUSAL_REASONS as readonly string[])
      .not.toContain("live_view_requires_registration");
  });

  it("declares recomputes:true", () => {
    expect(MATRIX_GRID_CONTRACT.recomputes).toBe(true);
  });

  it("names a STRUCTURAL archetype carrying no domain vocabulary", () => {
    expect(MATRIX_GRID_CONTRACT.archetype).toBe("MATRIX_GRID");
    for (const w of ["MATURITY", "CAPABILITY", "SITE", "COST", "PORTFOLIO"]) {
      expect(MATRIX_GRID_CONTRACT.archetype).not.toContain(w);
      expect(MATRIX_GRID_CONTRACT.component.toUpperCase()).not.toContain(w);
    }
  });
});
