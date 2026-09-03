/**
 * NO METHOD, NO NUMBER.
 *
 * Engine F refuses a bare "what's the EAC" because its three named formulas disagree
 * materially on the same program — on its own seed they span $13.13M, $14.15M and $14.79M
 * against a $12.00M budget, about 14% of the budget apart. So `method` is a mandatory slot
 * with no default and the router refuses BY NAME before the call is made.
 *
 * A card that draws 14,152,381 without "CPI · EAC = BAC / CPI" undoes that refusal at the last
 * step: the engine declined to choose silently and the renderer chose silently on its behalf,
 * with the reader seeing one number and no sign that two other defensible numbers exist a
 * million dollars away.
 *
 * That is the whole reason this archetype exists rather than reusing an existing one, and it is
 * the rule these tests are for. Everything else here is ordinary.
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { ForecastMeasure } from "./ForecastMeasure";
import { validateForecastMeasure } from "./ForecastMeasure.contract";

afterEach(cleanup);

/** The producer's real row shape, field for field. */
const row = (over: Record<string, unknown> = {}) => [
  {
    program_id: "P1",
    program_name: "Meridian",
    method: "CPI",
    formula: "EAC = BAC / CPI",
    eac: 14152381,
    vac: -2152381,
    etc: 6152381,
    bac: 12000000,
    bcws: 9000000,
    bcwp: 8000000,
    acwp: 8000000,
    cpi: 1,
    spi: 0.89,
    percent_complete: 0.67,
    as_of_period: "FY26-Q3",
    reported_periods: 6,
    value_unit: "USD",
    ...over,
  },
];

describe("the method is not optional at the renderer either", () => {
  it("REFUSES to draw the number when the method is missing", () => {
    const r = validateForecastMeasure(row({ method: undefined }));
    expect(r.kind).toBe("empty");
    render(<ForecastMeasure rows={row({ method: undefined })} />);
    // The figure must not appear in ANY form — not greyed, not captioned "method unknown".
    expect(screen.queryByText(/14,152,381|14\.2M|14\.15M/)).toBeNull();
    expect(screen.getByText(/carries no method/)).toBeTruthy();
  });

  it("REFUSES when the formula is missing, even with a method name", () => {
    // A method name without its formula is a label, not a derivation. "CPI" alone does not
    // tell a reader that the figure is the budget divided by an index.
    render(<ForecastMeasure rows={row({ formula: "" })} />);
    expect(screen.queryByText(/14/)).toBeNull();
    expect(screen.getByText(/carries no method/)).toBeTruthy();
  });

  it("checks the method BEFORE the value — order is the point", () => {
    // A row with neither must refuse for the METHOD, so the message names the thing that makes
    // the number ambiguous rather than the thing that makes it absent.
    const r = validateForecastMeasure(row({ method: "", eac: undefined }));
    expect(r.kind).toBe("empty");
    if (r.kind === "empty") expect(r.reason).toMatch(/no method/);
  });

  it("draws the method and the formula alongside the figure when both are present", () => {
    render(<ForecastMeasure rows={row()} value_unit="USD" />);
    // The method now reads "CPI method", so this matches the name inside its line rather than
    // as a whole element — the assertion is that the method is SHOWN, not how it is worded.
    expect(screen.getByText(/CPI method/i)).toBeTruthy();
    expect(screen.getByText("EAC = BAC / CPI")).toBeTruthy();
    expect(screen.getByText(/\$14\.2M|\$14\.15M/)).toBeTruthy();
  });
});

describe("it reads the producer's numbers and re-derives none of them", () => {
  it("over-budget comes from the producer's `vac`, not from a subtraction here", () => {
    // `vac` is budget minus forecast, computed upstream. Two places subtracting is two places
    // to disagree — and a renderer that re-derived it would silently win that disagreement.
    render(<ForecastMeasure rows={row({ vac: -2152381 })} value_unit="USD" />);
    const over = screen.getByText(/-\$2\.2M|-\$2\.15M/);
    expect(over).toBeTruthy();
  });

  it("states NO verdict when `vac` is absent rather than computing one from bac", () => {
    render(<ForecastMeasure rows={row({ vac: undefined })} value_unit="USD" />);
    // The variance slot says nothing; it does not fall back to bac − eac.
    expect(screen.queryByText(/-\$2\.2M|-\$2\.15M/)).toBeNull();
  });

  it("and the VARIANCE TILE is not coloured adverse from a derivation either", () => {
    // The subtle half, and it was blind until a test went in: `vac` drives the breach COLOUR as
    // well as the figure. A card falling back to comparing `bac` against `eac` would paint the
    // verdict while claiming no variance — asserted in paint rather than in words, which is
    // harder to notice and just as wrong.
    //
    // MOVED WITH THE DESIGN. It used to assert on the headline, which was coloured by the
    // verdict; the headline is now always neutral, because a forecast is not itself good or bad
    // — the variance is. Left on the headline this test would still have passed and stopped
    // meaning anything, which is how a guard quietly retires.
    //
    // The row below has bac 12M against a 14.2M forecast, so a derivation WOULD say over.
    const { container } = render(<ForecastMeasure rows={row({ vac: undefined })} value_unit="USD" />);
    const tiles = [...container.querySelectorAll("div")].filter((el) =>
      /variance/i.test(el.textContent ?? ""),
    );
    expect(tiles.length).toBeGreaterThan(0); // positive control: the tile is there
    for (const t of tiles) {
      expect(t.className).not.toMatch(/rose/);
    }
  });
  it("an absent supporting quantity is an em dash, never a zero", () => {
    // A zero is a measurement. "We were not told" and "it is nought" are different claims.
    render(<ForecastMeasure rows={row({ etc: undefined })} value_unit="USD" />);
    expect(screen.getAllByText("—").length).toBeGreaterThan(0);
    expect(screen.queryByText("$0")).toBeNull();
  });

  it("says how thin the projection's basis is when it rests on one period", () => {
    // A forecast from one reported period and one from twelve are different claims wearing the
    // same number, and only this says which.
    render(<ForecastMeasure rows={row({ reported_periods: 1 })} />);
    expect(screen.getByText(/thin basis/)).toBeTruthy();
  });

  it("refuses an empty payload rather than drawing an empty card", () => {
    render(<ForecastMeasure rows={[]} />);
    expect(screen.getByText(/no forecast row recorded/)).toBeTruthy();
  });
});

describe("it inspects through the shared panel", () => {
  it("opens the same CellInspector every grid uses", () => {
    render(<ForecastMeasure rows={row()} value_unit="USD" />);
    expect(document.querySelector("[data-cell-inspector]")).toBeNull(); // positive control
    fireEvent.click(screen.getByText("inspect"));
    expect(document.querySelector("[data-cell-inspector]")).not.toBeNull();
    // And it leads with the formula, which is what "how was this reached" means here.
    expect(screen.getAllByText("EAC = BAC / CPI").length).toBeGreaterThan(0);
  });
});
