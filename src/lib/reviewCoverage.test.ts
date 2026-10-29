/**
 * reviewCoverage -- the PROPOSED record of sampled vs looked at. Each `it` names what turns red.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, it, expect } from "vitest";
import { buildReviewCoverage, REVIEW_COVERAGE_RULES_VERSION } from "./reviewCoverage";
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
const coveredAll = rec.covered.flatMap((c) => c.parts);

describe("buildReviewCoverage on the scale fixture", () => {
  it("counts parts from units, not rows", () => {
    expect(plan.units.length).toBe(new Set(plan.unitOfRow).size);
    expect(plan.units.length).toBe(402);
    expect(plan.units.length).toBeLessThan(rows.length);
    expect(rows.length).toBe(804);
    expect(rec.parts).toBe(plan.units.length);
    expect(rec.rules_version).toBe(REVIEW_COVERAGE_RULES_VERSION);
  });

  it("looked_at is the looked units in plan order, and nothing else", () => {
    expect(rec.looked_at).toEqual(plan.units.map((u) => u.id).filter((id) => LOOKED.has(id)));
  });

  it("looked_at and every covered part are disjoint, and together they are exactly the parts", () => {
    expect(new Set(coveredAll).size).toBe(coveredAll.length);
    expect(coveredAll.filter((id) => rec.looked_at.includes(id))).toEqual([]);
    expect(rec.looked_at.length + coveredAll.length).toBe(rec.parts);
    expect(new Set([...rec.looked_at, ...coveredAll]).size).toBe(rec.parts);
  });

  it("the invariant is a real check: a part looked at by no one and in no run breaks the union count", () => {
    const straggler = plan.units.findIndex((u) => u.flags.some((f) => f.kind === "straggler"));
    expect(straggler).toBeGreaterThanOrEqual(0);
    const without = new Set([...LOOKED].filter((id) => id !== plan.units[straggler].id));
    const broken = buildReviewCoverage(plan, without, new Set(), SEED);
    const all = [...broken.looked_at, ...broken.covered.flatMap((c) => c.parts)];
    expect(all.length).toBeLessThan(broken.parts);
    expect(all).not.toContain(plan.units[straggler].id);
  });

  it("sampled is the plan's sample, in plan order, and a subset of its checks", () => {
    expect(rec.sampled).toEqual(plan.units.map((u) => u.id).filter((_, i) => plan.sampled.has(i)));
    const checks = new Set(checkIds);
    expect(rec.sampled.every((id) => checks.has(id))).toBe(true);
    expect(rec.sampled.length).toBeLessThan(checkIds.length); // flagged parts are checks that were not sampled
  });

  it("flagged is every unit with a flag, straggler included", () => {
    expect(rec.flagged).toEqual(plan.units.filter((u) => u.flags.length > 0).map((u) => u.id));
    expect(rec.flagged.length).toBeGreaterThan(0);
  });

  it("covered[].key equals the run's key and the rule is the exported constant; runs with nothing covered are omitted", () => {
    expect(rec.covered.length).toBeGreaterThan(0);
    for (const c of rec.covered) {
      expect(c.rule).toBe(RUN_RULE);
      const run = runs.find((r) => r.units.some((u) => plan.units[u].id === c.parts[0]))!;
      expect(c.key).toBe(run.key);
      expect(c.parts).toEqual(run.units.map((u) => plan.units[u].id).filter((id) => !LOOKED.has(id)));
    }
    const all = buildReviewCoverage(plan, new Set(plan.units.map((u) => u.id)), new Set(), SEED);
    expect(all.covered).toEqual([]);
  });

  it("shared facts carry the rule constant, their row count and their confirmation", () => {
    expect(plan.sharedFacts.length).toBeGreaterThan(0);
    expect(rec.shared).toHaveLength(plan.sharedFacts.length);
    const f0 = plan.sharedFacts[0];
    const done = buildReviewCoverage(plan, LOOKED, new Set([f0.key]), SEED);
    expect(rec.shared.every((s) => s.rule === SHARED_RULE && !s.confirmed)).toBe(true);
    expect(done.shared[0]).toMatchObject({ rule: SHARED_RULE, rows: f0.rows.length, page: f0.ref.page, confirmed: true });
    expect(done.shared.slice(1).every((s) => !s.confirmed)).toBe(true);
  });

  it("the tunables come from the constants the plan is built with", () => {
    expect(rec.sample).toEqual({ seed: SEED, per_run: SAMPLES_PER_RUN, sample_all_up_to: SAMPLE_ALL_UP_TO, min_run: MIN_RUN });
    const custom = buildReviewCoverage(plan, LOOKED, new Set(), SEED, { minRun: 5, samplesPerRun: 1 });
    expect(custom.sample).toMatchObject({ per_run: 1, min_run: 5 });
  });
});

describe("TRIPWIRE: the producer does not declare review_coverage yet", () => {
  const bff = readFileSync(resolve(__dirname, "../api/generated/bff.ts"), "utf8");
  const start = bff.indexOf("export type HumanTaskActRequest = {");
  const block = start < 0 ? "" : bff.slice(start, bff.indexOf("\n};", start) + 3);

  it("control: the HumanTaskActRequest block was found and still has row_edits", () => {
    expect(start).toBeGreaterThanOrEqual(0);
    expect(block).toContain("row_edits");
  });

  it("the act body does not declare review_coverage", () => {
    expect(
      block.includes("review_coverage"),
      "the producer now declares review_coverage on the act body: wire buildReviewCoverage into the promote send (PromotionReviewCard) and delete this tripwire",
    ).toBe(false);
  });
});
