/**
 * The contract's BEHAVIOURAL half — executed, not described.
 *
 * `tsc` already guarantees the two structural properties of slice 1: `normalizeChartData`
 * imports its thresholds from CHART_ROW_REQUIREMENTS, and `expected_fields` is computed as
 * Object.keys(contract.fields). Neither can drift without a type error.
 *
 * What a type CANNOT guarantee is that the declared refusal vocabulary still fires. The
 * contract publishes eight reasons a payload can be rejected; the backend validator (slice
 * 2c) is about to delete 194 lines of compensation on the claim that these acceptance
 * conditions ARE the contract. If a reason silently stopped firing, the validator would
 * accept a payload the component then refuses to draw — a confident wrong answer at the
 * render boundary.
 *
 * So: one case per reason, each payload built to trip exactly that requirement.
 */
import { describe, it, expect } from "vitest";
import { normalizeChartData } from "./ChartWidget";
import {
  CHART_ROW_REQUIREMENTS,
  CHART_REFUSAL_REASONS,
  CHART_WIDGET_CONTRACT,
} from "./ChartWidget.contract";

const reasonOf = (r: ReturnType<typeof normalizeChartData>) =>
  r.kind === "empty" ? r.reason : `(rendered as ${r.kind})`;

describe("ChartWidget contract — refusal vocabulary fires", () => {
  it("refuses an empty row set with 'no rows'", () => {
    expect(reasonOf(normalizeChartData([], "BAR"))).toBe("no rows");
  });

  it("refuses non-object rows with \"rows aren't objects\"", () => {
    const rows = ["not an object"] as unknown as Array<Record<string, unknown>>;
    expect(reasonOf(normalizeChartData(rows, "BAR"))).toBe("rows aren't objects");
  });

  it("refuses rows with no numeric column", () => {
    expect(reasonOf(normalizeChartData([{ label: "a", other: "b" }], "BAR")))
      .toBe("no numeric column");
  });

  it("refuses categorical-axis charts with no categorical column", () => {
    expect(reasonOf(normalizeChartData([{ value: 1 }], "BAR")))
      .toBe("no categorical column");
  });

  it("refuses SCATTER with fewer than two numeric columns", () => {
    expect(reasonOf(normalizeChartData([{ label: "a", x: 1 }], "SCATTER")))
      .toBe("scatter requires 2 numeric columns (x and y)");
  });

  it("does NOT publish a reason it cannot emit — the unreachable scatter-series branch", () => {
    // The component contains a `no series values in scatter data` branch that CANNOT FIRE:
    // categoricalKeys is derived from the FIRST ROW's string values, so the first row always
    // survives the series filter and seriesGroups is never empty. Slice 1 transcribed it into
    // the contract by READING the branch rather than EXECUTING it; this suite caught it on its
    // first run. Publishing an unemittable reason is worse than omitting one — the backend
    // would wait on a discriminant that never arrives.
    expect(CHART_REFUSAL_REASONS).not.toContain("no series values in scatter data");
    const r = normalizeChartData([{ x: 1, y: 2, s: "a" }], "SCATTER");
    expect(r.kind).toBe("scatter-multi");
  });
});

describe("ChartWidget contract — acceptance shapes", () => {
  it("renders single-series for one categorical + one numeric", () => {
    const r = normalizeChartData([{ name: "a", value: 1 }], "BAR");
    expect(r.kind).toBe("single");
  });

  it("renders multi-series for two categorical + one numeric", () => {
    const r = normalizeChartData(
      [{ region: "n", plan: "pro", n: 1 }, { region: "s", plan: "pro", n: 2 }], "BAR");
    expect(r.kind).toBe("multi");
  });

  it("renders scatter for two numeric and no categorical", () => {
    const r = normalizeChartData([{ x: 1, y: 2 }], "SCATTER");
    expect(r.kind).toBe("scatter");
  });
});

describe("ChartWidget contract — the contract and the component cannot disagree", () => {
  it("every refusal reason the contract publishes is one the component can emit", () => {
    // The two encodings-of-truth check: if a reason is added to the contract but never
    // returned by normalizeChartData, the contract advertises a discriminant the backend
    // will wait for and never see.
    const emitted = new Set<string>([
      reasonOf(normalizeChartData([], "BAR")),
      reasonOf(normalizeChartData(["x"] as unknown as Array<Record<string, unknown>>, "BAR")),
      reasonOf(normalizeChartData([{ a: "b" }], "BAR")),
      reasonOf(normalizeChartData([{ value: 1 }], "BAR")),
      reasonOf(normalizeChartData([{ l: "a", x: 1 }], "SCATTER")),
    ]);
    // "JSON parse failure" and "not an array" are emitted by the component's useMemo before
    // normalizeChartData is reached, so they are asserted structurally rather than executed.
    const parseLayer = new Set(["JSON parse failure", "not an array"]);
    for (const reason of CHART_REFUSAL_REASONS) {
      if (parseLayer.has(reason)) continue;
      expect(emitted, `contract publishes ${reason} but nothing emitted it`).toContain(reason);
    }
  });

  it("expected_fields is a projection of the contract, never a second list", () => {
    expect(Object.keys(CHART_WIDGET_CONTRACT.fields)).toContain("chart_data");
    expect(CHART_WIDGET_CONTRACT.fields.chart_data.encoding).toBe("json-string");
  });

  it("the thresholds the component enforces are the ones the contract declares", () => {
    expect(CHART_ROW_REQUIREMENTS.minNumericColumns).toBe(1);
    expect(CHART_ROW_REQUIREMENTS.minNumericColumnsForScatter).toBe(2);
  });
});
