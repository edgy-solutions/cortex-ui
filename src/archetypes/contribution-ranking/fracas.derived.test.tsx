import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { ContributionRanking } from "./Card";
import { formatAmount } from "@/lib/formatAmount";
import { FAILURE_RECORD_SET_DERIVED as F } from "./fixtures/fracasFailureRecordSet.derived";

afterEach(cleanup);

describe("FailureRecordSet (derived from the producer packet, not a live capture)", () => {
  it("renders through ContributionRanking without throwing and draws every row", () => {
    render(<ContributionRanking {...F} />);
    for (const r of F.rows) expect(screen.getAllByText(new RegExp(r.entity_name)).length).toBeGreaterThan(0);
    expect(screen.getAllByRole("button").length).toBe(F.rows.length);
  });

  it("prints the noun unit 'failures' bare, with no currency symbol", () => {
    expect(formatAmount(7, "failures")).toBe("7");
    const { container } = render(<ContributionRanking {...F} />);
    expect(container.textContent).not.toMatch(/[$€£¥]/);
  });
});
