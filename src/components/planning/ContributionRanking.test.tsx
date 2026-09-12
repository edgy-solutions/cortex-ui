import { readFileSync } from "node:fs";
import path from "node:path";
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

/**
 * A CARD THAT DRAWS WITHOUT ITS DISTINCTION IS HARDER TO CATCH THAN ONE THAT DOES NOT DRAW.
 *
 * `favourable` absent renders grey, which is right. On its own it was also invisible: a payload
 * where NO row carries a verdict drew a full ranking of grey bars under a legend advertising two
 * colours that never appeared, and it looked complete.
 *
 * The live case is exactly this. `cost_category_breakdown` emits `direction: up|down|flat` where
 * this component reads `favourable`, so every row arrives unjudged — while a sibling cost verb
 * emits `neutral|degraded|improved` and lines up. Name AND vocabulary differ, in one file. With
 * the cost subject bindings landed the card is now SELECTED and DRAWS; it just draws flattened,
 * which is the shape most likely to be scored as a pass.
 *
 * NOTHING HERE INFERS THE VERDICT. Deciding that a cost category rising is adverse is the
 * producer's semantic call. Cortex owes the reader the fact that it is MISSING.
 */
describe("an unjudged ranking says so", () => {
  const unjudgedRows = (n = 3) =>
    Array.from({ length: n }, (_, i) => ({
      rank: i + 1,
      entity_id: `E${i}`,
      entity_name: `Category ${i}`,
      contribution: 100 - i * 10,
      share_of_total: 0.4 - i * 0.1,
      // `direction`, which this component does not read — the live shape.
      direction: "up",
    }));

  it("says NO DIRECTION STATED when the producer judged nothing", () => {
    render(<ContributionRanking rows={unjudgedRows()} scope_label="Lot 4" />);
    expect(document.querySelector("[data-no-verdict]")).toBeTruthy();
    expect(screen.getByText(/no direction stated/)).toBeTruthy();
  });

  it("does not advertise colours that are not on screen", () => {
    // The legend told a reader green and red meant something here, which invites reading the
    // absence of green as "nothing was favourable" rather than "nothing was judged".
    render(<ContributionRanking rows={unjudgedRows()} scope_label="Lot 4" />);
    expect(document.querySelector("[data-legend-unjudged]")).toBeTruthy();
    expect(document.body.textContent).not.toMatch(/favourable/);
    expect(document.body.textContent).not.toMatch(/adverse/);
  });

  it("still draws the ranking — the distinction is missing, the answer is not", () => {
    // The rows are real and the shares are real. Refusing to draw would discard a good answer
    // over a field the producer did not send.
    render(<ContributionRanking rows={unjudgedRows()} scope_label="Lot 4" />);
    expect(screen.getByText("Category 0")).toBeTruthy();
    expect(document.querySelectorAll("li").length).toBe(3);
  });

  it("says NOTHING when the producer DID judge — the control", () => {
    // Without this, a component that always warned would pass every assertion above.
    const judged = unjudgedRows().map((r, i) => ({ ...r, favourable: i === 0 }));
    render(<ContributionRanking rows={judged} scope_label="Lot 4" />);
    expect(document.querySelector("[data-no-verdict]")).toBeNull();
    expect(document.querySelector("[data-legend-unjudged]")).toBeNull();
    expect(document.body.textContent).toMatch(/favourable/);
  });

  it("marks a MIXED set, where grey sits beside colours", () => {
    // Some judged and some not is a different payload from all judged, and grey among colours
    // must not read as a third verdict.
    const mixed = unjudgedRows().map((r, i) => (i === 0 ? { ...r, favourable: true } : r));
    render(<ContributionRanking rows={mixed} scope_label="Lot 4" />);
    expect(document.querySelector("[data-legend-partial]")).toBeTruthy();
    expect(document.querySelector("[data-no-verdict]")).toBeNull();
  });

  it("does NOT read `direction`, however tempting the field name is", () => {
    // The semantic call belongs to the producer: a cost category rising may or may not be bad,
    // and one cost verb already uses `neutral|degraded|improved` for the same field name while
    // another uses `up|down|flat`. Reading either here would be a guess dressed as a judgement.
    // ASSERTS AN ACCESS, NOT THE WORD. Written as `/\bdirection\b/` this failed on the
    // component's own user-facing copy — "no direction stated" and the legend label — which is
    // prose ABOUT the field being absent, accused of being a read of it. The instrument and the
    // subject sharing a surface; the fix is to match the shape of a field access instead.
    const src = readFileSync(path.join(__dirname, "ContributionRanking.tsx"), "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/^\s*\/\/.*$/gm, "");
    expect(src).not.toMatch(/\.\s*direction\b/);
    expect(src).not.toMatch(/\[["']direction["']\]/);
    // Positive control: the read it DOES make is present, so a stripped file cannot pass this.
    expect(src).toMatch(/\.\s*favourable\b/);
  });
});

/**
 * THE COST CARD WALK — two findings measured on the rolled fleet, both render-side.
 *
 * The engine payload was correct in both cases. That is what makes them the dangerous kind: the
 * card drew, the numbers matched the walk sheet to the decimal, and the defects were in what it
 * did NOT draw and what it asserted on the data's behalf.
 *
 * `expected_fields` cannot catch either. Every archetype but CHART_WIDGET returns NOT_EVALUATED,
 * so a card with a missing column satisfies its declaration and scores as a pass.
 */
describe("the payload's own columns are not dropped", () => {
  /** Q6's labour rows, field for field — a breakdown that carries hours and a rate. */
  const labour = () => [
    { entity_id: "L1", entity_name: "Direct labour", contribution: 4938800.0, share_of_total: 0.6236, hours: "61735", rate: "80" },
    { entity_id: "L2", entity_name: "Overhead", contribution: 1888300.0, share_of_total: 0.2385, hours: "23604", rate: "80" },
    { entity_id: "L3", entity_name: "Fringe", contribution: 1092000.0, share_of_total: 0.1379, hours: "13650", rate: "80" },
  ];

  it("SHOWS hours and rate, which the card was dropping", () => {
    // The walk sheet predicted this and said why it is invisible: if the card shows only money,
    // the extra columns are being dropped and nothing reports it.
    render(<ContributionRanking rows={labour()} value_unit="USD" />);
    const first = screen.getAllByRole("button")[0];
    expect(first.querySelector("[data-extra-columns]")).not.toBeNull();
    expect(first.textContent).toContain("61735");
    expect(first.textContent).toContain("hours");
    expect(first.textContent).toContain("rate");
  });

  it("labels them with the PRODUCER's field names, not prettified", () => {
    // A title-cased local synonym is the translation layer ADR-0045 refused — and the cost lane
    // hit exactly that when one verb title-cased its keys while another read a label table.
    const rows = [{ ...labour()[0], rate_vintage: "2021-02-01" }, labour()[1]];
    render(<ContributionRanking rows={rows} value_unit="USD" />);
    expect(screen.getAllByRole("button")[0].textContent).toContain("rate_vintage");
  });

  it("does NOT format a NUMERIC extra as money either", () => {
    // Q6 sends hours and rate as STRINGS, so the string path alone left a money-formatting
    // mutation alive — it only fires on numbers. Another verb sending a numeric hours count is
    // the case that would have shipped wrong: the money formatter prints it as dollars, a unit
    // this card was never told the column carries.
    const rows = [
      { entity_id: "a", entity_name: "A", contribution: 100, share_of_total: 0.5, quantity: 61735 },
      { entity_id: "b", entity_name: "B", contribution: 50, share_of_total: 0.5 },
    ];
    render(<ContributionRanking rows={rows} value_unit="USD" />);
    const extras = screen.getAllByRole("button")[0].querySelector("[data-extra-columns]")!;
    expect(extras.textContent).toContain("61735");
    // The money formatter prefixes and abbreviates; the raw figure does neither. Asserted as
    // plain containment, because the regex written here carried literal BACKSPACE bytes — a
    // shell heredoc turned each \b into 0x08 — leaving a bare end-of-string anchor that
    // matched everything and failed against a correct render.
    expect(extras.textContent).not.toContain("$");
    expect(extras.textContent).not.toContain("61.7K");
  });

  it("does NOT format them as money — hours are not dollars", () => {
    // The money formatter would print an hours count as dollars, a unit this card was never
    // told they carry. Asserted by requiring the raw figure and forbidding a currency mark on it.
    render(<ContributionRanking rows={labour()} value_unit="USD" />);
    const extras = screen.getAllByRole("button")[0].querySelector("[data-extra-columns]")!;
    expect(extras.textContent).toContain("61735");
    expect(extras.textContent).not.toContain("$61");
  });

  it("shows NOTHING when the row carries nothing extra — the control", () => {
    // Without this, a card that always drew an empty extras strip would pass the assertions
    // above while adding a blank line to every row in the list.
    render(<ContributionRanking rows={rows()} value_unit="USD" />);
    expect(document.querySelector("[data-extra-columns]")).toBeNull();
  });

  it("does not re-show a field the card already speaks for", () => {
    // share_of_total, favourable and the note are rendered in their own places; repeating them
    // as raw columns would be the same figure twice with two formattings.
    render(<ContributionRanking rows={rows()} value_unit="USD" />);
    const first = screen.getAllByRole("button")[0];
    expect(first.textContent).not.toContain("share_of_total");
    expect(first.textContent).not.toContain("favourable");
  });

  it("does not resurrect `direction` as a column", () => {
    // It is deliberately not read as a judgement. Showing it as a column would reintroduce it
    // as one, with the reader doing the inference this card refuses to.
    const rows = [
      { entity_id: "a", entity_name: "A", contribution: 10, share_of_total: 0.5, direction: "up" },
      { entity_id: "b", entity_name: "B", contribution: 10, share_of_total: 0.5, direction: "down" },
    ];
    render(<ContributionRanking rows={rows} value_unit="USD" />);
    expect(document.body.textContent).not.toContain("direction up");
  });

  it("skips a field that is null or blank rather than printing a hole", () => {
    const rows = [
      { entity_id: "a", entity_name: "A", contribution: 10, share_of_total: 1, vintage: null, tag: "   " },
      { entity_id: "b", entity_name: "B", contribution: 5, share_of_total: 1 },
    ];
    render(<ContributionRanking rows={rows} value_unit="USD" />);
    expect(document.querySelector("[data-extra-columns]")).toBeNull();
  });
});

describe("a share is not signed like a delta", () => {
  it("a wholly positive breakdown carries NO plus", () => {
    // `+$4.9M` reads as a RISE of 4.9M when the figure is 62% of the spend. The payload sends a
    // plain positive number and asserts no direction; the plus asserted one for it.
    const rows = [
      { entity_id: "L1", entity_name: "Direct labour", contribution: 4938800.0, share_of_total: 0.6236 },
      { entity_id: "L2", entity_name: "Overhead", contribution: 1888300.0, share_of_total: 0.2385 },
    ];
    render(<ContributionRanking rows={rows} value_unit="USD" />);
    expect(document.body.textContent).not.toContain("+$");
    expect(document.body.textContent).toMatch(/\$4\.9M/);
  });

  it("a SIGNED set keeps its plus — the control, and the case it was built for", () => {
    // A variance decomposition where some rows push the total up and others pull it down. There
    // a bare number reads as a magnitude and the direction has to come from a colour, which is
    // the channel a projector loses first. Removing the plus outright would have broken this.
    const rows = [
      { entity_id: "a", entity_name: "A", contribution: 120000, share_of_total: 0.1, favourable: true },
      { entity_id: "b", entity_name: "B", contribution: -800000, share_of_total: 0.6, favourable: false },
    ];
    render(<ContributionRanking rows={rows} value_unit="USD" />);
    expect(document.body.textContent).toMatch(/\+\$120(\.0)?K/);
    expect(document.body.textContent).toMatch(/-\$800(\.0)?K/);
  });

  it("ONE negative row is enough to make the whole set signed", () => {
    // The discriminator is the SET, not the row: in a mixed list every positive figure needs to
    // be distinguishable from the negatives beside it.
    const rows = [
      { entity_id: "a", entity_name: "A", contribution: 10000, share_of_total: 0.5 },
      { entity_id: "b", entity_name: "B", contribution: -1, share_of_total: 0.5 },
    ];
    render(<ContributionRanking rows={rows} value_unit="USD" />);
    expect(document.body.textContent).toContain("+$");
  });
});
