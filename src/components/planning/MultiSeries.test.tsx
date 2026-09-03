/**
 * THE SERIES ARE DECLARED, AND THIS SEAL DERIVES BOTH OF ITS AXES.
 *
 * This archetype exists because `PERIOD_SERIES` turned out to be one producer's cost curve
 * wearing a generic name — seven required keys, hardcoded `capex`/`expense` bars, an "over by"
 * column against a cap. Two Engine F payloads were bound to it on a field-level reading, and
 * neither drew.
 *
 * ── THE SEAL THAT COULD NOT FIRE, AND WHY THIS FILE IS SHAPED LIKE IT IS ───────────────────
 *
 * The producer-side seal encoding exactly this requirement — every producer emits every key its
 * archetype requires — could not catch it, because its producer list was one lambda per
 * archetype, all seven of them the SAME producer's. Its archetype axis had already been derived
 * once, after a remembered list missed SHORTFALL_GRID. Its producer axis stayed remembered, two
 * parameters to the left.
 *
 * The general form: A SEAL HAS AS MANY POPULATIONS AS ITS PARAMETRISATION HAS AXES, AND FIXING
 * ONE IS WHAT STOPS YOU THINKING ABOUT THE REST. After the first fix the seal feels enumerated
 * — it reports coverage, a coverage test guards the coverage — and nothing says "coverage of
 * archetypes, given one arbitrary producer each."
 *
 * So the tests below never name a series. Every case builds its payload from a generated
 * declaration, and the shape assertions read what came out rather than what a fixture said
 * should. A test written against `burn`/`planned` would be this file learning the first
 * consumer's vocabulary, which is the defect the archetype was minted to avoid.
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { readFileSync } from "node:fs";
import path from "node:path";
import { MultiSeries } from "./MultiSeries";
import { readReference, validateMultiSeries } from "./MultiSeries.contract";
import { assembleDerivedCapabilities } from "@/registry/assembleCapabilities";

afterEach(cleanup);

/** Build a payload of ANY shape, so no test knows a consumer's field names. */
const payload = (keys: string[], periods = 3, unit?: string | null) => ({
  series: keys.map((k) => ({ key: k, label: k.toUpperCase(), ...(unit === undefined ? {} : { unit }) })),
  rows: Array.from({ length: periods }, (_, i) => {
    const row: Record<string, unknown> = { period: `P${i + 1}` };
    for (const [n, k] of keys.entries()) row[k] = (i + 1) * (n + 1);
    return row;
  }),
});

describe("nothing about which series exist is written in the component", () => {
  it("accepts whatever the payload declares, at any arity", () => {
    // The axis that was remembered elsewhere: shapes, not one shape. Two series is the live
    // case; one and four are the ones nobody would have written a fixture for.
    //
    // ASSERTED ON THE VALIDATED DATA, NOT THE RENDERED CHART, and the reason is a real limit
    // rather than a convenience: Recharts measures its container, jsdom reports zero, and the
    // `ResponsiveContainer` renders nothing at all. A test reading the legend here would fail
    // on correct code — and one written to pass anyway would be asserting jsdom's layout, not
    // this component's behaviour.
    for (const keys of [["a"], ["a", "b"], ["w", "x", "y", "z"]]) {
      cleanup();
      const p = payload(keys);
      const r = validateMultiSeries(p.rows, p.series);
      expect(r.kind, `arity ${keys.length} was refused`).toBe("ok");
      if (r.kind === "ok") {
        expect(r.data.series.map((d) => d.key)).toEqual(keys);
      }
      // And the card states the arity it accepted, which IS observable.
      render(<MultiSeries rows={p.rows} series={p.series} />);
      expect(screen.getByText(new RegExp(`${keys.length} series`))).toBeTruthy();
    }
  });

  it("the source hardcodes NO series key — the defect it was minted to avoid", () => {
    // PERIOD_SERIES's component carries `dataKey="capex"` and `dataKey="expense"`. A literal
    // dataKey here would make this archetype specific to whoever bound to it first, and it
    // would do so invisibly: the card would still draw, just only for them.
    // COMMENTS STRIPPED FIRST. The header of that file quotes `dataKey="capex"` as the thing
    // this archetype exists to avoid, and the first version of this assertion matched its own
    // explanation and failed on correct code. Prose defeating a source regex is a defect this
    // repo has hit before; scanning code rather than the whole file is the fix.
    const raw = readFileSync(path.join(__dirname, "MultiSeries.tsx"), "utf8");
    const src = raw.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
    expect(src).toContain("dataKey={d.key}"); // positive control: driven by the declaration
    expect(src).not.toContain("dataKey=\"capex\""); // and the comment really was stripped
    const literals = src.match(/dataKey="[^"]+"/g) ?? [];
    // `period` is the x-axis, which is structural rather than a series.
    expect(literals.filter((l) => l !== 'dataKey="period"')).toEqual([]);
  });

  it("a GAP stays a gap — no line is drawn through a period nobody measured", () => {
    // SOURCE-LEVEL, and the reason is demonstrated rather than assumed: Recharts measures its
    // container, jsdom reports zero, and nothing renders — the earlier version of the arity
    // test failed on correct code for exactly that. So there is no DOM to assert against, and
    // a render assertion here would either fail always or be written until it passed, which is
    // worse.
    //
    // The behaviour matters because the default is the dishonest one: Recharts bridges a
    // missing period with a straight line, drawing a measurement nobody took, and it looks
    // exactly like data.
    const raw = readFileSync(path.join(__dirname, "MultiSeries.tsx"), "utf8");
    const src = raw.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
    expect(src).toContain("<Line"); // positive control on the stripped source
    expect(src, "gaps are being bridged").toContain("connectNulls={false}");
    expect(src).not.toContain("connectNulls={true}");
  });

  it("carries no cap, threshold or over-limit vocabulary at all", () => {
    // Those belong to PERIOD_SERIES. A burn rate has no cap and an index cannot breach one, so
    // their presence here would be this component drifting back toward the thing it replaced.
    const src = readFileSync(path.join(__dirname, "MultiSeries.tsx"), "utf8");
    const contract = readFileSync(path.join(__dirname, "MultiSeries.contract.ts"), "utf8");
    for (const word of ["over_cap", "overage", "threshold_", "cap:"]) {
      expect(src, `component mentions ${word}`).not.toContain(word);
      // The contract may NAME the absence in prose; it must not declare a field.
      expect(contract).not.toMatch(new RegExp(`\\b${word.replace(":", "")}\\s*:\\s*\\{`));
    }
  });
});

describe("a declaration it cannot honour is refused, never approximated", () => {
  it("REFUSES when the payload declares no series", () => {
    // The tempting fallback is "plot every numeric key". On the live burn-rate row that would
    // draw `trailing_periods: 6` as a series beside burn and planned.
    const p = payload(["a", "b"]);
    const r = validateMultiSeries(p.rows, undefined);
    expect(r.kind).toBe("empty");
    render(<MultiSeries rows={p.rows} series={undefined} />);
    expect(screen.getByText(/does not declare which of its keys are series/)).toBeTruthy();
  });

  it("REFUSES a declared series that appears in no row", () => {
    // A legend entry with no line reads as "this measured zero", which is a different claim
    // from "this was never sent".
    const p = payload(["a", "b"]);
    render(
      <MultiSeries rows={p.rows} series={[...p.series, { key: "ghost", label: "GHOST" }]} />,
    );
    expect(screen.getByText(/appears in no row/)).toBeTruthy();
  });

  it("REFUSES series with different units rather than sharing an axis", () => {
    // Two quantities on one y-axis is a claim that they are comparable. Dollars beside a ratio
    // makes that claim on the reader's behalf.
    render(
      <MultiSeries
        rows={payload(["a", "b"]).rows}
        series={[
          { key: "a", label: "A", unit: "USD" },
          { key: "b", label: "B", unit: null },
        ]}
      />,
    );
    expect(screen.getByText(/cannot share an axis/)).toBeTruthy();
  });

  it("treats absent and null unit as the SAME unit — both mean dimensionless", () => {
    // Otherwise a producer that omits the field on one series and sends null on another gets a
    // refusal for a difference that is not one.
    const r = validateMultiSeries(payload(["a", "b"]).rows, [
      { key: "a", label: "A" },
      { key: "b", label: "B", unit: null },
    ]);
    expect(r.kind).toBe("ok");
  });

  it("REFUSES an empty period set", () => {
    render(<MultiSeries rows={[]} series={payload(["a"]).series} />);
    expect(screen.getByText(/no periods recorded/)).toBeTruthy();
  });
});

describe("the unit belongs to the series, which retires accommodation A2", () => {
  it("says DIMENSIONLESS out loud rather than leaving a bare axis ambiguous", () => {
    // A bare axis could be dollars nobody labelled or a ratio. The payload knows; the card says.
    const p = payload(["a", "b"], 3, null);
    render(<MultiSeries rows={p.rows} series={p.series} />);
    expect(screen.getByText(/dimensionless/)).toBeTruthy();
  });

  it("names the unit when there is one", () => {
    const p = payload(["a", "b"], 3, "USD");
    render(<MultiSeries rows={p.rows} series={p.series} />);
    expect(screen.getByText(/USD/)).toBeTruthy();
  });
});

describe("the registry axis is derived too — every binding, not one per archetype", () => {
  it("EVERY row bound to MULTI_SERIES names this contract, whoever the producer is", () => {
    // The lesson this archetype was born from, applied to my own side: the assertion iterates
    // the bindings rather than the archetypes, so a SECOND producer binding here is covered the
    // day it is added. One-lambda-per-archetype is what let two Engine F payloads bind to a
    // cost curve unchallenged.
    const bound = assembleDerivedCapabilities().filter((c) => c.archetype === "MULTI_SERIES");
    expect(bound.length, "no binding uses MULTI_SERIES").toBeGreaterThan(1);
    for (const b of bound) {
      expect(b.component, `${b.subject_uri} draws with the wrong component`).toBe("MultiSeries");
      // `series` must be advertised, or a producer has no way to know it is required.
      expect(
        b.expected_fields,
        `${b.subject_uri} does not advertise the series declaration`,
      ).toContain("series");
    }
  });

  it("and NO row is still bound to the cost curve by mistake", () => {
    // The two that moved. If either reappears on PERIOD_SERIES, it is silently back to
    // requiring seven cost-curve keys.
    const stranded = assembleDerivedCapabilities().filter(
      (c) => c.archetype === "PERIOD_SERIES" && c.subject_uri.startsWith("fin:"),
    );
    expect(stranded.map((c) => c.subject_uri)).toEqual([]);
  });
});

/**
 * A DECLARED REFERENCE IS DRAWN; AN UNDECLARED ONE IS NOT INVENTED.
 *
 * The mockup shows a dashed TARGET 1.00 line and a "CPI BELOW 1.0" callout. Neither is in the
 * payload, and neither can come from the card: a performance index has a target of 1.0 and a
 * burn rate has none, so an archetype drawing a 1.0 line because a series looked like a ratio
 * would be inventing the same kind of fact as plotting `trailing_periods` — a mark that means
 * something for the first consumer and nothing for the next.
 *
 * So the producer declares the line, and the producer states the verdict. The card draws and
 * judges nothing.
 */
describe("the reference line is declared, never assumed", () => {
  it("reads a reference only when it carries a usable number", () => {
    expect(readReference({ value: 1, label: "target" })).toEqual({ value: 1, label: "target" });
    // A label with no value draws no line — there is nowhere to draw it.
    expect(readReference({ label: "target" })).toBeNull();
    expect(readReference({ value: "1" })).toBeNull();
    expect(readReference(undefined)).toBeNull();
    expect(readReference(null)).toBeNull();
  });

  it("draws NO reference when the payload declares none", () => {
    // The state both live consumers are in today. The card must look complete without it.
    const p = payload(["a", "b"]);
    const { container } = render(<MultiSeries rows={p.rows} series={p.series} />);
    expect(container.querySelector("[data-verdict]")).toBeNull();
  });

  it("the component does not name the line 'target' — that word is the producer's", () => {
    // A card labelling an undeclared line "target" would be asserting what the reference MEANS.
    // The producer's own `label` is used, and a bare value when they sent none.
    const raw = readFileSync(path.join(__dirname, "MultiSeries.tsx"), "utf8");
    const src = raw.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
    expect(src).toContain("ref.label"); // positive control: the producer's word is read
    // The WORD, not a quoted form of it: the first version of this anchored on quotes and a
    // mutation using a template literal walked straight past it. This component has no
    // legitimate use for the word at all.
    expect(src.toLowerCase()).not.toContain("target");
  });
});

describe("the verdict is stated by the producer, never inferred", () => {
  it("renders a verdict verbatim when one is sent", () => {
    const p = payload(["a", "b"]);
    render(<MultiSeries rows={p.rows} series={p.series} verdict="CPI below 1.0" />);
    expect(screen.getByText("CPI below 1.0")).toBeTruthy();
  });

  it("says NOTHING when a series sits below a declared reference and no verdict was sent", () => {
    // The whole rider. Below a line is bad for an index and good for a cost ratio, and this
    // card cannot tell which it is looking at — so a card computing the callout from
    // `value < reference.value` would be deciding what the reference means.
    const p = payload(["a", "b"]);
    const { container } = render(
      <MultiSeries rows={p.rows} series={p.series} reference={{ value: 9999, label: "line" }} />,
    );
    expect(container.querySelector("[data-verdict]")).toBeNull();
  });

  it("the component derives no verdict from the reference at all", () => {
    const raw = readFileSync(path.join(__dirname, "MultiSeries.tsx"), "utf8");
    const src = raw.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
    // No comparison of a datum against the reference anywhere in the code.
    expect(src).not.toMatch(/<\s*ref\.value|ref\.value\s*[<>]/);
  });
});

/**
 * A DASHED STROKE IS DECLARED, NOT POSITIONAL.
 *
 * The burn-rate mockup draws `planned` dashed and `spent` solid; the indices mockup draws both
 * solid. So dashing is not a general rule of the design — it means "intended rather than
 * measured", which is domain knowledge this archetype does not have.
 *
 * Varying it by POSITION would put a dash on whichever series happened to be declared second:
 * right for a plan beside an actual, wrong for one index beside another. Meaningful for the
 * first consumer and arbitrary for the next — the defect this archetype was minted to avoid,
 * in a stroke pattern instead of a field name.
 */
describe("stroke style is the producer's declaration", () => {
  it("draws dashed only where the payload asks", () => {
    const raw = readFileSync(path.join(__dirname, "MultiSeries.tsx"), "utf8");
    const src = raw.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
    expect(src).toContain("d.dashed ? "); // positive control: it is read from the declaration
    // And never from where the series sits in the list.
    expect(src).not.toMatch(/strokeDasharray=\{i\s*[=><%]/);
    expect(src).not.toMatch(/i\s*===?\s*\d+\s*\?\s*["'`][\d ]+["'`]/);
  });

  it("the declaration survives validation with its style intact", () => {
    const r = validateMultiSeries(payload(["a", "b"]).rows, [
      { key: "a", label: "A" },
      { key: "b", label: "B", dashed: true },
    ]);
    expect(r.kind).toBe("ok");
    if (r.kind === "ok") {
      expect(r.data.series[0].dashed).toBeFalsy();
      expect(r.data.series[1].dashed).toBe(true);
    }
  });

  it("a series with no style declared is not refused", () => {
    // Both live consumers send none today. An optional hint that made a payload invalid would
    // be a required field wearing an optional name.
    const p = payload(["a", "b"]);
    expect(validateMultiSeries(p.rows, p.series).kind).toBe("ok");
  });
});
