/**
 * #528 (80dcbbae, 2026-11-23): five finance cards draw the producer's `data_provenance` sentence, verbatim.
 *
 * Every arm goes through `SemanticInterpreter`, the path the app uses, so the prop pass and each
 * package's `reads` are covered, not only the bare card. Absent, blank and non-string draw nothing
 * (`ServedProvenance` already decides that; it is exercised here, not re-decided).
 */
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { SemanticInterpreter } from "@/components/registry/SemanticInterpreter";
import { COMPETING_MEASURES_FIXTURES } from "./competing-measures/fixtures";
import { CONTRIBUTION_RANKING_FIXTURES } from "./contribution-ranking/fixtures";
import { SHORTFALL_GRID_FIXTURES } from "./shortfall-grid/fixtures";
import { VARIANCE_TREE_FIXTURES } from "./variance-tree/fixtures";

afterEach(cleanup);

const BANNER =
  "NOTIONAL DATA — invented program, round figures, public EVM formulas. Not derived from any real program (ADR-0045 Decision 4).";
const ASSET =
  "Sandbox finance extract (as of 2026-11-01, ticket: T-77) Source: urn:li:dataset:(urn:li:dataPlatform:s3,fin/evm,PROD)";

type Component = Record<string, unknown>;
const GOOD_FORECAST_ROWS = [
  {
    program_id: "P1", program_name: "Meridian", method_label: "CPI", formula: "EAC = BAC / CPI",
    eac: 14152381, vac: -2152381, etc: 6152381, bac: 12000000, bcws: 9000000, bcwp: 8000000, acwp: 8000000,
    cpi: 1, spi: 0.89, percent_complete: 0.67, as_of_period: "FY26-Q3", reported_periods: 6, value_unit: "USD",
  },
];

const fromFixture = (archetype: string, fixture: object): Component => {
  const { name: _n, declares: _d, rows, envelope, ...rest } = fixture as Component & { envelope?: Component };
  return { archetype, rows, ...(envelope ?? {}), ...rest };
};
const without = (c: Component): Component => {
  const { data_provenance: _p, ...rest } = c;
  return rest;
};

const CASES: { archetype: string; ok: Component; refused: Component }[] = [
  {
    archetype: "COMPETING_MEASURES",
    ok: fromFixture("COMPETING_MEASURES", COMPETING_MEASURES_FIXTURES.find((f) => f.declares.includes("data-served-provenance"))!),
    refused: { archetype: "COMPETING_MEASURES", rows: [] },
  },
  {
    archetype: "SHORTFALL_GRID",
    ok: fromFixture("SHORTFALL_GRID", SHORTFALL_GRID_FIXTURES.find((f) => f.declares.includes("data-served-provenance"))!),
    refused: { archetype: "SHORTFALL_GRID", rows: [] },
  },
  {
    archetype: "VARIANCE_TREE",
    ok: fromFixture("VARIANCE_TREE", VARIANCE_TREE_FIXTURES.find((f) => f.declares.includes("data-served-provenance"))!),
    refused: { archetype: "VARIANCE_TREE", rows: [] },
  },
  {
    archetype: "CONTRIBUTION_RANKING",
    ok: fromFixture("CONTRIBUTION_RANKING", CONTRIBUTION_RANKING_FIXTURES.find((f) => f.declares.includes("data-served-provenance"))!),
    refused: { archetype: "CONTRIBUTION_RANKING", rows: [] },
  },
  {
    archetype: "FORECAST_MEASURE",
    ok: { archetype: "FORECAST_MEASURE", rows: GOOD_FORECAST_ROWS, value_unit: "USD", data_provenance: BANNER },
    refused: { archetype: "FORECAST_MEASURE", rows: [] },
  },
];

const drawn = (c: Component) => render(<SemanticInterpreter payload={{ components: [c] }} />).container;
// `ServedProvenance` marks its element; the interpreter's own raw-field section is a different attribute.
const shown = (c: HTMLElement) => c.querySelector("[data-served-provenance]");

describe.each(CASES)("$archetype draws the served source sentence (#528)", ({ ok, refused }) => {
  it("a payload carrying data_provenance draws it verbatim", () => {
    expect(shown(drawn({ ...ok, data_provenance: BANNER }))?.textContent).toBe(BANNER);
  });

  it("an asset sentence draws verbatim, with its as-of, because the producer said it", () => {
    expect(shown(drawn({ ...ok, data_provenance: ASSET }))?.textContent).toBe(ASSET);
  });

  it("absent draws no provenance element", () => {
    expect(shown(drawn(without(ok)))).toBeNull();
  });

  it.each([["blank", "   "], ["non-string", { urn: "x" }]])("%s draws none", (_n, v) => {
    expect(shown(drawn({ ...ok, data_provenance: v }))).toBeNull();
  });

  it("a refused payload still says where its data came from", () => {
    const c = drawn({ ...refused, data_provenance: BANNER });
    expect(c.textContent).toMatch(/nothing to draw|no rows|refus|method/i);
    expect(shown(c)?.textContent).toBe(BANNER);
  });
});
