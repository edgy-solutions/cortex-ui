/**
 * THE PRODUCER'S ACTUAL PAYLOAD — `cost_price_composition`, lot 3 at vintage 2021-02-01.
 *
 * Not a fixture shaped like one. These are the six steps engine-cost sends, digit for digit,
 * including the two nulls on the seed step and the fact that Overhead's basis is NOT the
 * previous running total. That last one is the whole reason this archetype exists rather than
 * CONTRIBUTION_RANKING: a reader checking that overhead was struck on labour-plus-fringe cannot
 * recover 8,429,704.92 from any of the other figures.
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { StepLadder } from "./StepLadder";
import { groupDigits, sameFigure, validateStepLadder } from "./StepLadder.contract";

afterEach(cleanup);

/** Verbatim from the producer. Changing a digit here should break a test, not be tidied. */
const STEPS = [
  { name: "Base cost", rate: null, basis: null, amount: "7865884.00", running_total: "7865884.00", value_unit: "USD" },
  { name: "Fringe", rate: "0.330", basis: "6338124.00", amount: "2091580.92", running_total: "9957464.92", value_unit: "USD" },
  { name: "Overhead", rate: "0.820", basis: "8429704.92", amount: "6912358.03", running_total: "16869822.95", value_unit: "USD" },
  { name: "G&A", rate: "0.114", basis: "16869822.95", amount: "1923159.82", running_total: "18792982.77", value_unit: "USD" },
  { name: "Cost of money", rate: "0.015", basis: "18792982.77", amount: "281894.74", running_total: "19074877.51", value_unit: "USD" },
  { name: "Profit", rate: "0.10", basis: "19074877.51", amount: "1907487.75", running_total: "20982365.26", value_unit: "USD" },
];

const payload = (over: Record<string, unknown> = {}) => ({
  archetype: "STEP_LADDER",
  output_uri: "http://invincible-agent/cost#PriceComposition",
  lot: 3,
  quantity: 18,
  fiscal_year: 2021,
  rate_vintage: "2021-02-01",
  price: "20982365.26",
  unit_price: "1165686.96",
  value_unit: "USD",
  sums: true,
  steps: STEPS,
  ...over,
});

describe("money is an exact decimal string and stays one", () => {
  it("groups without touching a digit", () => {
    // The producer's HTML groups and pads in Python, and the two must agree on every digit. A
    // formatter that went through `Number` would round a long decimal on the day it matters —
    // the manifest lying by presentation.
    expect(groupDigits("7865884.00")).toBe("7,865,884.00");
    expect(groupDigits("20982365.26")).toBe("20,982,365.26");
    expect(groupDigits("281894.74")).toBe("281,894.74");
    expect(groupDigits("999.99")).toBe("999.99");
  });

  it("keeps trailing zeros, which a number formatter eats", () => {
    // `7865884.00` is a figure quoted to the cent. Rendering it as `7,865,884` drops a claim
    // about precision that the producer made deliberately.
    expect(groupDigits("7865884.00")).toMatch(/\.00$/);
    expect(groupDigits("0.10")).toBe("0.10");
  });

  it("survives more precision than a float has", () => {
    // The check that catches `Number()` hiding in the formatter: this value cannot round-trip
    // through a double, so a parse-then-format would return something else.
    expect(groupDigits("12345678901234567890.123456789")).toBe(
      "12,345,678,901,234,567,890.123456789",
    );
  });

  it("returns anything it cannot parse VERBATIM rather than rewriting it", () => {
    // A figure this does not understand is a figure it must not touch.
    expect(groupDigits("1,234.00")).toBe("1,234.00");
    expect(groupDigits("n/a")).toBe("n/a");
    expect(groupDigits("")).toBe("");
  });

  it("handles a negative without losing the sign", () => {
    expect(groupDigits("-1234567.89")).toBe("-1,234,567.89");
  });
});

describe("the walk renders in STRIKE ORDER and is never sorted", () => {
  it("draws the six steps in the order the producer sent them", () => {
    // Order is the answer. Sorting by magnitude would assert that Profit outranks Base cost —
    // a statement nobody made — and would break every basis, since step N's descends from N−1.
    render(<StepLadder component={payload()} />);
    const names = [...document.querySelectorAll("[data-ladder-step]")].map((e) =>
      e.getAttribute("data-ladder-step"),
    );
    expect(names).toEqual(STEPS.map((s) => s.name));
  });

  it("shows the basis that CANNOT be recovered from the other figures", () => {
    // Overhead was struck on 8,429,704.92 — labour-plus-fringe — while the previous running
    // total was 9,957,464.92. This column is the difference between a checkable walk and six
    // numbers taken on faith, and it is why CONTRIBUTION_RANKING was refused for this shape.
    render(<StepLadder component={payload()} />);
    const overhead = document.querySelector('[data-ladder-step="Overhead"]')!;
    expect(overhead.textContent).toContain("8,429,704.92");
    expect(overhead.getAttribute("data-ladder-step")).toBe("Overhead");
    // The previous running total is a DIFFERENT figure, and both appear on the card.
    expect(document.body.textContent).toContain("9,957,464.92");
  });

  it("renders the running total on every step", () => {
    render(<StepLadder component={payload()} />);
    for (const s of STEPS) {
      expect(document.body.textContent, s.name).toContain(groupDigits(s.running_total));
    }
  });
});

describe("the seed step's nulls are BLANK, never zero", () => {
  it("draws no rate and no basis for Base cost", () => {
    // It is an amount, not a factor struck on something. A `0` would read as a rate that was
    // measured and came out empty — a different and false claim.
    render(<StepLadder component={payload()} />);
    const seed = document.querySelector('[data-ladder-step="Base cost"]')!;
    expect(seed.querySelector("[data-ladder-rate]")?.getAttribute("data-ladder-rate")).toBe("");
    expect(seed.querySelector("[data-ladder-basis]")?.getAttribute("data-ladder-basis")).toBe("");
    expect(seed.textContent).not.toMatch(/\b0\b(?!\d)/);
  });

  it("and the rows that DO have a rate still show it — the control", () => {
    render(<StepLadder component={payload()} />);
    const fringe = document.querySelector('[data-ladder-step="Fringe"]')!;
    expect(fringe.querySelector("[data-ladder-rate]")?.textContent).toBe("0.330");
    // Verbatim: `0.330` is quoted to three places and `0.33` is a different statement.
    expect(fringe.textContent).toContain("0.330");
  });
});

describe("a walk that does not reconcile is refused, not drawn", () => {
  it("refuses when the producer says it does not sum", () => {
    // The engine refuses to emit a build-up that fails the invariant, so a card seeing
    // `sums: false` is seeing something that should not have reached it — exactly when a
    // renderer must not draw a confident-looking table.
    render(<StepLadder component={payload({ sums: false })} />);
    expect(document.querySelector("[data-step-ladder]")).toBeNull();
    expect(screen.getByText("the walk does not reconcile")).toBeTruthy();
  });

  it("refuses when the last running total disagrees with the price", () => {
    // Two fields of one payload describing the same number and disagreeing. Nothing is
    // recomputed — no arithmetic is checked — but a reader cannot tell which one is wrong.
    render(<StepLadder component={payload({ price: "20982365.27" })} />);
    expect(document.querySelector("[data-step-ladder]")).toBeNull();
  });

  it("does NOT refuse over trailing zeros, which are not a difference", () => {
    expect(sameFigure("20982365.26", "20982365.260")).toBe(true);
    expect(sameFigure("20982365.26", "20982365.27")).toBe(false);
    render(<StepLadder component={payload({ price: "20982365.260" })} />);
    expect(document.querySelector("[data-step-ladder]")).toBeTruthy();
    // AND THE PRODUCER'S OWN STRING IS WHAT SHOWS — this is the only case where "the price" and
    // "the last running total" are distinguishable on screen, because everywhere else they are
    // the same characters. A component that re-labelled the total as the price passed every
    // other test in this file, including one written specifically to catch it.
    expect(document.querySelector("[data-ladder-price]")?.textContent).toBe("20,982,365.260");
  });

  it("draws the real payload — the control on all three refusals above", () => {
    // Without this, a component that refused everything would satisfy every test in this block.
    render(<StepLadder component={payload()} />);
    expect(document.querySelector("[data-step-ladder]")).toBeTruthy();
    expect(document.querySelector("[data-ladder-price]")?.textContent).toBe("20,982,365.26");
  });
});

describe("the other refusals name which defect they are", () => {
  it("no steps", () => {
    expect(validateStepLadder(payload({ steps: [] }))).toEqual({
      kind: "empty",
      reason: "no steps recorded",
    });
    expect(validateStepLadder({}).kind).toBe("empty");
  });

  it("a step missing its name", () => {
    const r = validateStepLadder(payload({ steps: [{ amount: "1.00" }] }));
    expect(r.kind === "empty" && r.reason).toBe("a step is missing its name");
  });

  it("a step carrying no amount", () => {
    // Every later basis descends from this figure, so an absent amount breaks the walk rather
    // than leaving one blank cell.
    const r = validateStepLadder(payload({ steps: [{ name: "Base cost" }] }));
    expect(r.kind === "empty" && r.reason).toBe("a step carries no amount");
  });
});

describe("the envelope's own figures", () => {
  it("shows the price the PRODUCER declared, not the last running total re-labelled", () => {
    // They are asserted equal before the card draws, so showing the declared figure means the
    // number a reader checks against the manifest is the manifest's own.
    render(<StepLadder component={payload()} />);
    expect(document.querySelector("[data-ladder-price]")?.textContent).toBe("20,982,365.26");
    expect(document.querySelector("[data-ladder-unit-price]")?.textContent).toBe("1,165,686.96");
  });

  it("names the rate vintage, because two build-ups differ by it alone", () => {
    render(<StepLadder component={payload()} />);
    expect(document.body.textContent).toContain("2021-02-01");
  });

  it("carries the unit, which is the question a cost answer must never leave to convention", () => {
    render(<StepLadder component={payload()} />);
    expect(document.body.textContent).toContain("USD");
  });
});

/**
 * THREE MUTATIONS SURVIVED THE FIRST PASS AND ALL THREE WERE FIXTURES, NOT CODE. Each is
 * recorded here with the reason it slipped, because the reasons differ and each is reusable.
 */
describe("the cases the first pass could not see", () => {
  it("a MIXED string is returned verbatim — the guard, actually reached", () => {
    // Deleting the parse guard changed nothing for `n/a` or `1,234.00`: neither has a digit
    // boundary the grouping regex can match, so both came back unchanged either way and the
    // assertion passed over a branch it never exercised. A figure with digits AND letters is
    // the one that gets mangled — `12,345abc` — which is exactly the silent rewrite the guard
    // exists to prevent.
    expect(groupDigits("12345abc")).toBe("12345abc");
    expect(groupDigits("1234.5.6")).toBe("1234.5.6");
  });

  it("the seed step's rate CELL is empty, asserted on the cell", () => {
    // This was asserted on the whole ROW's text with a word-boundary pattern, and a rendered
    // "0" concatenates onto the name — "Base cost0" — where `\b0\b` cannot match. The mutation
    // that renders a null rate as zero passed. The cell is the unit that has to be empty.
    render(<StepLadder component={payload()} />);
    const seed = document.querySelector('[data-ladder-step="Base cost"]')!;
    expect(seed.querySelector("[data-ladder-rate]")!.textContent).toBe("");
    expect(seed.querySelector("[data-ladder-basis]")!.textContent).toBe("");
    // The control: a step that HAS a rate renders it in the same cell.
    const fringe = document.querySelector('[data-ladder-step="Fringe"]')!;
    expect(fringe.querySelector("[data-ladder-rate]")!.textContent).toBe("0.330");
  });

  it("shows NO price when the producer sent none, rather than promoting the last total", () => {
    // In the real payload the price and the final running total are the same string, so a
    // component that showed the total where the price belongs is invisible — the mutation is a
    // no-op on every valid case. The distinction only appears when the price is absent, and
    // then it matters: the last running total presented AS the price would be cortex asserting
    // a reconciled figure the producer never declared.
    render(<StepLadder component={payload({ price: "" })} />);
    expect(document.querySelector("[data-step-ladder]")).toBeTruthy();
    expect(document.querySelector("[data-ladder-price]")).toBeNull();
    // And the walk still draws, with its own running totals intact.
    expect(document.body.textContent).toContain("20,982,365.26");
  });
});
