/**
 * THE SPREAD IS THE FINDING, AND A SHORTER PANEL IS THE FAILURE.
 *
 * R-001: all three estimate-at-completion methods belong on one panel because *pinning hides
 * the divergence that is the finding*. It was unsatisfiable from the day it was ruled — the
 * verb took one method — and the engine lane has now made it satisfiable and handed over the
 * analysis rather than a binding.
 *
 * Two properties carry the archetype, and both are easy to lose in a way that still draws:
 *
 *  1. A card that prints three figures and leaves the reader to subtract two of them has
 *     published the numbers and withheld the answer. That is what R-001 refuses.
 *
 *  2. Dropping an undefined method turns a comparison of THREE into a comparison of TWO
 *     WITHOUT APPEARING TO. The reader cannot see the absence of a row they were never shown.
 *
 * ── WHAT THESE SEALS CANNOT DISTINGUISH ───────────────────────────────────────────────────
 *
 * They cannot tell a method that is undefined from one that ERRORED — both arrive as
 * `value: null` with a reason, and both correctly keep their row. The distinction is in the
 * reason text, which is the producer's prose and is rendered verbatim rather than parsed.
 *
 * They cannot verify the spread is ARITHMETICALLY correct. That is deliberate: the producer
 * computes it and this card renders it, so a test that recomputed the subtraction would install
 * the second opinion the contract exists to forbid. What is asserted is that the card does not
 * compute it — by giving it a spread that disagrees with the figures and requiring the
 * producer's to be shown.
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { CompetingMeasures } from "./CompetingMeasures";
import { validateCompetingMeasures } from "./CompetingMeasures.contract";

afterEach(cleanup);

/** The engine's own notional seed, field for field. */
const SEED = () => [
  {
    method: "CPI",
    formula: "EAC = BAC / CPI",
    value: 14152380.95,
    unavailable_reason: null,
    secondary: [
      { label: "VAC", value: -2152380.95 },
      { label: "ETC", value: 6722380.95 },
    ],
  },
  {
    method: "CPI_SPI",
    formula: "EAC = ACWP + (BAC - BCWP) / (CPI x SPI)",
    value: 14792607.71,
    unavailable_reason: null,
  },
  {
    method: "REMAINING_AT_BUDGET",
    formula: "EAC = ACWP + (BAC - BCWP)",
    value: 13130000.0,
    unavailable_reason: null,
  },
];

const ENVELOPE = {
  spread: 1662607.71,
  spread_percent_of_bac: 0.1386,
  lowest_value: 13130000.0,
  highest_value: 14792607.71,
  methods_compared: 3,
  methods_answered: 3,
  all_methods_answered: true,
  reference_value: 12000000,
  value_unit: "USD",
  scope_label: "Notional Program Meridian",
};

describe("the spread is shown, and never computed here", () => {
  it("states the spread and what fraction of the reference it is", () => {
    // 1,662,607 is 13.9% of a 12M budget. A reader who has to work that out has been handed
    // the data and not the finding.
    render(<CompetingMeasures methods={SEED()} {...ENVELOPE} />);
    const line = document.querySelector("[data-spread]")!;
    expect(line).not.toBeNull();
    expect(line.textContent).toMatch(/13\.9% of reference/);
  });

  it("renders the PRODUCER's spread even when it disagrees with the figures", () => {
    // The assertion that proves the card does not subtract. A card computing the spread would
    // show 1,662,607 here; the producer said 999, so 999 is what must appear. Two places
    // subtracting is two places to disagree, and on float money the second place disagrees in
    // the digits the reader is being asked to trust.
    render(<CompetingMeasures methods={SEED()} {...ENVELOPE} spread={999} />);
    expect(document.querySelector("[data-spread]")!.textContent).toContain("999");
  });

  it("says the spread was NOT REPORTED rather than omitting the line", () => {
    // The methods below genuinely disagree, so a card showing the figures with no spread line
    // reads as agreement. Same rule as the ranking that says "no direction stated".
    const { spread: _s, spread_percent_of_bac: _p, ...rest } = ENVELOPE;
    render(<CompetingMeasures methods={SEED()} {...rest} />);
    expect(document.querySelector("[data-spread]")).toBeNull();
    expect(document.querySelector("[data-spread-unreported]")).not.toBeNull();
  });

  it("says NOTHING about a spread when fewer than two methods answered", () => {
    // There is no spread of one figure, and claiming one was "not reported" would invent a
    // missing measurement. The control for the test above.
    const rows = [
      SEED()[0],
      { method: "CPI_SPI", formula: "f", value: null, unavailable_reason: "CPI x SPI is zero" },
      { method: "RAB", formula: "g", value: null, unavailable_reason: "no baseline" },
    ];
    render(<CompetingMeasures methods={rows} methods_compared={3} methods_answered={1} />);
    expect(document.querySelector("[data-spread-unreported]")).toBeNull();
  });
});

describe("an undefined method keeps its row", () => {
  const withBlank = () => [
    SEED()[0],
    {
      method: "CPI_SPI",
      formula: "EAC = ACWP + (BAC - BCWP) / (CPI x SPI)",
      value: null,
      unavailable_reason: "CPI x SPI is zero — the quotient is undefined",
    },
    SEED()[2],
  ];

  it("draws all THREE rows, not the two that answered", () => {
    // The specific failure this verb exists to prevent. A quietly shorter panel cannot be
    // detected by the reader: they never saw the row that is missing.
    render(
      <CompetingMeasures methods={withBlank()} {...ENVELOPE} methods_answered={2} all_methods_answered={false} />,
    );
    expect(document.querySelectorAll("li")).toHaveLength(3);
    expect(document.querySelector('[data-method="CPI_SPI"]')).not.toBeNull();
  });

  it("shows the REASON where the figure would have been", () => {
    render(
      <CompetingMeasures methods={withBlank()} {...ENVELOPE} methods_answered={2} all_methods_answered={false} />,
    );
    const blankRow = document.querySelector('[data-method="CPI_SPI"]')!;
    expect(blankRow.querySelector("[data-unavailable]")!.textContent).toContain("undefined");
  });

  it("says the comparison is INCOMPLETE, so it cannot imply completeness", () => {
    render(
      <CompetingMeasures methods={withBlank()} {...ENVELOPE} methods_answered={2} all_methods_answered={false} />,
    );
    expect(document.querySelector("[data-incomplete]")!.textContent).toMatch(/2 of 3/);
  });

  it("says NOTHING when every method answered — the control", () => {
    // Without this, a card that always warned would pass the assertion above.
    render(<CompetingMeasures methods={SEED()} {...ENVELOPE} />);
    expect(document.querySelector("[data-incomplete]")).toBeNull();
  });

  it("a null figure draws NO BAR — a zero-length bar is a figure", () => {
    // A bar of zero beside real ones reads as "this method says nothing is left", which is a
    // measurement this method explicitly did not make.
    const { container } = render(
      <CompetingMeasures methods={withBlank()} {...ENVELOPE} methods_answered={2} />,
    );
    expect(container.querySelectorAll("span[style]")).toHaveLength(2);
  });
});

describe("the formula rides with the figure", () => {
  it("every row shows its formula", () => {
    // Three figures with no formulas are three unattributed numbers, and the formula is what
    // lets a reader see WHY two methods diverge rather than only that they do.
    render(<CompetingMeasures methods={SEED()} {...ENVELOPE} />);
    expect(screen.getByText("EAC = BAC / CPI")).toBeTruthy();
    expect(screen.getByText(/CPI x SPI/)).toBeTruthy();
    expect(screen.getByText("EAC = ACWP + (BAC - BCWP)")).toBeTruthy();
  });

  it("REFUSES a row with no formula", () => {
    const rows = SEED().map((r, i) => (i === 1 ? { ...r, formula: "" } : r));
    render(<CompetingMeasures methods={rows} {...ENVELOPE} />);
    expect(document.querySelector("[data-refused]")!.textContent).toMatch(/no formula/);
  });
});

describe("it refuses rather than drawing a comparison of nothing", () => {
  const reasonOf = (rows: unknown) => {
    const r = validateCompetingMeasures(rows);
    return r.kind === "empty" ? r.reason : null;
  };

  it("no methods", () => {
    expect(reasonOf([])).toBe("no methods recorded");
  });

  it("ONE method is not a comparison — it is a FORECAST_MEASURE", () => {
    expect(reasonOf([SEED()[0]])).toMatch(/needs something to compare/);
  });

  it("a method with no name", () => {
    expect(reasonOf([{ formula: "f", value: 1 }, SEED()[0]])).toBe("method is missing its name");
  });

  it("a method with NEITHER a figure nor a reason — the forbidden state", () => {
    // The important one. A blank row with no explanation leaves the reader unable to tell
    // undefined from errored from lost.
    const rows = [SEED()[0], { method: "X", formula: "f", value: null, unavailable_reason: null }];
    expect(reasonOf(rows)).toBe("method carries neither a figure nor a reason");
  });

  it("a figure AND a reason together is ALLOWED", () => {
    // The producer may explain a figure it doubts. Refusing that would force it to choose
    // between reporting a number and qualifying it.
    const rows = [
      SEED()[0],
      { method: "X", formula: "f", value: 5, unavailable_reason: "index is provisional" },
    ];
    expect(reasonOf(rows)).toBeNull();
  });

  it("a blank reason is not a reason", () => {
    const rows = [SEED()[0], { method: "X", formula: "f", value: null, unavailable_reason: "   " }];
    expect(reasonOf(rows)).toBe("method carries neither a figure nor a reason");
  });
});

/**
 * THE PRODUCER'S ACTUAL PAYLOAD, which is not the shape this contract named.
 *
 * The archetype is structural — three inflation indices and three sizing techniques want this
 * card, and none of them have an "eac". The first consumer is finance and sends `eac`, `vac`,
 * `etc`, `lowest_eac`, `highest_eac`.
 *
 * BUILT AGAINST THE STRUCTURAL NAMES AND BOUND AGAINST THE DOMAIN ONES is exactly how a card
 * lands, draws, and shows nothing: the binding succeeds, the rows arrive, every figure reads as
 * absent, and the card refuses with "neither a figure nor a reason" for a payload that carried
 * three perfectly good figures. That is the failure this file exists to catch, and it would
 * have looked like the producer's fault.
 *
 * Both names are read, structural preferred, and the alias ANNOUNCES itself — the `canvas_type`
 * ruling applied again: a quietly-honoured alias is indistinguishable from the name a producer
 * should be sending.
 */
describe("the first consumer's field names are read, and named", () => {
  /** Exactly what `fin_eac_comparison` emits after the envelope move (854e76d). */
  const PRODUCER_ROWS = () => [
    { method: "CPI", formula: "EAC = BAC / CPI", eac: 14152380.95, vac: -2152380.95, etc: 6722380.95, unavailable_reason: null },
    { method: "CPI_SPI", formula: "EAC = ACWP + (BAC - BCWP) / (CPI x SPI)", eac: 14792607.71, vac: -2792607.71, etc: 7362607.71, unavailable_reason: null },
    { method: "REMAINING_AT_BUDGET", formula: "EAC = ACWP + (BAC - BCWP)", eac: 13130000.0, vac: -1130000.0, etc: 5700000.0, unavailable_reason: null },
  ];
  const PRODUCER_ENVELOPE = {
    spread: 1662607.71,
    spread_percent_of_bac: 0.1386,
    lowest_eac: 13130000.0,
    highest_eac: 14792607.71,
    methods_compared: 3,
    methods_answered: 3,
    all_methods_answered: true,
    value_unit: "USD",
    scope_label: "Notional Program Meridian",
  };

  it("DRAWS the producer's real payload — the integration this could have failed silently", () => {
    render(<CompetingMeasures methods={PRODUCER_ROWS()} {...PRODUCER_ENVELOPE} />);
    expect(document.querySelector("[data-refused]")).toBeNull();
    expect(document.querySelectorAll("li")).toHaveLength(3);
    expect(document.querySelector("[data-spread]")!.textContent).toMatch(/13\.9%/);
  });

  it("renders the figures, not three blanks", () => {
    // The specific way it would have failed: every `eac` unread, so every row carries neither
    // a figure nor a reason, and the card refuses a payload that was entirely correct.
    render(<CompetingMeasures methods={PRODUCER_ROWS()} {...PRODUCER_ENVELOPE} />);
    expect(document.querySelector('[data-method="CPI"]')!.textContent).toMatch(/14/);
    expect(document.querySelectorAll("[data-unavailable]")).toHaveLength(0);
  });

  it("reads the RANGE from the producer's names too", () => {
    // The half that fails quietly rather than loudly: a missing range blanks one line and the
    // card still looks fine, so nothing reports it.
    //
    // SCOPED TO THE RANGE ELEMENT. The first version matched `document.body`, and 13,130,000 is
    // ALSO the lowest method's own figure two rows down — so the assertion passed whether or not
    // the range was read, and a mutation blanking it survived. Third time tonight the page has
    // contained the evidence for a claim the element never made.
    render(<CompetingMeasures methods={PRODUCER_ROWS()} {...PRODUCER_ENVELOPE} />);
    const range = document.querySelector("[data-range]")!;
    expect(range.textContent).toMatch(/13(,130,000|\.1M)/);
    expect(range.textContent).toMatch(/14(,792,608|\.8M)/);
  });

  it("turns `vac` and `etc` into secondary figures, not columns", () => {
    // Promoting them to columns would make this a matrix — the archetype the header explains
    // this one is not.
    render(<CompetingMeasures methods={PRODUCER_ROWS()} {...PRODUCER_ENVELOPE} />);
    expect(document.querySelector('[data-method="CPI"]')!.textContent).toContain("VAC");
    expect(document.querySelector('[data-method="CPI"]')!.textContent).toContain("ETC");
  });

  it("PREFERS the structural name when both are present", () => {
    // Asserted on the rendered AMOUNT element, not the row's whole text. The first version
    // matched against the row — where the figure is immediately followed by the formula,
    // "$1EAC = BAC / CPI" — so a word-boundary assertion could not match a correct render. The
    // instrument and the subject sharing a surface, in miniature.
    const rows = PRODUCER_ROWS().map((r) => ({ ...r, value: 1 }));
    render(<CompetingMeasures methods={rows} {...PRODUCER_ENVELOPE} />);
    const amount = document.querySelector('[data-method="CPI"] .tabular-nums')!;
    expect(amount.textContent!.trim()).toMatch(/^\$1(\.00?)?$/);
  });

  it("SAYS it read a domain alias — tolerated is not standard", async () => {
    // A FRESH MODULE, because the once-per-name guard is module state and the renders above
    // have already tripped every name. Written first against the shared module, where it failed
    // for a reason with nothing to do with the behaviour — a test whose subject is "this
    // happens exactly once" has to control the thing that remembers.
    vi.resetModules();
    const fresh = await import("./CompetingMeasures.contract");
    const seen: string[] = [];
    const spy = vi.spyOn(console, "warn").mockImplementation((...a: unknown[]) => {
      seen.push(a.join(" "));
    });
    try {
      fresh.readField({ highest_eac: 5 }, "highest_value");
      // And only once, however many times it is asked.
      fresh.readField({ highest_eac: 5 }, "highest_value");
    } finally {
      spy.mockRestore();
    }
    expect(seen).toHaveLength(1);
    expect(seen[0]).toContain("highest_eac");
    expect(seen[0]).toContain("highest_value");
  });

  it("says NOTHING when the structural name is used, and returns IT", async () => {
    vi.resetModules();
    const fresh = await import("./CompetingMeasures.contract");
    const seen: string[] = [];
    const spy = vi.spyOn(console, "warn").mockImplementation((...a: unknown[]) => {
      seen.push(a.join(" "));
    });
    try {
      // Both present: the structural name wins AND nothing is reported, because no alias was
      // read. Asserting the return value too, so this cannot pass by reading neither.
      expect(fresh.readField({ lowest_value: 5, lowest_eac: 9 }, "lowest_value")).toBe(5);
    } finally {
      spy.mockRestore();
    }
    expect(seen).toEqual([]);
  });
});
