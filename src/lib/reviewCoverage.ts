/**
 * reviewCoverage -- what a steward looked at, versus what the review plan sampled, versus what a rule
 * folded away, as ONE record built for the promotion, in the ITEM form of ingest-v1 1.5.0.
 *
 * DECLARED by the producer at `41230a7e` (invincible-agent 0.4.73) as `HumanTaskActRequest.review_coverage`
 * (`ItemReviewCoverage`), and SENT on promote by the promotion card under the `promotionRuns` flag. The legacy
 * `parts` form (`ReviewCoverage`, 1.4.0) is deleted by the BFF in 0.4.74; this module never builds it. Ruling:
 * `sessions/2026-10-31-packet-to-cortex-ui-from-lane-01-review-coverage-moves-to-the-item-form-before-the-parts-form-is-deleted.md`.
 * Every schema is `additionalProperties: false`, so a key the server does not declare is a 422.
 * `reviewCoverage.test.ts` seals the record against the declared schemas, both directions.
 *
 * `review_shape`, `item_kind` and `rules_version` come from the served registry row (`GET /review-shapes`), never a
 * literal here. An item id is a STRING; this plan's ids are the extraction's `part_index`, as text. The server
 * refuses a record that does not match the extraction's item set (422 `review_coverage_invalid`); `coverageProblem`
 * mirrors that check and `coverageRowProblem` mirrors the registry check, so the card knows before the press.
 *
 * Pure: the same plan, looked set and seed give the same record.
 */
import type { ItemReviewCoverage } from "@/api/generated/bff";
import {
  MIN_RUN,
  RUN_RULE,
  SAMPLES_PER_RUN,
  SAMPLE_ALL_UP_TO,
  SHARED_RULE,
  type PlanOpts,
  type ReviewPlan,
} from "./reviewRuns";
import type { ShapeRow } from "./reviewShapes";

/**
 * The item kind this card's plan produces ids for. The plan's item id is the extraction's `part_index`; the
 * producer's `from_parts` defines `item_kind "part"` as exactly that. It is the mechanism's own definition,
 * not a case.
 */
export const PLAN_ITEM_KIND = "part";

export interface ItemReviewCoverageWire {
  /** The promote act's `review_coverage`, item form. */
  review_shape: string;
  item_kind: string;
  rules_version: string;
  /** Ids of the items the steward opened, plan order. */
  looked_at: string[];
  /** Ids the seeded sample chose, plan order (looked or not). */
  sampled: string[];
  /** Ids with any flag (straggler included), plan order. */
  flagged: string[];
  /** Per run: members NOT looked at. Runs with none are omitted. */
  groups: { rule: string; key: string; items: string[] }[];
  /** `items`: the distinct ids of the units holding the fact's rows, plan order. */
  shared: { rule: string; page: number; bbox: number[]; items: string[]; confirmed: boolean }[];
  /** A card that samples nothing (the document card) sends null. */
  sample: { seed: string; per_run: number; sample_all_up_to: number; min_run: number } | null;
}

// Compile-time tie, no runtime cost: tsc fails if the wire type stops being assignable to the generated one.
export const _tie: (w: ItemReviewCoverageWire) => ItemReviewCoverage = (w) => w;

/**
 * A unit not looked at and in no run (a straggler or a single) cannot exist at promote time, because
 * promote holds on unchecked checks. If one does, it is listed in no bucket, so `looked_at` plus every
 * `groups[].items` no longer equals the item set: `coverageProblem` reports it as `uncovered`.
 * A unit whose `partIndex` is null is left out of every list (`coverageProblem` says `part_without_index`).
 * `row` is the registry row `pickShapeRow` proved matches the extraction; `opts` are the plan options the plan was
 * built with (`planOptsFromRow`), so `sample` states what was actually used. A rule appears in `groups`/`shared`
 * only if the row listed it, because `opts.runs`/`opts.shared` are what let the plan produce them.
 */
export function buildReviewCoverage(
  plan: ReviewPlan,
  looked: ReadonlySet<string>,
  confirmed: ReadonlySet<string>,
  seed: string,
  row: ShapeRow,
  opts: PlanOpts = {},
): ItemReviewCoverageWire {
  const ids = (pick: (i: number) => boolean) =>
    plan.units.flatMap((u, i) => (pick(i) && u.partIndex !== null ? [String(u.partIndex)] : []));
  const groups: ItemReviewCoverageWire["groups"] = [];
  for (const s of plan.segments) {
    if (s.kind !== "run") continue;
    const items = s.run.units
      .filter((u) => !looked.has(plan.units[u].id))
      .flatMap((u) => (plan.units[u].partIndex !== null ? [String(plan.units[u].partIndex)] : []));
    if (items.length > 0) groups.push({ rule: RUN_RULE, key: s.run.key, items });
  }
  return {
    review_shape: row.review_shape,
    item_kind: row.item_kind,
    rules_version: row.rules_version,
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
        items: ids((i) => units.has(i)),
        confirmed: confirmed.has(f.key),
      };
    }),
    sample: {
      seed,
      per_run: opts.samplesPerRun ?? SAMPLES_PER_RUN,
      sample_all_up_to: opts.sampleAllUpTo ?? SAMPLE_ALL_UP_TO,
      min_run: opts.minRun ?? MIN_RUN,
    },
  };
}

/** The four checks the server names in `422 {error:"review_coverage_invalid", check}`, by item kind. Spelt once. */
export const serverCoverageChecks = (kind: string) =>
  [`unknown_${kind}`, `duplicate_${kind}`, "overlap", "uncovered"] as const;
export type CoverageCheck = string;

const names = (ids: string[]) => ids.slice(0, 5).join(", ") + (ids.length > 5 ? ", …" : "");

/**
 * The registry check, mirrored from the server's `row_problem` (41230a7e), in the producer's order: `item_kind`,
 * `unknown_rules_version`, `unknown_rule`. Its two `review_shape` checks (shape not in the registry; shape not the one
 * the content kind declares) hold by construction here: `pickShapeRow` found the row BY the extraction's review_shape.
 * It exists so a future overlay that drops a rule is caught before the press.
 */
export function coverageRowProblem(
  record: ItemReviewCoverageWire,
  row: ShapeRow,
): { check: string; message: string } | null {
  const shape = record.review_shape;
  if (record.item_kind !== row.item_kind) {
    return {
      check: "item_kind",
      message: `item_kind '${record.item_kind}' is not '${row.item_kind}', the item_kind of review_shape '${shape}'.`,
    };
  }
  if (record.rules_version !== row.rules_version) {
    return {
      check: "unknown_rules_version",
      message: `rules_version '${record.rules_version}' is not '${row.rules_version}', the current version of '${shape}'.`,
    };
  }
  const known = new Set(row.rules.map((r) => r.id));
  const named: [string, string][] = [
    ...record.groups.map((g): [string, string] => ["groups", g.rule]),
    ...record.shared.map((x): [string, string] => ["shared", x.rule]),
  ];
  for (const [where, rule] of named) {
    if (!known.has(rule)) {
      return { check: "unknown_rule", message: `${where} names rule '${rule}', which review_shape '${shape}' does not list.` };
    }
  }
  return null;
}

/**
 * The receiver's honour condition, mirrored: the problem the server would refuse this record for, or null.
 * `droppedRows` (rows with no mpn, not drawn) and null `part_index` come first: the server's item set is the
 * distinct `part_index` of ALL the extraction's rows, ours only of the drawn ones, so either would make the
 * server answer `uncovered` without our being able to say which item it means.
 */
export function coverageProblem(
  record: ItemReviewCoverageWire,
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
  const kind = record.item_kind;
  const [unknownCheck, duplicateCheck] = serverCoverageChecks(kind);
  const set = new Set(plan.units.map((u) => String(u.partIndex)));
  const lists: [string, string[]][] = [
    ["looked_at", record.looked_at],
    ["sampled", record.sampled],
    ["flagged", record.flagged],
    ...record.groups.map((g, i): [string, string[]] => [`groups[${i}]`, g.items]),
    ...record.shared.map((s, i): [string, string[]] => [`shared[${i}]`, s.items]),
  ];
  const unknown = lists.flatMap(([, l]) => l.filter((id) => !set.has(id)));
  if (unknown.length > 0) {
    return { check: unknownCheck, message: `${kind} ${names([...new Set(unknown)])} is not in the extraction.` };
  }
  const dup = lists.flatMap(([, l]) => l.filter((id, i) => l.indexOf(id) !== i));
  if (dup.length > 0) {
    return { check: duplicateCheck, message: `${kind} ${names([...new Set(dup)])} appears twice in one list.` };
  }
  const seen = new Set(record.looked_at);
  const overlap: string[] = [];
  for (const g of record.groups) {
    for (const id of g.items) {
      if (seen.has(id)) overlap.push(id);
      seen.add(id);
    }
  }
  if (overlap.length > 0) {
    return { check: "overlap", message: `${kind} ${names([...new Set(overlap)])} is both looked at and grouped, or in two groups.` };
  }
  const missing = [...set].filter((id) => !seen.has(id));
  if (missing.length > 0) {
    return { check: "uncovered", message: `${kind} ${names(missing)} was neither opened nor grouped.` };
  }
  return null;
}
