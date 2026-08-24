/**
 * The axis defect this guards was not a formatting preference — it was a TRUNCATION that
 * produced plausible wrong numbers.
 *
 * The value axes render into a negative left margin (`left: -20`, deliberate, to buy plot
 * width). A raw seven-digit tick is wider than the gutter that leaves, so its leading digits
 * were clipped off the edge: an axis whose values were 0 / 500K / 1M / 1.5M displayed as
 * "0 / 500000 / 000000 / 500000". A reader cannot tell a clipped 1000000 from a real 000000,
 * and the second one is a number. An unreadable axis announces itself; this one did not.
 *
 * The second property is the one that will be argued with later, so it is stated as a test:
 * the formatter is UNIT-LESS ON PURPOSE. `CHART_WIDGET_CONTRACT` declares no unit, currency
 * or value-kind field, so nothing in the payload says these are dollars. "$1.5M" would be the
 * axis asserting a unit the answer never claimed — the same defect as the hardcoded engine
 * name that used to sit in this component's footer. When the contract grows a unit field,
 * this test is the place that should change.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it, expect } from "vitest";
import { formatAxisValue } from "./ChartWidget";
import { CHART_WIDGET_CONTRACT } from "./ChartWidget.contract";

const SRC = readFileSync(path.join(__dirname, "ChartWidget.tsx"), "utf8");

describe("every value axis is actually WIRED to the formatter", () => {
  // Added because the red-proof exposed the hole: deleting `tickFormatter` from every axis
  // left all of the tests below green. A formatter that is correct and unused is exactly the
  // truncated axis we started with. Testing the function is not testing its use.
  const axes = SRC.match(/<YAxis\b[\s\S]*?\/>/g) ?? [];

  it("the axis extraction found the axes — positive control", () => {
    // A regex that stopped matching would make the assertion below pass over an empty list.
    expect(axes.length).toBeGreaterThanOrEqual(3);
  });

  it("no value axis renders raw numbers — that is the clipping, re-introduced", () => {
    const unwired = axes.filter((a) => !a.includes("tickFormatter={formatAxisValue}"));
    expect(unwired).toEqual([]);
  });
});

describe("formatAxisValue", () => {
  it("keeps a seven-digit tick SHORT — the clipping this fixes made wrong numbers, not unreadable ones", () => {
    // 1_000_000 clipped to "000000" is the whole bug: six characters that read as a value.
    expect(formatAxisValue(1_000_000)).toBe("1M");
    expect(formatAxisValue(1_500_000)).toBe("1.5M");
    for (const v of [1_000_000, 1_500_000, 2_000_000, 999_999_999]) {
      expect(formatAxisValue(v).length).toBeLessThanOrEqual(6);
    }
  });

  it("asserts NO unit — the contract declares none, so the axis may not invent one", () => {
    // Guarded against the well-meaning "it's a cost curve, add a $" change. If the contract
    // ever gains a unit field this test should be REPLACED, not deleted quietly.
    const fields = Object.keys(CHART_WIDGET_CONTRACT.fields);
    expect(fields).not.toContain("unit");
    expect(fields).not.toContain("currency");
    expect(fields).not.toContain("value_kind");
    for (const v of [1_500_000, 500, 0]) {
      expect(formatAxisValue(v)).not.toMatch(/[$£€]/);
    }
  });

  it("does not round away precision the reader can still use below 1000", () => {
    // Compacting here would turn 742 into "0.7K" — destroying detail that already fit.
    expect(formatAxisValue(742)).toBe("742");
    expect(formatAxisValue(0)).toBe("0");
    expect(formatAxisValue(-250)).toBe("-250");
  });

  it("trims a trailing .0 but keeps a real decimal", () => {
    expect(formatAxisValue(2_000_000)).toBe("2M");
    expect(formatAxisValue(2_500_000)).toBe("2.5M");
    expect(formatAxisValue(1_000)).toBe("1K");
    expect(formatAxisValue(1_200)).toBe("1.2K");
    expect(formatAxisValue(3_000_000_000)).toBe("3B");
  });

  it("carries the sign — a negative variance must not read as an overrun", () => {
    // On a cost curve the sign IS the meaning.
    expect(formatAxisValue(-1_500_000)).toBe("-1.5M");
  });

  it("passes DEGENERATE values through instead of printing NaN at the reader", () => {
    // The red-proof case. A projector emitting null/"" for a tick must not render "NaN" on
    // an executive's chart; echoing the input is honest about the payload being wrong.
    expect(formatAxisValue(NaN)).toBe("NaN");
    expect(formatAxisValue("" as unknown as number)).toBe("");
    expect(formatAxisValue("n/a")).toBe("n/a");
    expect(formatAxisValue(Infinity)).toBe("Infinity");
  });

  it("accepts a numeric STRING — chart_data arrives as parsed JSON, where numbers can be quoted", () => {
    expect(formatAxisValue("1500000")).toBe("1.5M");
  });
});
