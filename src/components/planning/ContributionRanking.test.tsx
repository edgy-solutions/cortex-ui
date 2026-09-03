/**
 * ORDER IS THE ANSWER, AND THE SHARE IS THE POINT.
 *
 * `DELTA_SET` was the candidate for this payload and the argument against it was an
 * abstraction — "the axis is inverted" — so it was tested by mapping the producer's real
 * fields. It fails in four concrete places, and three of them are testable here: there is no
 * slot for `share_of_total` (the field that answers the question), `affected[]` would be
 * permanently empty, and DELTA_SET groups by direction and discards ordering.
 *
 * What this archetype must never do is the thing reuse would have forced: infer a verdict from
 * a sign, or re-sort what the producer ranked.
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { ContributionRanking } from "./ContributionRanking";

afterEach(cleanup);

/** The producer's real row shape, field for field. */
const rows = () => [
  { entity_id: "CA1", entity_name: "Control Account 3.1", contribution: -800000, share_of_total: 0.62, favourable: false, bcws: 3000000, bcwp: 2200000, acwp: 3000000 },
  { entity_id: "CA2", entity_name: "Control Account 4.2", contribution: -300000, share_of_total: 0.23, favourable: false },
  { entity_id: "CA3", entity_name: "Control Account 2.7", contribution: 120000, share_of_total: 0.09, favourable: true },
];

describe("the producer's order is rendered verbatim", () => {
  it("does NOT re-sort — the ranking is upstream", () => {
    // Re-sorting here would be a second implementation of the ranking, and the two would
    // disagree the first time the producer changed its tie-break. Given deliberately
    // out-of-magnitude order, the render must follow the array.
    const scrambled = [rows()[2], rows()[0], rows()[1]];
    render(<ContributionRanking rows={scrambled} value_unit="USD" />);
    const names = screen.getAllByRole("button").map((b) => b.textContent ?? "");
    expect(names[0]).toContain("Control Account 2.7");
    expect(names[1]).toContain("Control Account 3.1");
  });
});

describe("the verdict is the producer's, never inferred from the sign", () => {
  it("a positive contribution marked ADVERSE renders adverse", () => {
    // The trap reuse would have set: in cost variance a positive number is favourable, in
    // another measure it is not. A renderer deciding from `contribution > 0` is right on this
    // payload and wrong on the next.
    render(
      <ContributionRanking
        rows={[{ entity_id: "x", entity_name: "X", contribution: 5000, favourable: false, share_of_total: 1 }]}
        value_unit="USD"
      />,
    );
    const amount = screen.getByText(/\$5(\.0)?K/);
    expect(amount.className).toMatch(/rose/);
  });

  it("an UNSTATED verdict is neutral, not a guess", () => {
    render(
      <ContributionRanking
        rows={[{ entity_id: "x", entity_name: "X", contribution: 5000, share_of_total: 1 }]}
        value_unit="USD"
      />,
    );
    const amount = screen.getByText(/\$5(\.0)?K/);
    expect(amount.className).not.toMatch(/rose|emerald/);
  });
});

describe("the share carries the meaning", () => {
  it("a NULL share renders absent, never 0%", () => {
    // Null means the total was zero — there is no share of nothing. "0%" would read as
    // "contributes nothing", which is the opposite of "we cannot say".
    render(
      <ContributionRanking
        rows={[{ entity_id: "x", entity_name: "X", contribution: 400, share_of_total: null }]}
      />,
    );
    expect(screen.getByText("—")).toBeTruthy();
    expect(screen.queryByText("0%")).toBeNull();
  });

  it("bars scale to the LARGEST share present, not to 100%", () => {
    // A set whose biggest driver is 9% would otherwise draw four invisible bars.
    const small = [
      { entity_id: "a", entity_name: "A", contribution: 90, share_of_total: 0.09 },
      { entity_id: "b", entity_name: "B", contribution: 30, share_of_total: 0.03 },
    ];
    const { container } = render(<ContributionRanking rows={small} />);
    const widths = [...container.querySelectorAll("span[style]")].map(
      (el) => (el as HTMLElement).style.width,
    );
    expect(widths[0]).toBe("100%");
    expect(parseFloat(widths[1])).toBeCloseTo(33.3, 0);
  });
});

describe("a caveat is rendered on the row it qualifies", () => {
  it("shows the producer's note beside its own contributor", () => {
    // The level-of-effort case: a schedule variance that is structurally zero and carries no
    // information about progress. Shown anywhere else, it is a caveat nobody connects to the
    // number it qualifies.
    render(
      <ContributionRanking
        rows={[
          { entity_id: "a", entity_name: "A", contribution: 1, share_of_total: 1 },
          { entity_id: "b", entity_name: "B", contribution: 2, share_of_total: 1, note: "LEVEL_OF_EFFORT: carries no information about progress." },
        ]}
      />,
    );
    const noted = screen.getAllByRole("button")[1];
    expect(noted.textContent).toContain("LEVEL_OF_EFFORT");
  });
});

describe("it refuses rather than drawing an empty ranking", () => {
  it("no rows", () => {
    render(<ContributionRanking rows={[]} />);
    expect(screen.getByText(/no contributors recorded/)).toBeTruthy();
  });

  it("a contributor with no contribution", () => {
    render(<ContributionRanking rows={[{ entity_id: "a", entity_name: "A" }]} />);
    expect(screen.getByText(/carries no contribution/)).toBeTruthy();
  });

  it("a contributor with no name", () => {
    // A row that cannot be identified cannot be ranked against anything. Rendering it as a
    // blank line in an ordered list would put an anonymous entry between two named ones and
    // let a reader think the gap was the data.
    render(<ContributionRanking rows={[{ entity_id: "a", contribution: 5 }]} />);
    expect(screen.getByText(/missing its name/)).toBeTruthy();
  });
  it("inspects through the shared panel", () => {
    render(<ContributionRanking rows={rows()} value_unit="USD" />);
    expect(document.querySelector("[data-cell-inspector]")).toBeNull();
    fireEvent.click(screen.getAllByRole("button")[0]);
    expect(document.querySelector("[data-cell-inspector]")).not.toBeNull();
  });
});

describe("direction is legible without colour", () => {
  it("shows the SIGN explicitly, plus included", () => {
    // In a list where some contributions push a total up and others pull it down, a bare number
    // reads as a magnitude and the direction has to be inferred from a colour — the channel a
    // projector loses first. `formatAmount` already carries a minus; only the plus is added.
    render(
      <ContributionRanking
        rows={[
          { entity_id: "a", entity_name: "A", contribution: 120000, share_of_total: 0.1, favourable: true },
          { entity_id: "b", entity_name: "B", contribution: -800000, share_of_total: 0.6, favourable: false },
        ]}
        value_unit="USD"
      />,
    );
    const rows = screen.getAllByRole("button");
    expect(rows[0].textContent, "a favourable contribution shows no plus").toMatch(/\+\$120(\.0)?K/);
    expect(rows[1].textContent).toMatch(/-\$800(\.0)?K/);
  });
});
