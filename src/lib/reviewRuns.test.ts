/**
 * reviewRuns — each `it` names a rule and asserts what turns red if that rule is deleted.
 */
import { describe, it, expect } from "vitest";
import { buildReviewPlan, groupEnd, hitTest, nextCheck, nextUnit, placeOf, randomInGroup, shapeOf } from "./reviewRuns";
import type { ReviewRow, RowEvidence } from "./promotionReview";

const DIMS = { width: 100, height: 100 };
const ok = (page: number, bbox: [number, number, number, number] | null): RowEvidence => ({
  state: "ok",
  ref: { page, bbox, page_dims: DIMS, units: "pt" },
});

interface P {
  part?: number | null;
  mpn: string;
  rep?: string | null;
  via?: string | null;
  evidence?: RowEvidence;
  review?: string | boolean;
}
let n = 0;
/** One part: a `replacement_mpn` row (when `rep` is given) preceded by an `ltb_date` row. */
function part(p: P): ReviewRow[] {
  const i = n++;
  const base = { mpn: p.mpn, part_index: p.part === undefined ? i : p.part };
  const out: ReviewRow[] = [
    {
      ...base,
      key: `row-${i}-a`,
      field: "ltb_date",
      extracted_value: "2027-03-31",
      obtained_via: "text_layer_cell",
      needs_review: false,
      review_reason: null,
      evidence: ok(1, [0, 0, 1, 1]),
    },
  ];
  if (p.rep !== null) {
    out.push({
      ...base,
      key: `row-${i}-b`,
      field: "replacement_mpn",
      extracted_value: p.rep ?? p.mpn + "X",
      obtained_via: p.via === undefined ? "text_layer_cell" : p.via,
      needs_review: p.review !== undefined && p.review !== false,
      review_reason: typeof p.review === "string" ? p.review : null,
      evidence: p.evidence ?? ok(2, [10 + (i % 50), 10, 20 + (i % 50), 12]),
    });
  }
  return out;
}
const series = (count: number, prefix = "AB", start = 100): ReviewRow[] =>
  Array.from({ length: count }, (_, i) => part({ mpn: `${prefix}${start + i}`, rep: `${prefix}${start + i + 7}Q` })).flat();
const rowsOf = (...groups: ReviewRow[][]): ReviewRow[] => groups.flat();

describe("shapeOf", () => {
  it("turns every digit into 9 and keeps everything else", () => {
    expect(shapeOf("FK25-0037Q")).toBe("FK99-9999Q");
    expect(shapeOf("abc")).toBe("abc");
  });
});

describe("units", () => {
  it("groups a part's rows, ids them by part_index or by mpn, and prefers the replacement row as primary", () => {
    const rows = rowsOf(part({ mpn: "A1", rep: "B1" }), part({ part: null, mpn: "Z9", rep: null }));
    const plan = buildReviewPlan(rows, "s");
    expect(plan.units.map((u) => u.id)).toEqual([`p${rows[0].part_index}`, "m:Z9"]);
    expect(plan.units[0]).toMatchObject({ mpn: "A1", replacement: "B1", primary: 1, rows: [0, 1] });
    // No replacement row: the first row is primary and the replacement is null.
    expect(plan.units[1]).toMatchObject({ replacement: null, primary: 2 });
    expect(plan.unitOfRow).toEqual([0, 0, 1]);
  });
});

describe("runs", () => {
  it("folds a stretch of equal shapes of at least minRun into one run, shorter stretches stay singles", () => {
    const rows = rowsOf(series(5, "AB"), series(2, "CD"), series(3, "EF"));
    const plan = buildReviewPlan(rows, "s");
    expect(plan.segments.map((s) => (s.kind === "run" ? `run${s.run.units.length}` : "single"))).toEqual(["run5", "single", "single", "run3"]);
    expect(buildReviewPlan(rows, "s", { minRun: 2 }).segments.filter((s) => s.kind === "run")).toHaveLength(3);
  });

  it("breaks a run at a part of another shape, making two runs", () => {
    const plan = buildReviewPlan(rowsOf(series(4, "AB"), part({ mpn: "ZZ-1", rep: "ZZ-1Y" }), series(4, "AB", 200)), "s");
    expect(plan.segments.filter((s) => s.kind === "run")).toHaveLength(2);
  });

  it("keys the shape on the replacement too: same mpn shape, different replacement shape is not one run", () => {
    const a = (i: number) => part({ mpn: `AB${100 + i}`, rep: i < 3 ? `AB${i}Q` : `AB${i}QQ` });
    const plan = buildReviewPlan(rowsOf(...[0, 1, 2, 3, 4, 5].map(a)), "s");
    expect(plan.segments.filter((s) => s.kind === "run").map((s) => (s.kind === "run" ? s.run.units.length : 0))).toEqual([3, 3]);
  });

  it("keeps a flagged part in its run", () => {
    const rows = rowsOf(
      series(2, "AB"),
      part({ mpn: "AB102", rep: "AB109Q", review: "two candidates" }),
      series(2, "AB", 103),
    );
    const plan = buildReviewPlan(rows, "s");
    expect(plan.segments).toHaveLength(1);
    expect(plan.units[2].flags).toEqual([{ kind: "extractor-unsure", reason: "two candidates" }]);
  });

  it("masks the template: varying positions true, static positions false, for both sides", () => {
    const rows = rowsOf(
      part({ mpn: "FK0001", rep: "FJ0401" }),
      part({ mpn: "FK0002", rep: "FJ0402" }),
      part({ mpn: "FK0013", rep: "FJ0413" }),
    );
    const seg = buildReviewPlan(rows, "s").segments[0];
    if (seg.kind !== "run") throw new Error("expected a run");
    expect(seg.run.affected.text).toBe("FK0001");
    expect(seg.run.affected.varies).toEqual([false, false, false, false, true, true]);
    expect(seg.run.replacement?.varies).toEqual([false, false, false, false, true, true]);
  });

  it("has a null replacement template when the run's parts have no replacement rows", () => {
    const rows = Array.from({ length: 3 }, (_, i) => part({ mpn: `AB${i}`, rep: null })).flat();
    const seg = buildReviewPlan(rows, "s").segments[0];
    if (seg.kind !== "run") throw new Error("expected a run");
    expect(seg.run.replacement).toBeNull();
  });
});

describe("flags", () => {
  const flagsOfOnly = (extra: Partial<P>) => {
    // A clean 3-run around one probe part, so "straggler" never interferes: the probe is a member.
    const rows = rowsOf(series(2, "AB"), part({ mpn: "AB102", rep: "AB109Q", ...extra }));
    return buildReviewPlan(rows, "s").units[2].flags;
  };
  it("extractor-unsure carries the first reason from a needs_review row", () => {
    expect(flagsOfOnly({ review: "cell is split" })).toEqual([{ kind: "extractor-unsure", reason: "cell is split" }]);
    expect(flagsOfOnly({ review: true })).toEqual([{ kind: "extractor-unsure", reason: null }]);
  });
  it("region and unknown-method come from the primary row's evidence quality, a cell flags nothing", () => {
    expect(flagsOfOnly({ via: "region_preferred" })).toEqual([{ kind: "region" }]);
    expect(flagsOfOnly({ via: "mystery" })).toEqual([{ kind: "unknown-method" }]);
    expect(flagsOfOnly({ via: "text_layer_cell" })).toEqual([]);
  });
  it("no-box is an ok ref with a null bbox", () => {
    expect(flagsOfOnly({ evidence: ok(2, null) })).toEqual([{ kind: "no-box" }]);
  });
  it("no-evidence is an absent or malformed ref, and says nothing about its method", () => {
    expect(flagsOfOnly({ evidence: { state: "absent" }, via: null })).toEqual([{ kind: "no-evidence" }]);
    expect(flagsOfOnly({ evidence: { state: "malformed", reason: "bbox_no_area", raw: null }, via: null })).toEqual([{ kind: "no-evidence" }]);
  });
  it("straggler marks a single, but only when the notice has a run", () => {
    const withRun = buildReviewPlan(rowsOf(series(3, "AB"), part({ mpn: "ZZ-1", rep: "ZZ-1Y" })), "s");
    expect(withRun.units[3].flags).toEqual([{ kind: "straggler" }]);
    expect(withRun.units[0].flags).toEqual([]);
    const noRun = buildReviewPlan(rowsOf(part({ mpn: "ZZ-1", rep: "ZZ-1Y" }), part({ mpn: "Y-22", rep: "Y-22Q" })), "s");
    expect(noRun.units.flatMap((u) => u.flags)).toEqual([]);
  });
});

describe("samples and checks", () => {
  const rows = series(30, "AB");
  const sampleIds = (seed: string) => [...buildReviewPlan(rows, seed).sampled].sort((a, b) => a - b);
  it("always samples the first and last member, plus samplesPerRun from the interior", () => {
    const s = sampleIds("seed-1");
    expect(s).toHaveLength(4);
    expect(s[0]).toBe(0);
    expect(s[3]).toBe(29);
    expect(s[1]).toBeGreaterThan(0);
    expect(s[2]).toBeLessThan(29);
    expect(buildReviewPlan(rows, "seed-1", { samplesPerRun: 5 }).sampled.size).toBe(7);
  });
  it("is deterministic for a seed and differs for another", () => {
    expect(sampleIds("seed-1")).toEqual(sampleIds("seed-1"));
    const others = ["a", "b", "c", "d", "e"].map(sampleIds);
    expect(others.some((o) => JSON.stringify(o) !== JSON.stringify(sampleIds("seed-1")))).toBe(true);
  });
  it("samples every member of a run of 4 or fewer, but not of 5", () => {
    expect(buildReviewPlan(series(4), "s").sampled.size).toBe(4);
    expect(buildReviewPlan(series(5), "s").sampled.size).toBe(4);
  });
  it("makes the checks the samples plus every flagged unit, and leaves covered units out", () => {
    const flagged = rowsOf(series(10, "AB"), part({ mpn: "AB110", rep: "AB117Q", review: "x" }), series(10, "AB", 111));
    const plan = buildReviewPlan(flagged, "s");
    expect(plan.checks.has(10)).toBe(true);
    for (const i of plan.sampled) expect(plan.checks.has(i)).toBe(true);
    expect(plan.checks.size).toBe(plan.sampled.size + (plan.sampled.has(10) ? 0 : 1));
    expect(plan.checks.size).toBeLessThan(plan.units.length);
  });
});

describe("shared facts", () => {
  const sentence = ok(1, [5, 5, 60, 9]);
  const inherited = (mpn: string, value = "2027-03-31"): ReviewRow => ({
    ...part({ mpn, rep: null })[0],
    obtained_via: "inherited_doc_level",
    extracted_value: value,
    evidence: sentence,
  });
  it("groups three or more inherited rows citing one crop, and does not flag their units", () => {
    const rows = [inherited("A1"), inherited("A2"), inherited("A3")];
    const plan = buildReviewPlan(rows, "s");
    expect(plan.sharedFacts).toHaveLength(1);
    expect(plan.sharedFacts[0]).toMatchObject({ key: "1:5,5,60,9", field: "ltb_date", values: ["2027-03-31"], rows: [0, 1, 2] });
    expect(plan.units.flatMap((u) => u.flags)).toEqual([]);
  });
  it("does not make a fact of two rows, nor of a cell-quality crop cited three times", () => {
    expect(buildReviewPlan([inherited("A1"), inherited("A2")], "s").sharedFacts).toEqual([]);
    const cells = [0, 1, 2].map((i) => ({ ...inherited(`C${i}`), obtained_via: "text_layer_cell" }));
    expect(buildReviewPlan(cells, "s").sharedFacts).toEqual([]);
  });
  it("lists every distinct value, sorted, so a disagreement is visible", () => {
    const rows = [inherited("A1", "2027-06-30"), inherited("A2"), inherited("A3")];
    expect(buildReviewPlan(rows, "s").sharedFacts[0].values).toEqual(["2027-03-31", "2027-06-30"]);
  });
});

describe("navigation", () => {
  const plan = buildReviewPlan(rowsOf(series(6, "AB")), "s");
  it("nextUnit steps and clamps at both ends", () => {
    expect(nextUnit(plan, 2, 1)).toBe(3);
    expect(nextUnit(plan, 2, -1)).toBe(1);
    expect(nextUnit(plan, 5, 1)).toBe(5);
    expect(nextUnit(plan, 0, -1)).toBe(0);
  });
  it("nextCheck lands on the next check, skips looked ones, and is null at the end", () => {
    const checks = [...plan.checks].sort((a, b) => a - b);
    expect(checks.length).toBeGreaterThan(2);
    expect(nextCheck(plan, -1, 1, new Set())).toBe(checks[0]);
    expect(nextCheck(plan, checks[0], 1, new Set())).toBe(checks[1]);
    expect(nextCheck(plan, checks[0], 1, new Set([plan.units[checks[1]].id]))).toBe(checks[2]);
    expect(nextCheck(plan, checks[checks.length - 1], 1, new Set())).toBeNull();
    expect(nextCheck(plan, checks[checks.length - 1], -1, new Set())).toBe(checks[checks.length - 2]);
    // A unit that is not a check is never landed on.
    const notCheck = plan.units.findIndex((_, i) => !plan.checks.has(i));
    expect(notCheck).toBeGreaterThan(-1);
    expect(checks).not.toContain(notCheck);
  });
});

describe("hitTest", () => {
  const row = (via: string, page: number, bbox: [number, number, number, number]): ReviewRow => ({
    ...part({ mpn: "A", rep: null })[0],
    obtained_via: via,
    evidence: ok(page, bbox),
  });
  const rows = [
    row("region_preferred", 2, [0, 0, 100, 100]), // the table
    row("text_layer_cell", 2, [10, 10, 40, 20]), // a cell inside it
    row("text_layer_cell", 2, [10, 10, 40, 20]), // the same box again: ties go to the lowest index
    row("text_layer_cell", 3, [10, 10, 40, 20]), // another page
    row("inherited_doc_level", 2, [0, 0, 100, 100]), // a sentence covering everything
  ];
  it("picks the smallest containing box, ties to the lowest index", () => {
    expect(hitTest(rows, 2, 0.2, 0.15)).toBe(1);
  });
  it("falls back to the enclosing box where only it contains the point", () => {
    expect(hitTest(rows, 2, 0.8, 0.8)).toBe(0);
  });
  it("returns null off the page's boxes and for a page with none", () => {
    expect(hitTest(rows, 4, 0.2, 0.15)).toBeNull();
    expect(hitTest(rows, 3, 0.9, 0.9)).toBeNull();
    expect(hitTest(rows, 3, 0.2, 0.15)).toBe(3);
  });
  it("skips inherited rows, so a shared sentence never swallows a click", () => {
    expect(hitTest([rows[4]], 2, 0.5, 0.5)).toBeNull();
  });
  it("scales each box by its own page_dims", () => {
    const scaled: ReviewRow = { ...rows[1], evidence: { state: "ok", ref: { page: 2, bbox: [100, 100, 400, 200], page_dims: { width: 1000, height: 1000 }, units: "px" } } };
    expect(hitTest([scaled], 2, 0.2, 0.15)).toBe(0);
    expect(hitTest([scaled], 2, 0.05, 0.15)).toBeNull();
  });
});

describe("group places and jumps", () => {
  // units 0-3 = run S1, 4 = single, 5-8 = run S2
  const plan = buildReviewPlan(rowsOf(series(4, "AB"), part({ mpn: "ZZ-1", rep: "ZZ-1Y" }), series(4, "AB", 200)), "s");
  const idOf = (...us: number[]) => new Set(us.map((u) => plan.units[u].id));

  it("placeOf numbers runs only: a single between S1 and S2 takes no number", () => {
    const p = placeOf(plan);
    expect(p.get(0)).toMatchObject({ ordinal: 1, pos: 0, size: 4 });
    expect(p.get(3)).toMatchObject({ ordinal: 1, pos: 3, size: 4 });
    expect(p.has(4)).toBe(false);
    expect(p.get(5)).toMatchObject({ ordinal: 2, pos: 0, size: 4 });
    expect(p.get(8)?.runId).toBe(p.get(5)?.runId);
  });

  it("groupEnd gives the first / last member of the run, null on a single", () => {
    expect(groupEnd(plan, 6, "start")).toBe(5);
    expect(groupEnd(plan, 6, "end")).toBe(8);
    expect(groupEnd(plan, 1, "end")).toBe(3);
    expect(groupEnd(plan, 4, "start")).toBeNull();
    expect(groupEnd(plan, 4, "end")).toBeNull();
  });

  it("randomInGroup never returns `from` and stays inside the run", () => {
    for (const r of [0, 0.25, 0.5, 0.75, 0.999999]) {
      const u = randomInGroup(plan, 6, new Set(), () => r);
      expect(u).not.toBe(6);
      expect([5, 7, 8]).toContain(u);
    }
    expect(randomInGroup(plan, 4, new Set(), () => 0.5)).toBeNull();
  });

  it("randomInGroup prefers members not yet looked at", () => {
    // others of 5 are 6,7,8; unrestricted rand 0 would pick 6, which is looked
    expect(randomInGroup(plan, 5, idOf(6, 7), () => 0)).toBe(8);
    expect(randomInGroup(plan, 5, idOf(6), () => 0)).toBe(7);
  });

  it("randomInGroup falls back to all other members when all are looked", () => {
    expect(randomInGroup(plan, 5, idOf(5, 6, 7, 8), () => 0)).toBe(6);
    expect(randomInGroup(plan, 5, idOf(6, 7, 8), () => 0.999)).toBe(8);
  });

  it("randomInGroup over a 2-member run returns the other member", () => {
    const two = buildReviewPlan(rowsOf(series(2, "AB"), part({ mpn: "ZZ-1", rep: "ZZ-1Y" })), "s", { minRun: 2 });
    expect(randomInGroup(two, 0, new Set(), () => 0.999)).toBe(1);
    expect(randomInGroup(two, 1, new Set(), () => 0)).toBe(0);
  });
});
