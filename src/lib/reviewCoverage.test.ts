/**
 * reviewCoverage -- the record of sampled vs looked at. Each `it` names what turns red.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, it, expect } from "vitest";
import {
  buildReviewCoverage,
  coverageProblem,
  coverageRowProblem,
  PLAN_ITEM_KIND,
  serverCoverageChecks,
  type CoverageCheck,
  type ItemReviewCoverageWire,
} from "./reviewCoverage";
import { buildReviewPlan, MIN_RUN, MIN_SHARED, RUN_RULE, SAMPLES_PER_RUN, SAMPLE_ALL_UP_TO, SHARED_RULE } from "./reviewRuns";
import { planOptsFromRow, type ShapeRow } from "./reviewShapes";
import { REVIEW_SHAPES_FIXTURE } from "./reviewShapesFixture";
import { readExtraction } from "./promotionReview";
import { scaleFixtureExtractionBody } from "./promotionReviewScaleFixture";

const rows = readExtraction(scaleFixtureExtractionBody("ing-1"))!.rows;
const SEED = "ing-1:1";
/** The served notice row (41230a7e): the plan and the record are built from it, never from literals. */
const ROW: ShapeRow = REVIEW_SHAPES_FIXTURE.find((r) => r.review_shape === "notice")!;
const OPTS = planOptsFromRow(ROW);
const plan = buildReviewPlan(rows, SEED, OPTS);
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
const rec = buildReviewCoverage(plan, LOOKED, new Set(), SEED, ROW, OPTS);
const coveredAll = rec.groups.flatMap((c) => c.items);
const partOf = (id: string) => String(plan.units.find((u) => u.id === id)!.partIndex);
const PARTS = plan.units.map((u) => String(u.partIndex));
/** Every check looked at: nothing is left to a group. */
const ALL = new Set(plan.units.map((u) => u.id));

describe("buildReviewCoverage on the scale fixture", () => {
  it("counts parts from units, not rows; ids are part_index strings", () => {
    expect(plan.units.length).toBe(new Set(plan.unitOfRow).size);
    expect(plan.units.length).toBe(402);
    expect(plan.units.length).toBeLessThan(rows.length);
    expect(rows.length).toBe(804);
    expect(rec.rules_version).toBe(ROW.rules_version);
    expect(rec).not.toHaveProperty("parts");
    expect(rec).not.toHaveProperty("covered");
    expect(rec.looked_at.every((n) => typeof n === "string")).toBe(true);
    expect(plan.units.every((u) => u.rows.every((r) => rows[r].part_index === u.partIndex))).toBe(true);
  });

  it("looked_at is the looked units' part_index in plan order, and nothing else", () => {
    expect(rec.looked_at).toEqual(plan.units.filter((u) => LOOKED.has(u.id)).map((u) => String(u.partIndex)));
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
    const broken = buildReviewCoverage(plan, without, new Set(), SEED, ROW, OPTS);
    const all = [...broken.looked_at, ...broken.groups.flatMap((c) => c.items)];
    expect(all.length).toBeLessThan(plan.units.length);
    expect(all).not.toContain(String(plan.units[straggler].partIndex));
    expect(coverageProblem(broken, plan, 0)?.check).toBe("uncovered");
  });

  it("sampled is the plan's sample, in plan order, and a subset of its checks", () => {
    expect(rec.sampled).toEqual(plan.units.filter((_, i) => plan.sampled.has(i)).map((u) => String(u.partIndex)));
    const checks = new Set(checkIds.map(partOf));
    expect(rec.sampled.every((id) => checks.has(id))).toBe(true);
    expect(rec.sampled.length).toBeLessThan(checkIds.length); // flagged parts are checks that were not sampled
  });

  it("flagged is every unit with a flag, straggler included", () => {
    expect(rec.flagged).toEqual(plan.units.filter((u) => u.flags.length > 0).map((u) => String(u.partIndex)));
    expect(rec.flagged.length).toBeGreaterThan(0);
  });

  it("groups[].key equals the run's key and the rule is the exported constant; runs with nothing covered are omitted", () => {
    expect(rec.groups.length).toBeGreaterThan(0);
    for (const c of rec.groups) {
      expect(c.rule).toBe(RUN_RULE);
      const run = runs.find((r) => r.units.some((u) => String(plan.units[u].partIndex) === c.items[0]))!;
      expect(c.key).toBe(run.key);
      expect(c.items).toEqual(run.units.filter((u) => !LOOKED.has(plan.units[u].id)).map((u) => String(plan.units[u].partIndex)));
    }
    const all = buildReviewCoverage(plan, ALL, new Set(), SEED, ROW, OPTS);
    expect(all.groups).toEqual([]);
  });

  it("shared facts carry the rule constant, the page and their confirmation, and no row count", () => {
    expect(plan.sharedFacts.length).toBeGreaterThan(0);
    expect(rec.shared).toHaveLength(plan.sharedFacts.length);
    const f0 = plan.sharedFacts[0];
    const done = buildReviewCoverage(plan, LOOKED, new Set([f0.key]), SEED, ROW, OPTS);
    expect(rec.shared.every((s) => s.rule === SHARED_RULE && !s.confirmed)).toBe(true);
    expect(done.shared[0]).toMatchObject({ rule: SHARED_RULE, page: f0.ref.page, confirmed: true });
    expect(done.shared[0]).not.toHaveProperty("rows");
    expect(done.shared.slice(1).every((s) => !s.confirmed)).toBe(true);
  });

  it("shared[].items is the distinct partIndex of the fact's rows, in plan order, not the looked parts", () => {
    const f0 = plan.sharedFacts[0];
    const expected = [...new Set(f0.rows.map((r) => String(rows[r].part_index)))].sort(
      (a, b) => PARTS.indexOf(a) - PARTS.indexOf(b),
    );
    expect(rec.shared[0].items).toEqual(expected);
    expect(f0.rows.length).toBe(402);
    expect(expected.length).toBe(402); // 402 rows of one shared fact, one row in each of 402 parts
    expect(rec.shared[0].items.length).toBeGreaterThan(rec.looked_at.length); // not derived from what was looked at
  });

  it("the tunables come from the constants the plan is built with", () => {
    expect(rec.sample).toEqual({ seed: SEED, per_run: SAMPLES_PER_RUN, sample_all_up_to: SAMPLE_ALL_UP_TO, min_run: MIN_RUN });
    const custom = buildReviewCoverage(plan, LOOKED, new Set(), SEED, ROW, { minRun: 5, samplesPerRun: 1, sampleAllUpTo: 7 });
    expect(custom.sample).toMatchObject({ per_run: 1, min_run: 5, sample_all_up_to: 7 });
  });
});

describe("coverageProblem mirrors the receiver's honour condition", () => {
  const valid = (): ItemReviewCoverageWire => structuredClone(rec);

  it("is null for the fixture once every check is looked at, and for the fixture's own looked set", () => {
    expect(coverageProblem(buildReviewCoverage(plan, ALL, new Set(), SEED, ROW, OPTS), plan, 0)).toBeNull();
    expect(coverageProblem(valid(), plan, 0)).toBeNull();
  });

  const arms: Record<CoverageCheck, () => { check: CoverageCheck; message: string } | null> = {
    unknown_part: () => {
      const r = valid();
      r.sampled.push("99999");
      return coverageProblem(r, plan, 0);
    },
    duplicate_part: () => {
      const r = valid();
      r.looked_at.push(r.looked_at[0]);
      return coverageProblem(r, plan, 0);
    },
    overlap: () => {
      const r = valid();
      r.groups[0].items.push(r.looked_at[0]);
      return coverageProblem(r, plan, 0);
    },
    uncovered: () => {
      const r = valid();
      r.groups[0].items.pop();
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
    expect(Object.keys(arms).sort()).toEqual([...serverCoverageChecks(PLAN_ITEM_KIND), "rows_not_drawn", "part_without_index"].sort());
    expect(Object.keys(arms)).toHaveLength(6);
  });

  it("rows_not_drawn comes before the server checks: a record that passes all four is still held when rows were dropped", () => {
    expect(coverageProblem(valid(), plan, 0)).toBeNull();
    expect(coverageProblem(valid(), plan, 3)?.check).toBe("rows_not_drawn");
    const bad = valid();
    bad.sampled.push("99999");
    expect(coverageProblem(bad, plan, 3)?.check).toBe("rows_not_drawn");
  });

  it("a message names at most 5 ids, then an ellipsis", () => {
    const r = valid();
    r.sampled.push("90001", "90002", "90003", "90004", "90005", "90006", "90007");
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

  it("the act body declares review_coverage, and its type names ItemReviewCoverage (the form this module builds)", () => {
    expect(block, "the generated act body lost review_coverage: re-pin or the send is a claim the server drops").toContain(
      "review_coverage?: ItemReviewCoverage | ReviewCoverage | null",
    );
  });
});

describe("the record is the declared schema, both directions (every schema is additionalProperties: false, so an extra key is a 422)", () => {
  const spec = JSON.parse(readFileSync(resolve(__dirname, "../api/openapi/cortex-bff.openapi.json"), "utf8")) as {
    components: { schemas: Record<string, { properties: Record<string, unknown>; required?: string[]; additionalProperties?: unknown }> };
  };
  const S = spec.components.schemas;
  const keys = (o: object) => Object.keys(o).sort();
  const checkedRec = buildReviewCoverage(plan, LOOKED, new Set(plan.sharedFacts.map((f) => f.key)), SEED, ROW, OPTS);

  it("control: the record has groups and shared entries to compare", () => {
    expect(checkedRec.groups.length).toBeGreaterThan(0);
    expect(checkedRec.shared.length).toBeGreaterThan(0);
  });

  it("the record's keys equal ItemReviewCoverage.properties (sample included)", () => {
    expect(keys(checkedRec)).toEqual(keys(S.ItemReviewCoverage.properties));
  });

  it("every groups[] entry's keys equal ItemCoverageGroup.properties", () => {
    checkedRec.groups.forEach((g) => expect(keys(g)).toEqual(keys(S.ItemCoverageGroup.properties)));
  });

  it("every shared[] entry's keys equal ItemCoverageShared.properties", () => {
    checkedRec.shared.forEach((x) => expect(keys(x)).toEqual(keys(S.ItemCoverageShared.properties)));
  });

  it("every schema's required keys are in the record, and all three refuse unknown keys", () => {
    const has = (k: string, o: object) => k in o;
    (S.ItemReviewCoverage.required ?? []).forEach((k) => expect(has(k, checkedRec), k).toBe(true));
    (S.ItemCoverageGroup.required ?? []).forEach((k) => expect(has(k, checkedRec.groups[0]), k).toBe(true));
    (S.ItemCoverageShared.required ?? []).forEach((k) => expect(has(k, checkedRec.shared[0]), k).toBe(true));
    expect(S.ItemReviewCoverage.additionalProperties).toBe(false);
    expect(S.ItemCoverageGroup.additionalProperties).toBe(false);
    expect(S.ItemCoverageShared.additionalProperties).toBe(false);
  });

  it("the receiver's field constraints, mirrored: bbox, page, string ids, rules_version minLength, sample values", () => {
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
      ...checkedRec.groups.flatMap((g) => g.items),
      ...checkedRec.shared.flatMap((x) => x.items),
    ];
    expect(ids.length).toBeGreaterThan(0);
    ids.forEach((n) => expect(typeof n).toBe("string"));
    expect(S.ItemReviewCoverage.properties.rules_version).toMatchObject({ type: "string", minLength: 1 });
    expect(S.ItemCoverageGroup.properties.items).toMatchObject({ items: { type: "string" } });
    expect(S.ItemCoverageShared.properties.items).toMatchObject({ items: { type: "string" } });
    expect(checkedRec.rules_version.length).toBeGreaterThan(0);
    Object.values(checkedRec.sample ?? {}).forEach((v) => expect(["string", "number", "boolean"]).toContain(typeof v));
  });
});

describe("the record reads the served row, never a literal", () => {
  it("review_shape, item_kind and rules_version equal the row's; a row saying x.v9 gives x.v9", () => {
    expect(rec).toMatchObject({ review_shape: ROW.review_shape, item_kind: ROW.item_kind, rules_version: ROW.rules_version });
    const other = buildReviewCoverage(plan, LOOKED, new Set(), SEED, { ...ROW, rules_version: "x.v9", item_kind: "y", review_shape: "z" }, OPTS);
    expect(other).toMatchObject({ rules_version: "x.v9", item_kind: "y", review_shape: "z" });
  });

  it("reviewCoverage.ts source holds no rules_version literal (a `.v1\"` string)", () => {
    const src = readFileSync(resolve(__dirname, "reviewCoverage.ts"), "utf8");
    expect(src).not.toMatch(/\.v\d+"/);
  });

  it("every id in every list is a string of a part_index", () => {
    const all = [...rec.looked_at, ...rec.sampled, ...rec.flagged, ...rec.groups.flatMap((g) => g.items), ...rec.shared.flatMap((x) => x.items)];
    expect(all.length).toBeGreaterThan(0);
    all.forEach((id) => expect(id).toMatch(/^\d+$/));
  });
});

describe("planOptsFromRow: the row's params change the plan, and the record states what was used", () => {
  const withRule = (id: string, params: Record<string, unknown>): ShapeRow => ({
    ...ROW,
    rules: ROW.rules.map((r) => (r.id === id ? { id, params: { ...r.params, ...params } } : r)),
  });
  const build = (row: ShapeRow) => {
    const o = planOptsFromRow(row);
    const p = buildReviewPlan(rows, SEED, o);
    return { p, o, r: buildReviewCoverage(p, new Set(), new Set(), SEED, row, o) };
  };
  const runsOf = (p: typeof plan) => p.segments.flatMap((s) => (s.kind === "run" ? [s.run] : []));

  it("min_run 25: every run has at least 25 members, the plan differs from the default, sample.min_run is 25", () => {
    const { p, r } = build(withRule(RUN_RULE, { min_run: 25 }));
    expect(runsOf(p).length).toBeGreaterThan(0);
    runsOf(p).forEach((run) => expect(run.units.length).toBeGreaterThanOrEqual(25));
    expect(runsOf(plan).some((run) => run.units.length < 25)).toBe(true); // control: the default plan does hold shorter runs
    expect(p.segments).not.toEqual(plan.segments);
    expect(r.sample?.min_run).toBe(25);
    expect(runsOf(p).length).toBeLessThan(runsOf(plan).length);
  });

  it("per_run 1: fewer sampled than the default plan, sample.per_run is 1", () => {
    const { p, r } = build(withRule(RUN_RULE, { per_run: 1 }));
    expect(p.sampled.size).toBeLessThan(plan.sampled.size);
    expect(r.sample?.per_run).toBe(1);
  });

  it("sample_all_up_to 100: every run (the largest is 40) is sampled whole, so the sample is larger than the default plan's", () => {
    const { p, r } = build(withRule(RUN_RULE, { sample_all_up_to: 100 }));
    expect(p.sampled.size).toBeGreaterThan(plan.sampled.size);
    expect(r.sample?.sample_all_up_to).toBe(100);
  });

  it("min_shared above the fact's row count: no shared fact, where the default plan has them", () => {
    expect(plan.sharedFacts.length).toBeGreaterThan(0);
    const { p } = build(withRule(SHARED_RULE, { min_shared: 100000 }));
    expect(p.sharedFacts).toEqual([]);
  });

  it("a param absent, zero, negative, fractional or non-numeric is the mechanism default; an unimplemented rule id is ignored", () => {
    const o = planOptsFromRow({
      ...ROW,
      rules: [
        { id: RUN_RULE, params: { min_run: 0, per_run: -1, sample_all_up_to: 2.5 } },
        { id: SHARED_RULE, params: { min_shared: "3" } },
        { id: "some_future_rule", params: { min_run: 9 } },
      ],
    });
    expect(o).toEqual({ runs: true, shared: true, minRun: MIN_RUN, samplesPerRun: SAMPLES_PER_RUN, sampleAllUpTo: SAMPLE_ALL_UP_TO, minShared: MIN_SHARED });
    expect(planOptsFromRow(null)).toEqual({});
  });

  it("a row without same_shape_run: no run segments, groups empty, and the record passes coverageProblem once every check is looked", () => {
    const row: ShapeRow = { ...ROW, rules: ROW.rules.filter((r) => r.id !== RUN_RULE) };
    const o = planOptsFromRow(row);
    expect(o.runs).toBe(false);
    const p = buildReviewPlan(rows, SEED, o);
    expect(p.segments.every((s) => s.kind === "single")).toBe(true);
    expect([...p.checks]).toHaveLength(p.units.length); // each unit stands alone, so each is a check
    const none = buildReviewCoverage(p, new Set(), new Set(), SEED, row, o);
    expect(none.groups).toEqual([]);
    const every = new Set(p.units.map((u) => u.id));
    const r = buildReviewCoverage(p, every, new Set(), SEED, row, o);
    expect(r.groups).toEqual([]);
    expect(coverageProblem(r, p, 0)).toBeNull();
    expect(coverageRowProblem(r, row)).toBeNull();
  });

  it("a row without same_inherited_crop: shared is empty, where the default record has entries", () => {
    const row: ShapeRow = { ...ROW, rules: ROW.rules.filter((r) => r.id !== SHARED_RULE) };
    const { r } = build(row);
    expect(rec.shared.length).toBeGreaterThan(0);
    expect(r.shared).toEqual([]);
  });
});

describe("coverageRowProblem mirrors the server's row_problem, one corrupted record per check", () => {
  const valid = (): ItemReviewCoverageWire => structuredClone(rec);

  it("is null for the honest record", () => {
    expect(coverageRowProblem(valid(), ROW)).toBeNull();
  });

  it("item_kind: a record naming another kind is named item_kind", () => {
    const r = valid();
    r.item_kind = "section";
    expect(coverageRowProblem(r, ROW)?.check).toBe("item_kind");
  });

  it("unknown_rules_version: a record naming another version is named so", () => {
    const r = valid();
    r.rules_version = "notice.v0";
    expect(coverageRowProblem(r, ROW)?.check).toBe("unknown_rules_version");
  });

  it("unknown_rule: a group or shared entry naming a rule the row dropped is named unknown_rule, and the message names where", () => {
    const noRun: ShapeRow = { ...ROW, rules: ROW.rules.filter((r) => r.id !== RUN_RULE) };
    const g = coverageRowProblem(valid(), noRun);
    expect(g?.check).toBe("unknown_rule");
    expect(g?.message).toContain("groups");
    const noShared: ShapeRow = { ...ROW, rules: ROW.rules.filter((r) => r.id !== SHARED_RULE) };
    const r = valid();
    r.groups = [];
    expect(coverageRowProblem(r, noShared)?.message).toContain("shared");
  });

  it("order is the producer's: item_kind before rules_version before unknown_rule", () => {
    const r = valid();
    r.item_kind = "section";
    r.rules_version = "x";
    expect(coverageRowProblem(r, { ...ROW, rules: [] })?.check).toBe("item_kind");
    r.item_kind = ROW.item_kind;
    expect(coverageRowProblem(r, { ...ROW, rules: [] })?.check).toBe("unknown_rules_version");
  });
});

describe("the id checks are named by the record's item_kind", () => {
  it("serverCoverageChecks(section) names unknown_section and duplicate_section; the other two stay", () => {
    expect(serverCoverageChecks("section")).toEqual(["unknown_section", "duplicate_section", "overlap", "uncovered"]);
  });

  it("a record of kind section with an unknown id reports unknown_section and says section, not part", () => {
    const r = structuredClone(rec);
    r.item_kind = "section";
    r.sampled.push("99999");
    const got = coverageProblem(r, plan, 0);
    expect(got?.check).toBe("unknown_section");
    expect(got?.message).toContain("section 99999");
    expect(got?.message).not.toContain("part");
  });

  it("a duplicate in a section record reports duplicate_section", () => {
    const r = structuredClone(rec);
    r.item_kind = "section";
    r.looked_at.push(r.looked_at[0]);
    expect(coverageProblem(r, plan, 0)?.check).toBe("duplicate_section");
  });
});
