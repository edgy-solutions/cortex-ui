/**
 * reviewCoverage -- what a steward looked at, versus what the review plan sampled, versus what a rule
 * folded away, as ONE record built for the promotion.
 *
 * DECLARED by the producer at `10ac02fe` (invincible-agent #156) as `HumanTaskActRequest.review_coverage`, and
 * SENT on promote by the promotion card under the `promotionRuns` flag. Ruling:
 * `sessions/2026-10-29-packet-to-cortex-from-lane-01-review-coverage-ruled-part-index-ints-groups-server-checks-the-union.md`;
 * connect packet:
 * `sessions/2026-10-30-packet-to-cortex-from-lane-01-review-coverage-is-in-0-4-72-connect-the-send.md`.
 * Every schema is `additionalProperties: false`, so a key the server does not declare is a 422.
 * `reviewCoverage.test.ts` seals the record against the declared schemas, both directions.
 *
 * A part id is the extraction's integer `part_index`. The server refuses a record that does not match the
 * extraction's part set (422 `review_coverage_invalid`); `coverageProblem` mirrors that check here, so the
 * card knows before the press whether the record would be refused.
 *
 * Pure: the same plan, looked set and seed give the same record.
 */
import type { ReviewCoverage } from "@/api/generated/bff";
import {
  MIN_RUN,
  RUN_RULE,
  SAMPLES_PER_RUN,
  SAMPLE_ALL_UP_TO,
  SHARED_RULE,
  type ReviewPlan,
} from "./reviewRuns";

export const REVIEW_COVERAGE_RULES_VERSION = "cortex.reviewRuns.v1";

export interface ReviewCoverageWire {
  /** The promote act's `review_coverage`. */
  rules_version: string; // REVIEW_COVERAGE_RULES_VERSION
  /** part_index of the parts the steward opened, plan order. */
  looked_at: number[];
  /** part_index the seeded sample chose, plan order (looked or not). */
  sampled: number[];
  /** part_index with any flag (straggler included), plan order. */
  flagged: number[];
  /** Per run: members NOT looked at. Runs with none are omitted. */
  groups: { rule: typeof RUN_RULE; key: string; parts: number[] }[];
  /** `parts`: the distinct part_index of the units holding the fact's rows, plan order. */
  shared: { rule: typeof SHARED_RULE; page: number; bbox: number[]; parts: number[]; confirmed: boolean }[];
  sample: { seed: string; per_run: number; sample_all_up_to: number; min_run: number };
}

// Compile-time tie, no runtime cost: tsc fails if the wire type stops being assignable to the generated one.
export const _tie: (w: ReviewCoverageWire) => ReviewCoverage = (w) => w;

/**
 * A part not looked at and in no run (a straggler or a single) cannot exist at promote time, because
 * promote holds on unchecked checks. If one does, it is listed in no bucket, so `looked_at` plus every
 * `groups[].parts` no longer equals the part set: `coverageProblem` reports it as `uncovered`.
 * A unit whose `partIndex` is null is left out of every list (`coverageProblem` says `part_without_index`).
 */
export function buildReviewCoverage(
  plan: ReviewPlan,
  looked: ReadonlySet<string>,
  confirmed: ReadonlySet<string>,
  seed: string,
  opts: { minRun?: number; samplesPerRun?: number } = {},
): ReviewCoverageWire {
  const ids = (pick: (i: number) => boolean) =>
    plan.units.flatMap((u, i) => (pick(i) && u.partIndex !== null ? [u.partIndex] : []));
  const groups: ReviewCoverageWire["groups"] = [];
  for (const s of plan.segments) {
    if (s.kind !== "run") continue;
    const parts = s.run.units
      .filter((u) => !looked.has(plan.units[u].id))
      .flatMap((u) => (plan.units[u].partIndex !== null ? [plan.units[u].partIndex as number] : []));
    if (parts.length > 0) groups.push({ rule: RUN_RULE, key: s.run.key, parts });
  }
  return {
    rules_version: REVIEW_COVERAGE_RULES_VERSION,
    looked_at: ids((i) => looked.has(plan.units[i].id)),
    sampled: ids((i) => plan.sampled.has(i)),
    flagged: ids((i) => plan.units[i].flags.length > 0),
    groups,
    shared: plan.sharedFacts.map((f) => {
      const units = new Set(f.rows.map((r) => plan.unitOfRow[r]));
      return {
        rule: SHARED_RULE,
        page: f.ref.page,
        bbox: f.ref.bbox ?? [],
        parts: ids((i) => units.has(i)),
        confirmed: confirmed.has(f.key),
      };
    }),
    sample: {
      seed,
      per_run: opts.samplesPerRun ?? SAMPLES_PER_RUN,
      sample_all_up_to: SAMPLE_ALL_UP_TO,
      min_run: opts.minRun ?? MIN_RUN,
    },
  };
}

/** The four checks the server names in `422 {error:"review_coverage_invalid", check}`. Spelt once. */
export const SERVER_COVERAGE_CHECKS = ["unknown_part", "duplicate_part", "overlap", "uncovered"] as const;
export type CoverageCheck = (typeof SERVER_COVERAGE_CHECKS)[number] | "rows_not_drawn" | "part_without_index";

const names = (ids: number[]) => ids.slice(0, 5).join(", ") + (ids.length > 5 ? ", …" : "");

/**
 * The receiver's honour condition, mirrored: the problem the server would refuse this record for, or null.
 * `droppedRows` (rows with no mpn, not drawn) and null `part_index` come first: the server's part set is the
 * distinct `part_index` of ALL the extraction's rows, ours only of the drawn ones, so either would make the
 * server answer `uncovered` without our being able to say which part it means.
 */
export function coverageProblem(
  record: ReviewCoverageWire,
  plan: ReviewPlan,
  droppedRows: number,
): { check: CoverageCheck; message: string } | null {
  if (droppedRows > 0) {
    return {
      check: "rows_not_drawn",
      message: `${droppedRows} row${droppedRows === 1 ? "" : "s"} had no mpn and are not drawn, so the record cannot name every part of the extraction.`,
    };
  }
  const noIndex = plan.units.filter((u) => u.partIndex === null).map((u) => u.id);
  if (noIndex.length > 0) {
    return {
      check: "part_without_index",
      message: `${noIndex.length} part${noIndex.length === 1 ? "" : "s"} carry no part_index (${noIndex.slice(0, 5).join(", ")}${noIndex.length > 5 ? ", …" : ""}).`,
    };
  }
  const set = new Set(plan.units.map((u) => u.partIndex as number));
  const lists: [string, number[]][] = [
    ["looked_at", record.looked_at],
    ["sampled", record.sampled],
    ["flagged", record.flagged],
    ...record.groups.map((g, i): [string, number[]] => [`groups[${i}]`, g.parts]),
    ...record.shared.map((s, i): [string, number[]] => [`shared[${i}]`, s.parts]),
  ];
  const unknown = lists.flatMap(([, l]) => l.filter((id) => !set.has(id)));
  if (unknown.length > 0) {
    return { check: "unknown_part", message: `part ${names([...new Set(unknown)])} is not in the extraction.` };
  }
  const dup = lists.flatMap(([, l]) => l.filter((id, i) => l.indexOf(id) !== i));
  if (dup.length > 0) {
    return { check: "duplicate_part", message: `part ${names([...new Set(dup)])} appears twice in one list.` };
  }
  const seen = new Set(record.looked_at);
  const overlap: number[] = [];
  for (const g of record.groups) {
    for (const id of g.parts) {
      if (seen.has(id)) overlap.push(id);
      seen.add(id);
    }
  }
  if (overlap.length > 0) {
    return { check: "overlap", message: `part ${names([...new Set(overlap)])} is both looked at and grouped, or in two groups.` };
  }
  const missing = [...set].filter((id) => !seen.has(id));
  if (missing.length > 0) {
    return { check: "uncovered", message: `part ${names(missing)} was neither opened nor grouped.` };
  }
  return null;
}
