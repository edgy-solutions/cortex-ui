/**
 * reviewCoverage -- what a steward looked at, versus what the review plan sampled, versus what a rule
 * folded away, as ONE record built for the promotion.
 *
 * PROPOSED wire, NOT SENT. Packet:
 * `sessions/2026-10-29-packet-to-lane-01-from-cortex-review-coverage-on-the-promotion-record.md`.
 * The act body at our producer pin is `HumanTaskActRequest` (gateway.py), a default pydantic model: an
 * unknown key is DROPPED SILENTLY, so sending `review_coverage` today would be a claim the server throws
 * away. The card builds the record and shows it; it does not send it until the producer declares the
 * field. `reviewCoverage.test.ts` holds a tripwire that fails when it does.
 *
 * Pure: the same plan, looked set and seed give the same record.
 */
import {
  MIN_RUN,
  RUN_RULE,
  SAMPLES_PER_RUN,
  SAMPLE_ALL_UP_TO,
  SHARED_RULE,
  type ReviewPlan,
} from "./reviewRuns";

export const REVIEW_COVERAGE_RULES_VERSION = "cortex.reviewRuns.v1";

export interface ReviewCoverageRecord {
  /** PROPOSED field `review_coverage` on the promote act. */
  rules_version: string;
  /** plan.units.length */
  parts: number;
  /** Unit ids the steward opened, in plan order. */
  looked_at: string[];
  /** Unit ids the seeded sample chose, in plan order (looked or not). */
  sampled: string[];
  /** Unit ids with any flag (straggler included), in plan order. */
  flagged: string[];
  /** Per run: members NOT looked at, in order. Runs with none are omitted. */
  covered: { rule: typeof RUN_RULE; key: string; parts: string[] }[];
  shared: { rule: typeof SHARED_RULE; page: number; bbox: number[]; rows: number; confirmed: boolean }[];
  sample: { seed: string; per_run: number; sample_all_up_to: number; min_run: number };
}

/**
 * A part not looked at and in no run (a straggler or a single) cannot exist at promote time, because
 * promote holds on unchecked checks. If one does, it is listed in no bucket, so `looked_at` plus every
 * `covered[].parts` no longer sums to `parts`: that sum is the invariant the tests check.
 */
export function buildReviewCoverage(
  plan: ReviewPlan,
  looked: ReadonlySet<string>,
  confirmed: ReadonlySet<string>,
  seed: string,
  opts: { minRun?: number; samplesPerRun?: number } = {},
): ReviewCoverageRecord {
  const ids = (pick: (i: number) => boolean) => plan.units.flatMap((u, i) => (pick(i) ? [u.id] : []));
  const covered: ReviewCoverageRecord["covered"] = [];
  for (const s of plan.segments) {
    if (s.kind !== "run") continue;
    const parts = s.run.units.filter((u) => !looked.has(plan.units[u].id)).map((u) => plan.units[u].id);
    if (parts.length > 0) covered.push({ rule: RUN_RULE, key: s.run.key, parts });
  }
  return {
    rules_version: REVIEW_COVERAGE_RULES_VERSION,
    parts: plan.units.length,
    looked_at: ids((i) => looked.has(plan.units[i].id)),
    sampled: ids((i) => plan.sampled.has(i)),
    flagged: ids((i) => plan.units[i].flags.length > 0),
    covered,
    shared: plan.sharedFacts.map((f) => ({
      rule: SHARED_RULE,
      page: f.ref.page,
      bbox: f.ref.bbox ?? [],
      rows: f.rows.length,
      confirmed: confirmed.has(f.key),
    })),
    sample: {
      seed,
      per_run: opts.samplesPerRun ?? SAMPLES_PER_RUN,
      sample_all_up_to: SAMPLE_ALL_UP_TO,
      min_run: opts.minRun ?? MIN_RUN,
    },
  };
}
