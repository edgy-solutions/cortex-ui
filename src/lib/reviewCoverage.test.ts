/**
 * reviewCoverage -- the record of sampled vs looked at. Each `it` names what turns red.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, it, expect } from "vitest";
import {
  buildReviewCoverage,
  coverageProblem,
  REVIEW_COVERAGE_RULES_VERSION,
  SERVER_COVERAGE_CHECKS,
  type CoverageCheck,
  type ReviewCoverageWire,
} from "./reviewCoverage";
import { buildReviewPlan, MIN_RUN, RUN_RULE, SAMPLES_PER_RUN, SAMPLE_ALL_UP_TO, SHARED_RULE } from "./reviewRuns";
import { readExtraction } from "./promotionReview";
import { scaleFixtureExtractionBody } from "./promotionReviewScaleFixture";

const rows = readExtraction(scaleFixtureExtractionBody("ing-1"))!.rows;
const SEED = "ing-1:1";
const plan = buildReviewPlan(rows, SEED);
const runs = plan.segments.flatMap((s) => (s.kind === "run" ? [s.run] : []));
/**
 * A fixed looked set, as it stands at promote time: every check that is NOT inside a run (stragglers, singles,
 * flagged parts: promote holds on them), all but the first four checks inside runs (so something stays
 * covered), and one non-check member.
 */
const inRun = new Set(runs.flatMap((r) => r.units));
const checkIds = [...plan.checks].sort((a, b) => a - b).map((i) => plan.units[i].id);
const runChecks = [...plan.checks].filter((i) => inRun.has(i)).sort((a, b) => a - b);
const LOOKED = new Set([
  ...[...plan.checks].filter((i) => !inRun.has(i)).map((i) => plan.units[i].id),
  ...runChecks.slice(4).map((i) => plan.units[i].id),
  plan.units.find((_, i) => inRun.has(i) && !plan.checks.has(i))!.id,
]);
const rec = buildReviewCoverage(plan, LOOKED, new Set(), SEED);
const coveredAll = rec.groups.flatMap((c) => c.parts);
const partOf = (id: string) => plan.units.find((u) => u.id === id)!.partIndex as number;
const PARTS = plan.units.map((u) => u.partIndex as number);
/** Every check looked at: nothing is left to a group. */
const ALL = new Set(plan.units.map((u) => u.id));

describe("buildReviewCoverage on the scale fixture", () => {
  it("counts parts from units, not rows; ids are part_index numbers", () => {
    expect(plan.units.length).toBe(new Set(plan.unitOfRow).size);
    expect(plan.units.length).toBe(402);
    expect(plan.units.length).toBeLessThan(rows.length);
    expect(rows.length).toBe(804);
    expect(rec.rules_version).toBe(REVIEW_COVERAGE_RULES_VERSION);
    expect(rec).not.toHaveProperty("parts");
    expect(rec).not.toHaveProperty("covered");
    expect(rec.looked_at.every((n) => typeof n === "number")).toBe(true);
    expect(plan.units.every((u) => u.rows.every((r) => rows[r].part_index === u.partIndex))).toBe(true);
  });

  it("looked_at is the looked units' part_index in plan order, and nothing else", () => {
    expect(rec.looked_at).toEqual(plan.units.filter((u) => LOOKED.has(u.id)).map((u) => u.partIndex));
  });

  it("looked_at and every group are disjoint, and together they are exactly the parts", () => {
    expect(new Set(coveredAll).size).toBe(coveredAll.length);
    expect(coveredAll.filter((id) => rec.looked_at.includes(id))).toEqual([]);
    expect(rec.looked_at.length + coveredAll.length).toBe(plan.units.length);
    expect(new Set([...rec.looked_at, ...coveredAll]).size).toBe(plan.units.length);
  });

  it("the invariant is a real check: a part looked at by no one and in no run is in no list, and coverageProblem says uncovered", () => {
    const straggler = plan.units.findIndex((u) => u.flags.some((f) => f.kind === "straggler"));
    expect(straggler).toBeGreaterThanOrEqual(0);
    const without = new Set([...LOOKED].filter((id) => id !== plan.units[straggler].id));
    const broken = buildReviewCoverage(plan, without, new Set(), SEED);
    const all = [...broken.looked_at, ...broken.groups.flatMap((c) => c.parts)];
    expect(all.length).toBeLessThan(plan.units.length);
    expect(all).not.toContain(plan.units[straggler].partIndex);
    expect(coverageProblem(broken, plan, 0)?.check).toBe("uncovered");
  });

  it("sampled is the plan's sample, in plan order, and a subset of its checks", () => {
    expect(rec.sampled).toEqual(plan.units.filter((_, i) => plan.sampled.has(i)).map((u) => u.partIndex));
    const checks = new Set(checkIds.map(partOf));
    expect(rec.sampled.every((id) => checks.has(id))).toBe(true);
    expect(rec.sampled.length).toBeLessThan(checkIds.length); // flagged parts are checks that were not sampled
  });

  it("flagged is every unit with a flag, straggler included", () => {
    expect(rec.flagged).toEqual(plan.units.filter((u) => u.flags.length > 0).map((u) => u.partIndex));
    expect(rec.flagged.length).toBeGreaterThan(0);
  });

  it("groups[].key equals the run's key and the rule is the exported constant; runs with nothing covered are omitted", () => {
    expect(rec.groups.length).toBeGreaterThan(0);
    for (const c of rec.groups) {
      expect(c.rule).toBe(RUN_RULE);
      const run = runs.find((r) => r.units.some((u) => plan.units[u].partIndex === c.parts[0]))!;
      expect(c.key).toBe(run.key);
      expect(c.parts).toEqual(run.units.filter((u) => !LOOKED.has(plan.units[u].id)).map((u) => plan.units[u].partIndex));
    }
    const all = buildReviewCoverage(plan, ALL, new Set(), SEED);
    expect(all.groups).toEqual([]);
  });

  it("shared facts carry the rule constant, the page and their confirmation, and no row count", () => {
    expect(plan.sharedFacts.length).toBeGreaterThan(0);
    expect(rec.shared).toHaveLength(plan.sharedFacts.length);
    const f0 = plan.sharedFacts[0];
    const done = buildReviewCoverage(plan, LOOKED, new Set([f0.key]), SEED);
    expect(rec.shared.every((s) => s.rule === SHARED_RULE && !s.confirmed)).toBe(true);
    expect(done.shared[0]).toMatchObject({ rule: SHARED_RULE, page: f0.ref.page, confirmed: true });
    expect(done.shared[0]).not.toHaveProperty("rows");
    expect(done.shared.slice(1).every((s) => !s.confirmed)).toBe(true);
  });

  it("shared[].parts is the distinct partIndex of the fact's rows, in plan order, not the looked parts", () => {
    const f0 = plan.sharedFacts[0];
    const expected = [...new Set(f0.rows.map((r) => rows[r].part_index as number))].sort(
      (a, b) => PARTS.indexOf(a) - PARTS.indexOf(b),
    );
    expect(rec.shared[0].parts).toEqual(expected);
    expect(f0.rows.length).toBe(402);
    expect(expected.length).toBe(402); // 402 rows of one shared fact, one row in each of 402 parts
    expect(rec.shared[0].parts.length).toBeGreaterThan(rec.looked_at.length); // not derived from what was looked at
  });

  it("the tunables come from the constants the plan is built with", () => {
    expect(rec.sample).toEqual({ seed: SEED, per_run: SAMPLES_PER_RUN, sample_all_up_to: SAMPLE_ALL_UP_TO, min_run: MIN_RUN });
    const custom = buildReviewCoverage(plan, LOOKED, new Set(), SEED, { minRun: 5, samplesPerRun: 1 });
    expect(custom.sample).toMatchObject({ per_run: 1, min_run: 5 });
  });
});

describe("coverageProblem mirrors the receiver's honour condition", () => {
  const valid = (): ReviewCoverageWire => structuredClone(rec);

  it("is null for the fixture once every check is looked at, and for the fixture's own looked set", () => {
    expect(coverageProblem(buildReviewCoverage(plan, ALL, new Set(), SEED), plan, 0)).toBeNull();
    expect(coverageProblem(valid(), plan, 0)).toBeNull();
  });

  const arms: Record<CoverageCheck, () => { check: CoverageCheck; message: string } | null> = {
    unknown_part: () => {
      const r = valid();
      r.sampled.push(99999);
      return coverageProblem(r, plan, 0);
    },
    duplicate_part: () => {
      const r = valid();
      r.looked_at.push(r.looked_at[0]);
      return coverageProblem(r, plan, 0);
    },
    overlap: () => {
      const r = valid();
      r.groups[0].parts.push(r.looked_at[0]);
      return coverageProblem(r, plan, 0);
    },
    uncovered: () => {
      const r = valid();
      r.groups[0].parts.pop();
      return coverageProblem(r, plan, 0);
    },
    rows_not_drawn: () => coverageProblem(valid(), plan, 1),
    part_without_index: () => {
      const p = structuredClone(plan);
      p.units[0].partIndex = null;
      return coverageProblem(valid(), p, 0);
    },
  };

  for (const check of Object.keys(arms) as CoverageCheck[]) {
    it(`${check}: the corrupted record is named exactly`, () => {
      const got = arms[check]();
      expect(got?.check).toBe(check);
      expect(got?.message.length).toBeGreaterThan(0);
    });
  }

  it("the arms cover every CoverageCheck, and the server's four are spelt once", () => {
    expect(Object.keys(arms).sort()).toEqual([...SERVER_COVERAGE_CHECKS, "rows_not_drawn", "part_without_index"].sort());
    expect(Object.keys(arms)).toHaveLength(6);
  });

  it("rows_not_drawn comes before the server checks: a record that passes all four is still held when rows were dropped", () => {
    expect(coverageProblem(valid(), plan, 0)).toBeNull();
    expect(coverageProblem(valid(), plan, 3)?.check).toBe("rows_not_drawn");
    const bad = valid();
    bad.sampled.push(99999);
    expect(coverageProblem(bad, plan, 3)?.check).toBe("rows_not_drawn");
  });

  it("a message names at most 5 ids, then an ellipsis", () => {
    const r = valid();
    r.sampled.push(90001, 90002, 90003, 90004, 90005, 90006, 90007);
    const m = coverageProblem(r, plan, 0)!.message;
    expect(m).toContain("90005");
    expect(m).not.toContain("90006");
    expect(m).toContain("…");
  });
});

describe("the producer declares review_coverage", () => {
  const bff = readFileSync(resolve(__dirname, "../api/generated/bff.ts"), "utf8");
  const start = bff.indexOf("export type HumanTaskActRequest = {");
  const block = start < 0 ? "" : bff.slice(start, bff.indexOf("\n};", start) + 3);

  it("control: the HumanTaskActRequest block was found and has row_edits", () => {
    expect(start).toBeGreaterThanOrEqual(0);
    expect(block).toContain("row_edits");
  });

  it("the act body declares review_coverage", () => {
    expect(block, "the generated act body lost review_coverage: re-pin or the send is a claim the server drops").toContain(
      "review_coverage?: ReviewCoverage | null",
    );
  });
});

describe("the record is the declared schema, both directions (every schema is additionalProperties: false, so an extra key is a 422)", () => {
  const spec = JSON.parse(readFileSync(resolve(__dirname, "../api/openapi/cortex-bff.openapi.json"), "utf8")) as {
    components: { schemas: Record<string, { properties: Record<string, unknown>; required?: string[]; additionalProperties?: unknown }> };
  };
  const S = spec.components.schemas;
  const keys = (o: object) => Object.keys(o).sort();
  const checkedRec = buildReviewCoverage(plan, LOOKED, new Set(plan.sharedFacts.map((f) => f.key)), SEED);

  it("control: the record has groups and shared entries to compare", () => {
    expect(checkedRec.groups.length).toBeGreaterThan(0);
    expect(checkedRec.shared.length).toBeGreaterThan(0);
  });

  it("the record's keys equal ReviewCoverage.properties (sample included)", () => {
    expect(keys(checkedRec)).toEqual(keys(S.ReviewCoverage.properties));
  });

  it("every groups[] entry's keys equal CoverageGroup.properties", () => {
    checkedRec.groups.forEach((g) => expect(keys(g)).toEqual(keys(S.CoverageGroup.properties)));
  });

  it("every shared[] entry's keys equal CoverageShared.properties", () => {
    checkedRec.shared.forEach((x) => expect(keys(x)).toEqual(keys(S.CoverageShared.properties)));
  });

  it("every schema's required keys are in the record, and all three refuse unknown keys", () => {
    const has = (k: string, o: object) => k in o;
    (S.ReviewCoverage.required ?? []).forEach((k) => expect(has(k, checkedRec), k).toBe(true));
    (S.CoverageGroup.required ?? []).forEach((k) => expect(has(k, checkedRec.groups[0]), k).toBe(true));
    (S.CoverageShared.required ?? []).forEach((k) => expect(has(k, checkedRec.shared[0]), k).toBe(true));
    expect(S.ReviewCoverage.additionalProperties).toBe(false);
    expect(S.CoverageGroup.additionalProperties).toBe(false);
    expect(S.CoverageShared.additionalProperties).toBe(false);
  });

  it("the receiver's field constraints, mirrored: bbox, page, integer ids, rules_version, sample values", () => {
    checkedRec.shared.forEach((x) => {
      expect(x.bbox).toHaveLength(4);
      x.bbox.forEach((v) => {
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThanOrEqual(1);
      });
      expect(Number.isInteger(x.page) && x.page >= 1).toBe(true);
    });
    const ids = [
      ...checkedRec.looked_at,
      ...checkedRec.sampled,
      ...checkedRec.flagged,
      ...checkedRec.groups.flatMap((g) => g.parts),
      ...checkedRec.shared.flatMap((x) => x.parts),
    ];
    expect(ids.length).toBeGreaterThan(0);
    ids.forEach((n) => expect(Number.isInteger(n)).toBe(true));
    expect(checkedRec.rules_version.length).toBeGreaterThan(0);
    Object.values(checkedRec.sample).forEach((v) => expect(["string", "number", "boolean"]).toContain(typeof v));
  });
});
