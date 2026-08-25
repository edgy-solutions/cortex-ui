import { readFileSync } from "node:fs";
import path from "node:path";
/**
 * SHORTFALL_GRID's invariants are mostly ABSENCES — things the renderer must not do — so they
 * are asserted against the source. A defect here would be an inference that looks reasonable:
 * colouring a cell by comparing committed against required is the obvious implementation, reads
 * as correct, and silently destroys the distinction the archetype exists for.
 *
 * The contract states three refusals and this file guards each:
 *   1. `state` is the producer's verdict, read verbatim. `pledged-not-firm` is INVISIBLE to any
 *      comparison of required against committed, so a renderer that coloured by arithmetic would
 *      collapse it into "met".
 *   2. `shortfall` is computed upstream. Two places subtracting is two places to disagree.
 *   3. An absent cell is a GAP, never 0 — "nobody owes anything here" and "somebody owes zero
 *      here" are different claims and only the second is a measurement.
 */
import { describe, it, expect } from "vitest";
import {
  SHORTFALL_GRID_CONTRACT,
  SHORTFALL_STATES,
  validateShortfallGrid,
} from "./ShortfallGrid.contract";

const SRC = readFileSync(path.join(__dirname, "ShortfallGrid.tsx"), "utf8");
const INTERP = readFileSync(
  path.join(__dirname, "../registry/SemanticInterpreter.tsx"),
  "utf8",
);
const REGISTRY = readFileSync(
  path.join(__dirname, "../../registry/assembleCapabilities.ts"),
  "utf8",
);

describe("the renderer reads the verdict rather than inferring it", () => {
  it("the source is being read — positive control", () => {
    expect(SRC).toContain("export function ShortfallGrid");
    expect(SHORTFALL_STATES.length).toBeGreaterThanOrEqual(3);
  });

  it("styles from `state`, and never from a committed-vs-required comparison", () => {
    // The whole archetype in one assertion. `pledged-not-firm` cannot be derived from the two
    // headline numbers, so any styling branch that compares them has already lost it.
    expect(SRC).toMatch(/function cellStyle\(state: ShortfallState\)/);
    expect(SRC).not.toMatch(/committed\s*[<>]=?\s*required/);
    expect(SRC).not.toMatch(/required\s*[<>]=?\s*committed/);
  });

  it("covers every declared state, and refuses to style an UNKNOWN one as healthy", () => {
    // A verdict this renderer does not know must not inherit the quiet ramp, or a future
    // vocabulary lands on screen looking fine. Derived from the contract's own union, with the
    // positive control above, so a new state cannot be added without this failing first.
    for (const s of SHORTFALL_STATES) {
      expect(SRC, `no branch for ${s}`).toContain(`"${s}"`);
    }
    expect(SRC).toMatch(/default:/);
  });

  it("does NOT re-derive shortfall — it is computed upstream", () => {
    // Any subtraction of committed from required is a second subtraction, and the one on screen
    // would be the one nobody could audit against the substrate.
    //
    // The FIRST version of this guard required the two words adjacent, and a red-proof walked
    // straight past it: the real re-derivation reads `selected.required - selected.committed`,
    // with a receiver between the operator and the operand. A weak guard, not a void mutation —
    // so the pattern now tolerates any receiver, in both operand orders.
    expect(SRC).not.toMatch(/\.required\s*-\s*(?:\w+\.)?committed\b/);
    expect(SRC).not.toMatch(/\.committed\s*-\s*(?:\w+\.)?required\b/);
    expect(SRC).toMatch(/cell\.shortfall|selected\.shortfall/);
  });
});

describe("absence and units", () => {
  it("renders an absent cell as a GAP, not a zero", () => {
    expect(SRC).toMatch(/if \(!cell\)/);
    // The gap glyph, and no zero-filling of the intersection.
    expect(SRC).toContain("absentIsNotZero");
  });

  it("takes its unit from the payload and hardcodes no symbol", () => {
    // Same rule the axis learned: printing "$" because a number looks like money asserts a unit
    // the answer never sent. `value_unit` is optional in the contract; absent means silent.
    expect(SHORTFALL_GRID_CONTRACT.fields.value_unit.required).toBe(false);
    expect(SRC).toMatch(/formatAmount\(v, value_unit\)/);
    // Currency symbols as literals. `$` alone cannot be tested for — JSX template interpolation
    // uses `${` — so the quoted forms are checked instead, which is what a hardcode looks like.
    expect(SRC).not.toMatch(/["'`]\$["'`]/);
    expect(SRC).not.toMatch(/[£€¥]/);
  });

  it("shares ONE amount formatter rather than carrying a second copy", () => {
    // Two implementations of a formatting rule agree the day they are written and diverge the
    // day one is fixed. This one was lifted to lib when this component became its second consumer.
    expect(SRC).toContain('from "@/lib/formatAmount"');
  });
});

describe("`secured` survives, even though today's seed makes it look redundant", () => {
  it("is rendered in the detail panel unconditionally", () => {
    // On the current seed `committed == secured` on every row, so a renderer that dropped it
    // would lose nothing OBSERVABLE — the evacuated-population error the contract names. Its
    // absence from the panel is what would teach a reader the distinction does not exist.
    expect(SRC).toMatch(/amount\(selected\.secured\)/);
  });

  it("surfaces the divergence in the cell when there is one", () => {
    expect(SRC).toMatch(/cell\.secured !== cell\.committed/);
  });
});

describe("the acceptance rule comes from the contract, not a reimplementation", () => {
  it("calls validateShortfallGrid rather than checking rows itself", () => {
    expect(SRC).toContain("validateShortfallGrid(rows)");
  });

  it("the validator refuses what the contract says it refuses", () => {
    expect(validateShortfallGrid([]).kind).toBe("empty");
    expect(validateShortfallGrid([{ required: 1 }]).kind).toBe("empty"); // no subject
    expect(validateShortfallGrid([{ subject_id: "o1" }]).kind).toBe("empty"); // no required
    expect(
      validateShortfallGrid([
        { subject_id: "o1", subject_name: "Ops", period: "FY26-Q1", required: 10, committed: 4, secured: 4, shortfall: 6, state: "short" },
      ]).kind,
    ).toBe("ok");
  });
});

describe("the binding lands WITH the component", () => {
  it("the registry and interpreter sources are read — positive control", () => {
    expect(REGISTRY).toContain("DERIVED_BINDINGS");
    expect(INTERP).toContain("SemanticInterpreter");
  });

  it("is dispatched by the interpreter and registered in the capability set", () => {
    // The dispatch seal refuses to advertise an archetype whose renderer does not exist, so
    // these two must arrive together — registering ahead of the component earns a refusal.
    expect(INTERP).toMatch(/case "SHORTFALL_GRID":/);
    expect(INTERP).toContain("<ShortfallGrid");
    expect(REGISTRY).toContain("SHORTFALL_GRID_CONTRACT");
  });

  it("claims the full width its contract declares", () => {
    expect(SHORTFALL_GRID_CONTRACT.layout).toBe("full-width");
    expect(INTERP).toMatch(/archetype === "SHORTFALL_GRID"/);
  });
});
