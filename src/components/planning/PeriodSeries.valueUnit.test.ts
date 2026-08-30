import { readFileSync } from "node:fs";
import path from "node:path";
/**
 * CHARACTERIZATION — `value_unit` is ADVERTISED on PERIOD_SERIES and never consumed.
 *
 * Not a repair. This pins a gap so the next reader does not assume the field works, and so the
 * day someone wires it up this file goes red and makes them decide the thing that matters.
 *
 * The state, verified rather than asserted:
 *   - `PERIOD_SERIES_CONTRACT.fields.value_unit` exists, with a paragraph explaining that an
 *     absent unit means the axis reads `1.5M` rather than `$1.5M`;
 *   - `expected_fields` is COMPUTED from the contract, so the field is advertised to the mesh;
 *   - `SemanticInterpreter`'s PERIOD_SERIES case passes rows / scope_label / valid_as_of /
 *     state_version and NOT value_unit;
 *   - `PeriodSeriesProps` has no unit prop, and the component formats through a private `fmt`
 *     that takes no unit.
 *
 * Fourth of a species this week, after the tree-shaken seed global, the never-emitted
 * `elapsed_ms`, and CANVAS_SEED's `name`. The tell is always the same: the field is optional,
 * the fallback is reasonable, and nothing fails.
 *
 * IT ALSO CORRECTS A CLAIM I FILED. The producer queue says Engine P emitting `value_unit` on
 * the cost curve needs "no frontend change" and the axis renders `$1.5M` the moment it lands.
 * That is true for CHART_WIDGET and SHORTFALL_GRID, which both thread it through to
 * `formatAmount`. It is false for PERIOD_SERIES, which is the cost curve's own archetype.
 *
 * ── AND WIRING IT UP IS NOT THE OBVIOUS ONE-LINER ────────────────────────────────────────
 *
 * Engine F's `fin_performance_indices` emits CPI/SPI — dimensionless ratios — and names its row
 * field `amount_unit` precisely so the projector's `rows[0]` lift cannot promote a currency onto
 * a ratio chart. So a PERIOD_SERIES that starts honouring `value_unit` inherits that hazard on
 * this side of the wire: the guard against `$` on a CPI axis currently lives entirely in a
 * producer's field name. Whoever connects the field owns that case.
 */
import { describe, it, expect } from "vitest";
import { PERIOD_SERIES_CONTRACT } from "./PeriodSeries.contract";

const HERE = __dirname;
const COMPONENT = readFileSync(path.join(HERE, "PeriodSeries.tsx"), "utf8");
const INTERPRETER = readFileSync(
  path.join(HERE, "../registry/SemanticInterpreter.tsx"),
  "utf8",
);

describe("PERIOD_SERIES advertises a unit it does not use", () => {
  it("the contract DECLARES value_unit — so it is advertised", () => {
    // `expected_fields` is a projection of this map, so declaring it here is what puts it on
    // the wire. Positive control for everything below.
    expect(Object.keys(PERIOD_SERIES_CONTRACT.fields)).toContain("value_unit");
  });

  it("the interpreter does NOT pass it to the component", () => {
    const start = INTERPRETER.indexOf('case "PERIOD_SERIES":');
    expect(start).toBeGreaterThan(0); // positive control on the slice
    const block = INTERPRETER.slice(start, INTERPRETER.indexOf("case ", start + 10));
    expect(block).toContain("<PeriodSeries"); // the slice really is the dispatch
    expect(block).not.toContain("value_unit");
  });

  it("the component does not accept a unit at all", () => {
    const props = COMPONENT.slice(
      COMPONENT.indexOf("export interface PeriodSeriesProps"),
      COMPONENT.indexOf("}", COMPONENT.indexOf("export interface PeriodSeriesProps")),
    );
    expect(props.length).toBeGreaterThan(40); // positive control on the slice
    expect(props).not.toContain("value_unit");
    expect(props).not.toContain("unit");
  });

  it("and it does not reach formatAmount, which is where a unit would be honoured", () => {
    // The two archetypes that DO honour it both route through this one formatter. PERIOD_SERIES
    // formats with a private helper instead, which is why the field goes nowhere.
    expect(COMPONENT).not.toContain("formatAmount");
  });
});
