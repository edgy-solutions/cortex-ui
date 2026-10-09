import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { MultiSeries } from "./Card";
import { formatAmount } from "@/lib/formatAmount";
import { FAILURE_TREND_DERIVED as T } from "./fixtures/fracasFailureTrend.derived";

afterEach(cleanup);

describe("FailureTrend (derived from the producer packet, not a live capture)", () => {
  it("renders through MultiSeries without throwing, drawing a chart and not the refusal", () => {
    const { container } = render(<MultiSeries {...T} />);
    expect(container.textContent).not.toMatch(/nothing to draw/);
    expect(container.querySelector(".recharts-responsive-container")).not.toBeNull();
    expect(container.textContent).toMatch(/1 series/);
    expect(container.textContent).toMatch(/3 periods/);
    expect(container.textContent).toContain("Failures");
  });

  it("prints the noun unit 'failures' bare, with no currency symbol", () => {
    expect(formatAmount(3, "failures")).toBe("3");
    const { container } = render(<MultiSeries {...T} />);
    expect(container.textContent).not.toMatch(/[$€£¥]/);
  });
});
