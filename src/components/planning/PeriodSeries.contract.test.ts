/**
 * PERIOD_SERIES contract tests — the union check, applied to the first planning renderer.
 *
 * The load-bearing test here is the last one: every refusal reason this contract PUBLISHES
 * must be one `validatePeriodSeries` can actually EMIT. `ChartWidget.contract.ts` records
 * what happens without it — a reason transcribed by reading a branch rather than executing
 * it, published, unemittable, and the backend left waiting on a discriminant that never
 * arrives. That check found it on its first run. This is the same check, before the same
 * mistake.
 *
 * Its SCOPE is component-emittable reasons only. Selector-level refusals
 * (`live_view_requires_registration`, emitted by `select_presentation` at menu-scoping time)
 * are outside this population by construction and must NOT be added to it — extending this
 * check to cover them would re-create the actor blur ADR-0042 Ruling 9 exists to close, from
 * the opposite side.
 */
import { describe, expect, it } from "vitest";
import {
  PERIOD_SERIES_CONTRACT,
  PERIOD_SERIES_REFUSAL_REASONS,
  validatePeriodSeries,
} from "./PeriodSeries.contract";

const ok = [
  { period: "FY26-Q2", capex: 800000, expense: 500000, total: 1300000, cap: 1500000, over_cap: false, overage: null },
  { period: "FY26-Q3", capex: 4200000, expense: 850000, total: 5050000, cap: 4000000, over_cap: true, overage: 1050000 },
];

describe("PERIOD_SERIES contract — the refusal vocabulary fires", () => {
  it("refuses an empty series with 'no periods'", () => {
    expect(validatePeriodSeries([])).toEqual({ kind: "empty", reason: "no periods" });
  });

  it("refuses a non-array with 'no periods'", () => {
    expect(validatePeriodSeries(null)).toEqual({ kind: "empty", reason: "no periods" });
  });

  it("refuses a row with no period label", () => {
    const r = validatePeriodSeries([{ capex: 1, expense: 2, total: 3 }]);
    expect(r).toEqual({ kind: "empty", reason: "row is missing its period label" });
  });

  it("refuses non-object rows with the same reason", () => {
    expect(validatePeriodSeries([1, 2, 3])).toEqual({
      kind: "empty", reason: "row is missing its period label",
    });
  });

  it("refuses a payload carrying no numbers at all", () => {
    const r = validatePeriodSeries([{ period: "FY26-Q3", note: "tbd" }]);
    expect(r).toEqual({ kind: "empty", reason: "no numeric amount on any row" });
  });
});

describe("PERIOD_SERIES contract — acceptance", () => {
  it("accepts a well-formed series", () => {
    const r = validatePeriodSeries(ok);
    expect(r.kind).toBe("ok");
  });

  it("ACCEPTS an all-zero quarter — nothing planned is data, not a refusal", () => {
    const r = validatePeriodSeries([
      { period: "FY27-Q3", capex: 0, expense: 0, total: 0, cap: null, over_cap: false, overage: null },
    ]);
    expect(r.kind).toBe("ok");
  });

  it("ACCEPTS a null cap — uncapped is a fact, and coalescing it to 0 would paint the bar red", () => {
    const r = validatePeriodSeries([
      { period: "FY27-Q2", capex: 200000, expense: 800000, total: 1000000, cap: null, over_cap: false, overage: null },
    ]);
    expect(r.kind).toBe("ok");
    if (r.kind === "ok") expect(r.rows[0].cap).toBeNull();
  });
});

describe("PERIOD_SERIES contract — the contract and the component cannot disagree", () => {
  it("every refusal reason the contract publishes is one the validator can emit", () => {
    const emitted = new Set<string>();
    const probes: unknown[] = [
      [],                                             // no periods
      null,                                           // no periods
      [{ capex: 1 }],                                 // missing period label
      [1, 2, 3],                                      // missing period label
      [{ period: "FY26-Q3", note: "tbd" }],           // no numeric amount
    ];
    for (const p of probes) {
      const r = validatePeriodSeries(p);
      if (r.kind === "empty") emitted.add(r.reason);
    }
    for (const reason of PERIOD_SERIES_REFUSAL_REASONS) {
      expect(emitted, `contract publishes "${reason}" but nothing emitted it`).toContain(reason);
    }
  });

  it("does NOT publish live_view_requires_registration — that is the SELECTOR's refusal", () => {
    // ADR-0042 Ruling 9. The component never reaches it: select_presentation declines before
    // the payload is evaluated. Publishing it here would put an unemittable reason on the
    // wire, which is strictly worse than omitting one.
    expect(PERIOD_SERIES_REFUSAL_REASONS as readonly string[])
      .not.toContain("live_view_requires_registration");
  });

  it("declares recomputes:true so the selector can identify it as a live view", () => {
    // Without this the selector has nothing to fire Ruling 9 on — the refusal would be
    // ruled and unimplementable, which is how it was first drafted.
    expect(PERIOD_SERIES_CONTRACT.recomputes).toBe(true);
  });

  it("names a STRUCTURAL archetype, carrying no domain vocabulary", () => {
    // GENERIC-AT-BIRTH reaches archetypes with full force: the archetype string is what
    // registers, what the backend validates against, and what appears in every caller's menu.
    // "COST_CURVE" would put a domain word in the mesh vocabulary permanently.
    expect(PERIOD_SERIES_CONTRACT.archetype).toBe("PERIOD_SERIES");
    const domainWords = ["COST", "SITE", "MATURITY", "GANTT", "FUNDING", "PORTFOLIO"];
    for (const w of domainWords) {
      expect(PERIOD_SERIES_CONTRACT.archetype).not.toContain(w);
      expect(PERIOD_SERIES_CONTRACT.component.toUpperCase()).not.toContain(w);
    }
  });
});
