/**
 * reviewShapes -- the review-shape registry as the BFF serves it (`GET /review-shapes`, declared at
 * invincible-agent 41230a7e / 0.4.73), and what a card does with a row.
 *
 * Rule ids and their params are CONFIG (a row names them); the mechanism that implements each id is cortex's.
 * A rule id this file does not implement is ignored here, and `coverageRowProblem` refuses a record that names it.
 * Pure: no fetch, no clock.
 */
import { MIN_RUN, MIN_SHARED, RUN_RULE, SAMPLES_PER_RUN, SAMPLE_ALL_UP_TO, SHARED_RULE, type PlanOpts } from "./reviewRuns";
import { PLAN_ITEM_KIND } from "./reviewCoverage";

export interface ShapeRule {
  id: string;
  params: Record<string, unknown>;
}

export interface ShapeRow {
  review_shape: string;
  item_kind: string;
  rules_version: string;
  params: Record<string, unknown>;
  rules: ShapeRule[];
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const nonEmpty = (v: unknown): v is string => typeof v === "string" && v.length > 0;

/** The served list, keeping only rows a card can use: a non-empty review_shape, item_kind and rules_version. */
export function readReviewShapes(body: unknown): ShapeRow[] {
  if (!Array.isArray(body)) return [];
  const out: ShapeRow[] = [];
  for (const r of body) {
    if (!isObj(r) || !nonEmpty(r.review_shape) || !nonEmpty(r.item_kind) || !nonEmpty(r.rules_version)) continue;
    const rules: ShapeRule[] = [];
    if (Array.isArray(r.rules)) {
      for (const x of r.rules) {
        if (isObj(x) && typeof x.id === "string") rules.push({ id: x.id, params: isObj(x.params) ? x.params : {} });
      }
    }
    out.push({
      review_shape: r.review_shape,
      item_kind: r.item_kind,
      rules_version: r.rules_version,
      params: isObj(r.params) ? r.params : {},
      rules,
    });
  }
  return out;
}

/** The row this extraction's coverage is built from, or the sentence saying why there is none. */
export function pickShapeRow(
  rows: ShapeRow[],
  reviewShape: string | null,
  itemKind: string | null,
): { row: ShapeRow } | { row: null; why: string } {
  if (reviewShape === null) return { row: null, why: "the extraction names no review_shape." };
  if (itemKind === null) return { row: null, why: `the extraction names no item_kind (review_shape "${reviewShape}").` };
  const row = rows.find((r) => r.review_shape === reviewShape);
  if (!row) return { row: null, why: `no review shape "${reviewShape}" is served by GET /review-shapes.` };
  if (row.item_kind !== itemKind) {
    return {
      row: null,
      why: `the extraction's item_kind "${itemKind}" differs from the one review_shape "${reviewShape}" is served with: the row says "${row.item_kind}".`,
    };
  }
  if (itemKind !== PLAN_ITEM_KIND) {
    return {
      row: null,
      why: `this card's plan produces ids for item_kind "${PLAN_ITEM_KIND}", not "${itemKind}" (review_shape "${reviewShape}").`,
    };
  }
  return { row };
}

const positiveInt = (v: unknown, dflt: number): number => (typeof v === "number" && Number.isInteger(v) && v > 0 ? v : dflt);

/**
 * The plan options a row asks for. A rule the row lists turns its mechanism on, with the row's params; a rule it
 * does not list turns it off. A param absent or not a positive integer is the mechanism default. `null`: all defaults.
 */
export function planOptsFromRow(row: ShapeRow | null): PlanOpts {
  if (row === null) return {};
  const run = row.rules.find((r) => r.id === RUN_RULE);
  const shared = row.rules.find((r) => r.id === SHARED_RULE);
  return {
    runs: run !== undefined,
    shared: shared !== undefined,
    minRun: positiveInt(run?.params.min_run, MIN_RUN),
    samplesPerRun: positiveInt(run?.params.per_run, SAMPLES_PER_RUN),
    sampleAllUpTo: positiveInt(run?.params.sample_all_up_to, SAMPLE_ALL_UP_TO),
    minShared: positiveInt(shared?.params.min_shared, MIN_SHARED),
  };
}
