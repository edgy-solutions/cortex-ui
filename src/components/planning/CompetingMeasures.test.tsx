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
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  validateCompetingMeasures,
  COMPETING_MEASURES_CONTRACT,
} from "./CompetingMeasures.contract";
import { COMPETING_MEASURES_FIXTURES } from "./fixtures/competingMeasures";

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
    render(<CompetingMeasures rows={SEED()} {...ENVELOPE} />);
    const line = document.querySelector("[data-spread]")!;
    expect(line).not.toBeNull();
    expect(line.textContent).toMatch(/13\.9% of reference/);
  });

  it("renders the PRODUCER's spread even when it disagrees with the figures", () => {
    // The assertion that proves the card does not subtract. A card computing the spread would
    // show 1,662,607 here; the producer said 999, so 999 is what must appear. Two places
    // subtracting is two places to disagree, and on float money the second place disagrees in
    // the digits the reader is being asked to trust.
    render(<CompetingMeasures rows={SEED()} {...ENVELOPE} spread={999} />);
    expect(document.querySelector("[data-spread]")!.textContent).toContain("999");
  });

  it("says the spread was NOT REPORTED rather than omitting the line", () => {
    // The methods below genuinely disagree, so a card showing the figures with no spread line
    // reads as agreement. Same rule as the ranking that says "no direction stated".
    const { spread: _s, spread_percent_of_bac: _p, ...rest } = ENVELOPE;
    render(<CompetingMeasures rows={SEED()} {...rest} />);
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
    render(<CompetingMeasures rows={rows} methods_compared={3} methods_answered={1} />);
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
      <CompetingMeasures rows={withBlank()} {...ENVELOPE} methods_answered={2} all_methods_answered={false} />,
    );
    expect(document.querySelectorAll("li")).toHaveLength(3);
    expect(document.querySelector('[data-method="CPI_SPI"]')).not.toBeNull();
  });

  it("shows the REASON where the figure would have been", () => {
    render(
      <CompetingMeasures rows={withBlank()} {...ENVELOPE} methods_answered={2} all_methods_answered={false} />,
    );
    const blankRow = document.querySelector('[data-method="CPI_SPI"]')!;
    expect(blankRow.querySelector("[data-unavailable]")!.textContent).toContain("undefined");
  });

  it("says the comparison is INCOMPLETE, so it cannot imply completeness", () => {
    render(
      <CompetingMeasures rows={withBlank()} {...ENVELOPE} methods_answered={2} all_methods_answered={false} />,
    );
    expect(document.querySelector("[data-incomplete]")!.textContent).toMatch(/2 of 3/);
  });

  it("says NOTHING when every method answered — the control", () => {
    // Without this, a card that always warned would pass the assertion above.
    render(<CompetingMeasures rows={SEED()} {...ENVELOPE} />);
    expect(document.querySelector("[data-incomplete]")).toBeNull();
  });

  it("a null figure draws NO BAR — a zero-length bar is a figure", () => {
    // A bar of zero beside real ones reads as "this method says nothing is left", which is a
    // measurement this method explicitly did not make.
    const { container } = render(
      <CompetingMeasures rows={withBlank()} {...ENVELOPE} methods_answered={2} />,
    );
    expect(container.querySelectorAll("span[style]")).toHaveLength(2);
  });
});

describe("the formula rides with the figure", () => {
  it("every row shows its formula", () => {
    // Three figures with no formulas are three unattributed numbers, and the formula is what
    // lets a reader see WHY two methods diverge rather than only that they do.
    render(<CompetingMeasures rows={SEED()} {...ENVELOPE} />);
    expect(screen.getByText("EAC = BAC / CPI")).toBeTruthy();
    expect(screen.getByText(/CPI x SPI/)).toBeTruthy();
    expect(screen.getByText("EAC = ACWP + (BAC - BCWP)")).toBeTruthy();
  });

  it("REFUSES a row with no formula", () => {
    const rows = SEED().map((r, i) => (i === 1 ? { ...r, formula: "" } : r));
    render(<CompetingMeasures rows={rows} {...ENVELOPE} />);
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
    render(<CompetingMeasures rows={PRODUCER_ROWS()} {...PRODUCER_ENVELOPE} />);
    expect(document.querySelector("[data-refused]")).toBeNull();
    expect(document.querySelectorAll("li")).toHaveLength(3);
    expect(document.querySelector("[data-spread]")!.textContent).toMatch(/13\.9%/);
  });

  it("renders the figures, not three blanks", () => {
    // The specific way it would have failed: every `eac` unread, so every row carries neither
    // a figure nor a reason, and the card refuses a payload that was entirely correct.
    render(<CompetingMeasures rows={PRODUCER_ROWS()} {...PRODUCER_ENVELOPE} />);
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
    render(<CompetingMeasures rows={PRODUCER_ROWS()} {...PRODUCER_ENVELOPE} />);
    const range = document.querySelector("[data-range]")!;
    expect(range.textContent).toMatch(/13(,130,000|\.1M)/);
    expect(range.textContent).toMatch(/14(,792,608|\.8M)/);
  });

  it("turns `vac` and `etc` into secondary figures, not columns", () => {
    // Promoting them to columns would make this a matrix — the archetype the header explains
    // this one is not.
    render(<CompetingMeasures rows={PRODUCER_ROWS()} {...PRODUCER_ENVELOPE} />);
    expect(document.querySelector('[data-method="CPI"]')!.textContent).toContain("VAC");
    expect(document.querySelector('[data-method="CPI"]')!.textContent).toContain("ETC");
  });

  it("PREFERS the structural name when both are present", () => {
    // Asserted on the rendered AMOUNT element, not the row's whole text. The first version
    // matched against the row — where the figure is immediately followed by the formula,
    // "$1EAC = BAC / CPI" — so a word-boundary assertion could not match a correct render. The
    // instrument and the subject sharing a surface, in miniature.
    const rows = PRODUCER_ROWS().map((r) => ({ ...r, value: 1 }));
    render(<CompetingMeasures rows={rows} {...PRODUCER_ENVELOPE} />);
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

/**
 * THE ROWS KEY — the second hop of the same seam, still live after the first was fixed.
 *
 * The `eac`/`value` mismatch was the FIELD inside a row. This is the key the rows arrive UNDER,
 * and it was wrong in the same way for the same reason: this contract invented `methods` while
 * every other planning archetype in the repo carries `rows`, and the projector's passthrough
 * registers `("rows", ...)`.
 *
 * So the payload would have arrived with `rows`, the component would have read `methods`, found
 * nothing, and refused "no methods recorded" for three perfectly good figures — the identical
 * failure to the one fixed an hour earlier, one hop further out, and invisible to every test
 * that had just been written to catch it.
 *
 * ALIGNED, NOT ALIASED. A component prop that differs from the payload key IS the seam, and
 * tolerating a name no producer sends would only hide the next one.
 */
describe("the payload arrives under the key the projector registers", () => {
  it("the contract declares `rows`, like every sibling archetype", () => {
    // Asserted on the contract rather than the component, because `expected_fields` is derived
    // from these keys and is what cortex publishes to the server as its acceptance rules.
    expect(Object.keys(COMPETING_MEASURES_CONTRACT.fields)).toContain("rows");
    expect(Object.keys(COMPETING_MEASURES_CONTRACT.fields)).not.toContain("methods");
  });

  it("the interpreter reads `comp.rows` for this archetype", () => {
    // The hop a component test cannot see: which key the dispatch pulls out of the payload.
    // Every node verified and the connection unasserted is how the first one survived.
    const src = readFileSync(path.join(__dirname, "../registry/SemanticInterpreter.tsx"), "utf8");
    const dispatch = src.slice(src.indexOf('case "COMPETING_MEASURES":'));
    const block = dispatch.slice(0, dispatch.indexOf("case \"CONTRIBUTION_RANKING\""));
    expect(block).toContain("rows={comp.rows}");
    // WORD-BOUNDED, because `comp.methods_compared` and `comp.methods_answered` are legitimate
    // envelope reads two lines below and both CONTAIN the substring `comp.methods`. The plain
    // containment assertion failed against a correct dispatch — the fourth time tonight a check
    // has matched a neighbour instead of its subject, and the first time inside a test written
    // to catch exactly that. A substring is not a name.
    expect(block).not.toMatch(/comp\.methods\b/);
    // Positive control: the bounded pattern really does match the thing it forbids.
    expect("methods={comp.methods}").toMatch(/comp\.methods\b/);
  });
});

/**
 * THE TWO DECISIONS NO ATTRIBUTE NAMED — ADR-0055 step 1, the derivation.
 *
 * This card went in at 8 branches / 8 attributes, and the ratio predicted fewer findings than
 * `ContributionRanking`'s 16/4. It was right about FEWER and wrong about NONE: two decisions
 * carried a claim with nothing naming them, and both are the same shape as the em-dash on the
 * ranking card — the whole of a claim being the absence of characters.
 */
describe("the absences that were only punctuation", () => {
  it("says WHY there is no range instead of printing a bare unit", () => {
    // It rendered `value_unit` — "USD" in the slot where "$4.1M – $5.0M" belongs, or an EMPTY
    // element when no unit came either. A reader saw the slot and no range, with nothing saying
    // which of "the methods agree", "the figures were not sent" or "this card failed" was true.
    const { lowest_value: _lo, highest_value: _hi, ...rest } = ENVELOPE;
    render(<CompetingMeasures rows={SEED()} {...rest} />);
    const el = document.querySelector("[data-range-absent]");
    expect(el, "no range was drawn and nothing said so").not.toBeNull();
    expect(el!.textContent).toMatch(/no range/i);
  });

  it("draws the range when the producer sent both bounds — the control", () => {
    // Without this, a card that always declared the range absent would pass the test above while
    // hiding the bounds on every complete comparison, which is the card's entire subject.
    render(<CompetingMeasures rows={SEED()} {...ENVELOPE} />);
    expect(document.querySelector("[data-range-absent]")).toBeNull();
    expect(document.querySelector("[data-range]")!.textContent).toMatch(/–/);
  });

  it("names a SECONDARY value that is absent — the primary already said why", () => {
    // The asymmetry inside one card: a missing primary figure renders `data-unavailable` WITH
    // the producer's reason, and a missing secondary rendered a bare em-dash. Same kind of fact.
    // The CONTRACT declares `secondary.value` as `number | null`; the literal below is typed
    // narrower by inference only, which is why the annotation is here and not a widening.
    const rows = SEED();
    rows[0].secondary = [{ label: "VAC", value: null as number | null }] as typeof rows[0]["secondary"];
    render(<CompetingMeasures rows={rows} {...ENVELOPE} />);
    const el = document.querySelector("[data-secondary-absent]");
    expect(el).not.toBeNull();
    expect(el!.getAttribute("data-secondary-absent")).toBe("VAC");
  });

  it("does NOT name a secondary that has a value — the control", () => {
    render(<CompetingMeasures rows={SEED()} {...ENVELOPE} />);
    expect(document.querySelector("[data-secondary-absent]")).toBeNull();
    expect(document.body.textContent).toContain("VAC");
  });
});

/**
 * ⛔ THE COMPLETENESS PAIR IS THE TRUNCATION DETECTOR — AND THIS CARD DOES NOT USE IT AS ONE.
 *
 * Raised 2026-09-26 out of a three-session argument about whether the projector may put a count
 * on the wire that the card could derive from its rows. The answer turned out to be stated in
 * prose on BOTH sides and sealed on NEITHER, which is why it was argued three times:
 *
 *   producer  `presentation_agent/main.py:658-664` — "an undefined method KEEPS ITS ROW, and
 *             without these the card cannot say that three rows are not three answers. Dropping
 *             a row would turn a comparison of three into a comparison of two without appearing
 *             to."
 *   consumer  this file's own header, and `CompetingMeasures.contract.ts` — "DROPPING IT WOULD
 *             TURN A COMPARISON OF THREE INTO A COMPARISON OF TWO WITHOUT APPEARING TO."
 *
 * So the discriminator is NOT "derivable from the rows". It is derivable from rows THAT COULD
 * HAVE BEEN TRUNCATED WITHOUT TRACE. `suppliers_above_threshold` is a property of the rows
 * present and is rightly withheld; `methods_compared` is a claim about the completeness of the
 * row set, which a card counting its own rows can never recover — the derived answer agrees with
 * the truncated set by construction. Two different rules, both correct.
 *
 * ⚠ WHAT THE CARD ACTUALLY DOES WITH IT, measured below and not what the prose implies:
 *
 *   1. The contract marks all three `required: false`, so a producer that omits them is accepted.
 *   2. Absent, `asked` falls back to `rows.length` — the exact number the field exists to
 *      contradict — and `complete` to `replied === asked`, which is then self-consistent by
 *      construction. A truncated set renders a confident full comparison with nothing blank.
 *   3. PRESENT AND DISAGREEING, nothing compares them. The heading prints `rows.length`, the
 *      banner prints `asked`, and the only gate on the banner is `!complete` — which the
 *      producer's own `all_methods_answered: true` satisfies.
 *
 * These are CHARACTERISATION seals: they assert today's behaviour so the gap has a referent, and
 * they are marked ⛔ because two of the three are defects on this side. REPORTED, NOT PATCHED —
 * making the pair required and reconciling it against `rows.length` is the consumer half of a
 * ruling that originates in invincible-agent, alongside the producer half (whether a restating
 * count must be REQUIRED when it is completeness-bearing). Same standing as the three gaps in
 * the 2026-09-26 Order E report.
 */
describe("⛔ the completeness pair as a truncation detector", () => {
  /** The producer's row set, minus one — the failure both headers describe, staged. */
  const truncated = () => SEED().slice(0, 2);

  it("⛔ says '2 methods' and claims a complete comparison of three — and flags nothing", () => {
    // The producer counted three and answered three. One row was lost downstream. Both numbers
    // are on this card and they disagree.
    render(<CompetingMeasures rows={truncated()} {...ENVELOPE} />);

    expect(document.body.textContent).toContain("2 methods");
    // ⛔ THE SILENCE, ASSERTED. `all_methods_answered: true` satisfies the only gate there is.
    expect(document.querySelector("[data-incomplete]")).toBeNull();
    // And no other element says it either — this is the strong form, not "the banner is absent".
    expect(document.body.textContent).not.toContain("3 of 2");
    expect(document.body.textContent).not.toContain("2 of 3");
  });

  it("the control — a BLANK row does raise the banner, so the instrument is not simply mute", () => {
    // Three rows, one unanswerable: the case the pair was added for, and it reports. Without
    // this the seal above would be satisfied by a card that can never say anything.
    // Built as a literal rather than by spreading SEED()[1], which infers `value: number` and
    // would not take a null — the same idiom the blank-row seals above use.
    const rows = [
      SEED()[0],
      {
        method: "CPI_SPI",
        formula: "EAC = ACWP + (BAC - BCWP) / (CPI x SPI)",
        value: null,
        unavailable_reason: "CPI x SPI is zero",
      },
      SEED()[2],
    ];
    render(
      <CompetingMeasures rows={rows} {...ENVELOPE} methods_answered={2} all_methods_answered={false} />,
    );

    const banner = document.querySelector("[data-incomplete]");
    expect(banner).not.toBeNull();
    expect(banner!.textContent).toContain("2 of 3 methods answered");
  });

  it("⛔ and when the pair is ABSENT the count is derived from the surviving rows, silently", () => {
    // The contract permits this. The derived `asked` equals the truncated row count, so the card
    // is internally consistent and wrong — the coincidence shape: the total and the parts come
    // from the same parse, so no assertion over them can ever disagree.
    const { methods_compared, methods_answered, all_methods_answered, ...rest } = ENVELOPE;
    void methods_compared;
    void methods_answered;
    void all_methods_answered;
    render(<CompetingMeasures rows={truncated()} {...rest} />);

    expect(document.body.textContent).toContain("2 methods");
    expect(document.querySelector("[data-incomplete]")).toBeNull();
  });

  it("⛔ the contract accepts a producer that omits the detector — all three are required: false", () => {
    // Asserted on the contract's own text rather than by exercising the validator, because the
    // finding is the DECLARATION. If someone makes them required, this goes red and should.
    const contract = readFileSync(
      path.join(__dirname, "CompetingMeasures.contract.ts"),
      "utf8",
    );
    for (const f of ["methods_compared", "methods_answered", "all_methods_answered"]) {
      expect(contract).toMatch(new RegExp(f + ': \{ type: "(number|boolean)", required: false \}'));
    }
    // The control: this repo DOES mark things required, so `required: false` is a choice here and
    // not the only spelling the file knows.
    expect(contract).toContain("required: true");

    // And the fallback that fills their absence, read off the component.
    const component = readFileSync(path.join(__dirname, "CompetingMeasures.tsx"), "utf8");
    expect(component).toContain("const asked = num(methods_compared) ?? rows.length;");
  });

  /**
   * ⛔ AND THE FIXTURE CORPUS CANNOT REACH THE DANGEROUS BRANCH — every fixture states the pair.
   *
   * Added 2026-09-26 after the engine lane showed that gaps 1 and 2 above have NO REACHABLE
   * PRODUCER-SIDE HALF TODAY, and the reason is narrower than either lane liked:
   * `finance_agent/measures.py:84` early-returns `None` for the WHOLE summary envelope when no
   * method produced an exact figure — so the absent-pair payload cannot be built — and
   * `tests/finance/test_eac_comparison.py:106`
   * (`test_THE_PANEL_CAN_NEVER_COME_BACK_EMPTY`) establishes why that return is itself
   * unreachable: `REMAINING_AT_BUDGET` is ACWP + (BAC - BCWP), arithmetic over figures that
   * always exist, projecting no index, so it answers whenever the program does.
   *
   * Verified here, and the archetype has exactly ONE producer — `capabilities.py:402` binds it to
   * `fin:EstimateAtCompletionComparison` and nothing else in `agent_fleet/` emits it. So this is
   * NOT the engine-scoped claim I went looking for; the reachability argument holds today.
   *
   * ⚠ WHICH IS THE ARGUMENT FOR THE FIX, NOT AGAINST IT. `asked` is safe only because of one
   * method's index-freeness in one engine, recorded in a finance test docstring. Nothing at
   * `contract.ts`, nothing in the projector's allowlist and nothing on this card knows that.
   * Add an EAC archetype whose methods all project indices, change `_totals`, or reuse this card
   * for another comparison, and the absent-`asked` path goes live with every layer green.
   *
   * THIS SEAL IS THE MEASURABLE FORM OF THAT. All six fixtures spread one `ENVELOPE`, so not one
   * of them omits the pair, and the single `data-incomplete` fixture reaches the banner through
   * the producer's explicit `all_methods_answered: false` — never through the card's own
   * `replied === asked` derivation. The branch that would carry the failure is covered by the ⛔
   * seals above and by nothing else in this repo. A corpus whose every member states a field
   * cannot report what happens when it is absent.
   */
  it("⛔ no fixture omits the completeness pair, and the only banner route is producer-stated", () => {
    expect(COMPETING_MEASURES_FIXTURES.length).toBeGreaterThan(4);

    for (const f of COMPETING_MEASURES_FIXTURES) {
      // Every fixture, not merely most: the absence must be unreachable from the corpus rather
      // than rare in it.
      //
      // ⚠ ON THE VALUE, NOT THE KEY, and the first version of this seal got that wrong. It
      // asserted `Object.keys(envelope)` contained the names, which a fixture written
      // `methods_compared: undefined` satisfies — while the card reads `num(undefined) ?? rows.length`
      // and takes the fallback. The seal was blind to the exact state it claimed to exclude, and
      // the mutation that set a fixture's value to `undefined` SURVIVED it. Presence of a key is
      // not availability of a figure.
      expect(typeof f.envelope.methods_compared, f.name).toBe("number");
      expect(typeof f.envelope.all_methods_answered, f.name).toBe("boolean");
    }

    const incomplete = COMPETING_MEASURES_FIXTURES.filter((f) =>
      f.declares.includes("data-incomplete"),
    );
    // The control: the corpus DOES exercise the banner, so this seal is about the ROUTE and not
    // about an absence of coverage.
    expect(incomplete).toHaveLength(1);
    expect(incomplete[0].envelope.all_methods_answered).toBe(false);
  });
});
