/**
 * reviewRuns — the review plan for a notice with hundreds of parts.
 *
 * A steward cannot read 400 near-identical lines, and should not have to: a PCN's parts come in series
 * (`FK2500037 → FK2500401`, `FK2500038 → FK2500402`, ...) whose extraction is one mechanism applied
 * over and over. This module folds a series into a RUN, so one glance at the template covers it, and
 * marks what a glance cannot cover:
 *   - a part that breaks the series (a STRAGGLER: the series' own mechanism did not produce it);
 *   - a part the extractor or the evidence doubts (a FLAG, kept inside its run, shown there);
 *   - a few SAMPLED members per run, chosen by a seeded PRNG, so "I looked at the run" has teeth.
 * The union of those is the set of CHECKS the steward must look at. Everything else is "covered by a
 * run": not looked at, and said so.
 *
 * A run is decided by SHAPE only (every digit is a 9, everything else kept). A shape is a claim about
 * the layout of the string, never about its value; a part whose value is wrong but whose shape is
 * right stays in its run, which is exactly why the samples exist.
 *
 * Pure: no DOM, no clock, no Math.random. The same rows and seed give the same plan, so a resumed
 * review walks the same checks it saved.
 */
import { boxFraction } from "./bboxScale";
import { evidenceQuality, type EvidenceRef, type ReviewRow } from "./promotionReview";

/** Character mask over the first member's string: true = varies across the run's members. */
export interface Template {
  text: string;
  varies: boolean[];
}

export type UnitFlag =
  | { kind: "extractor-unsure"; reason: string | null } // any row needs_review
  | { kind: "region" } // primary row evidenceQuality "region"
  | { kind: "unknown-method" } // primary row evidenceQuality "unknown"
  | { kind: "no-box" } // primary row evidence ok with bbox === null
  | { kind: "no-evidence" } // primary row evidence absent or malformed
  | { kind: "straggler" }; // not a member of any run

/** One part. */
export interface ReviewUnit {
  /** `p<part_index>` when part_index != null, else `m:<mpn>`. */
  id: string;
  mpn: string;
  /** extracted_value of its `replacement_mpn` row, else null. */
  replacement: string | null;
  /** Index into rows: the replacement_mpn row, else the unit's first row. */
  primary: number;
  /** Indices into rows, in row order. */
  rows: number[];
  flags: UnitFlag[];
}

export interface Run {
  id: string;
  /** The shape key that grouped it: shapeOf(affected)→shapeOf(replacement), e.g. FK2599999→FK2599999. */
  key: string;
  /** Indices into plan.units, consecutive. */
  units: number[];
  affected: Template;
  replacement: Template | null;
}

export type Segment = { kind: "run"; run: Run } | { kind: "single"; unit: number };

export interface SharedFact {
  /** `${page}:${bbox.join(",")}` */
  key: string;
  field: string | null;
  /** Distinct extracted_values, sorted. */
  values: string[];
  /** Row indices citing this crop. */
  rows: number[];
  ref: EvidenceRef;
}

export interface ReviewPlan {
  /** In first-appearance order. */
  units: ReviewUnit[];
  /** Units in order, consecutive run members folded into one run. */
  segments: Segment[];
  sharedFacts: SharedFact[];
  /** Unit indices that must be looked at: any flag, OR sampled. */
  checks: ReadonlySet<number>;
  /** Unit indices chosen as samples (subset of checks). */
  sampled: ReadonlySet<number>;
  /** Row index -> unit index. */
  unitOfRow: number[];
}

/** Every ASCII digit becomes "9", everything else is kept: the layout of a part number, not its value. */
export function shapeOf(s: string): string {
  return s.replace(/[0-9]/g, "9");
}

/** Rule names, spelled once: the card and the coverage record both cite them. */
/** Consecutive parts whose shapeOf(affected)→shapeOf(replacement) key is equal, at least MIN_RUN of them. */
export const RUN_RULE = "same_shape_run";
/** Rows of inherited quality citing one crop, at least MIN_SHARED of them. */
export const SHARED_RULE = "same_inherited_crop";

export const MIN_RUN = 3;
export const SAMPLES_PER_RUN = 2;
/** Crops cited by fewer rows than this are an ordinary citation, not a sentence worth confirming once. */
export const MIN_SHARED = 3;
/** Runs this short are looked at in full: sampling two of four would leave nothing to cover. */
export const SAMPLE_ALL_UP_TO = 4;

function unitIdOf(r: ReviewRow): string {
  return r.part_index !== null ? `p${r.part_index}` : `m:${r.mpn}`;
}

/** Why the unit's primary row must be looked at, in a fixed order; empty when nothing doubts it. */
function flagsOf(rows: ReviewRow[], unitRows: number[], primary: number): UnitFlag[] {
  const flags: UnitFlag[] = [];
  const unsure = unitRows.map((i) => rows[i]).filter((r) => r.needs_review);
  if (unsure.length > 0) {
    flags.push({ kind: "extractor-unsure", reason: unsure.find((r) => r.review_reason !== null)?.review_reason ?? null });
  }
  const p = rows[primary];
  if (p.evidence.state !== "ok") {
    flags.push({ kind: "no-evidence" });
    return flags;
  }
  const q = evidenceQuality(p.obtained_via);
  if (q === "region") flags.push({ kind: "region" });
  if (q === "unknown") flags.push({ kind: "unknown-method" });
  if (p.evidence.ref.bbox === null) flags.push({ kind: "no-box" });
  return flags;
}

function templateOf(strings: string[]): Template {
  const text = strings[0];
  const varies = [...text].map((_, i) => strings.some((s) => s[i] !== text[i]));
  return { text, varies };
}

/** FNV-1a over UTF-16 code units: a small string hash to seed the PRNG. */
function hashString(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** The unit indices of a run to look at: ends always, interior members drawn by the run's own seeded stream. */
function sampleRun(members: number[], seed: string, runId: string, samplesPerRun: number): number[] {
  if (members.length <= SAMPLE_ALL_UP_TO) return [...members];
  const rand = mulberry32(hashString(seed + runId));
  const interior = members.slice(1, -1);
  // Partial Fisher-Yates: the first k slots are a uniform draw without replacement.
  const k = Math.min(samplesPerRun, interior.length);
  for (let i = 0; i < k; i++) {
    const j = i + Math.floor(rand() * (interior.length - i));
    [interior[i], interior[j]] = [interior[j], interior[i]];
  }
  return [members[0], members[members.length - 1], ...interior.slice(0, k)];
}

export function buildReviewPlan(
  rows: ReviewRow[],
  seed: string,
  opts: { minRun?: number; samplesPerRun?: number } = {},
): ReviewPlan {
  const minRun = opts.minRun ?? MIN_RUN;
  const samplesPerRun = opts.samplesPerRun ?? SAMPLES_PER_RUN;

  // Units, in first-appearance order.
  const units: ReviewUnit[] = [];
  const unitOfRow: number[] = [];
  const byId = new Map<string, number>();
  const rowLists: number[][] = [];
  rows.forEach((r, i) => {
    const id = unitIdOf(r);
    let u = byId.get(id);
    if (u === undefined) {
      u = rowLists.length;
      byId.set(id, u);
      rowLists.push([]);
    }
    rowLists[u].push(i);
    unitOfRow.push(u);
  });
  for (const unitRows of rowLists) {
    const first = rows[unitRows[0]];
    const primary = unitRows.find((i) => rows[i].field === "replacement_mpn") ?? unitRows[0];
    const isReplacement = rows[primary].field === "replacement_mpn";
    units.push({
      id: unitIdOf(first),
      mpn: first.mpn,
      replacement: isReplacement ? rows[primary].extracted_value : null,
      primary,
      rows: unitRows,
      flags: flagsOf(rows, unitRows, primary),
    });
  }

  // Runs: maximal stretches of consecutive units with one shape key.
  const keyOf = (u: ReviewUnit) => `${shapeOf(u.mpn)}→${u.replacement === null ? "" : shapeOf(u.replacement)}`;
  const segments: Segment[] = [];
  const runs: Run[] = [];
  for (let i = 0; i < units.length; ) {
    let j = i + 1;
    while (j < units.length && keyOf(units[j]) === keyOf(units[i])) j++;
    if (j - i >= minRun) {
      const members = Array.from({ length: j - i }, (_, k) => i + k);
      const reps = members.map((m) => units[m].replacement);
      const run: Run = {
        id: `r:${units[i].id}`,
        key: keyOf(units[i]),
        units: members,
        affected: templateOf(members.map((m) => units[m].mpn)),
        replacement: reps.every((r): r is string => r !== null) ? templateOf(reps) : null,
      };
      runs.push(run);
      segments.push({ kind: "run", run });
    } else {
      for (let k = i; k < j; k++) segments.push({ kind: "single", unit: k });
    }
    i = j;
  }

  // A notice with no runs has no stragglers: with nothing to break, everything is just a part.
  if (runs.length > 0) {
    for (const s of segments) if (s.kind === "single") units[s.unit].flags.push({ kind: "straggler" });
  }

  const sampled = new Set<number>();
  for (const run of runs) for (const m of sampleRun(run.units, seed, run.id, samplesPerRun)) sampled.add(m);
  const checks = new Set<number>(sampled);
  units.forEach((u, i) => {
    if (u.flags.length > 0) checks.add(i);
  });

  // Shared facts: one crop cited by many rows of inherited quality (a date stated once in prose).
  const groups = new Map<string, number[]>();
  rows.forEach((r, i) => {
    if (r.evidence.state !== "ok" || r.evidence.ref.bbox === null || evidenceQuality(r.obtained_via) !== "inherited") return;
    const key = `${r.evidence.ref.page}:${r.evidence.ref.bbox.join(",")}`;
    groups.set(key, [...(groups.get(key) ?? []), i]);
  });
  const sharedFacts: SharedFact[] = [];
  for (const [key, idx] of groups) {
    if (idx.length < MIN_SHARED) continue;
    const fields = new Set(idx.map((i) => rows[i].field));
    const first = rows[idx[0]];
    sharedFacts.push({
      key,
      field: fields.size === 1 ? first.field : null,
      values: [...new Set(idx.map((i) => rows[i].extracted_value).filter((v): v is string => v !== null))].sort(),
      rows: idx,
      ref: (first.evidence as { state: "ok"; ref: EvidenceRef }).ref,
    });
  }

  return { units, segments, sharedFacts, checks, sampled, unitOfRow };
}

/** The neighbouring unit in `dir`, clamped at both ends. */
export function nextUnit(plan: ReviewPlan, from: number, dir: 1 | -1): number {
  return Math.max(0, Math.min(plan.units.length - 1, from + dir));
}

/** The next unit in `dir` that is a check and not yet looked at; null when none is left that way. */
export function nextCheck(plan: ReviewPlan, from: number, dir: 1 | -1, looked: ReadonlySet<string>): number | null {
  for (let i = from + dir; i >= 0 && i < plan.units.length; i += dir) {
    if (plan.checks.has(i) && !looked.has(plan.units[i].id)) return i;
  }
  return null;
}

/**
 * The row whose drawn box is under a click at (fx, fy), fractions of the rendered page. Smallest box wins,
 * so a cell beats the table that encloses it; ties go to the lowest index. Inherited rows are skipped: the
 * one sentence they share must not swallow a click meant for the table.
 */
export function hitTest(rows: ReviewRow[], page: number, fx: number, fy: number): number | null {
  let best: number | null = null;
  let bestArea = Infinity;
  rows.forEach((r, i) => {
    if (r.evidence.state !== "ok" || r.evidence.ref.page !== page || r.evidence.ref.bbox === null) return;
    if (evidenceQuality(r.obtained_via) === "inherited") return;
    const b = boxFraction(r.evidence.ref.bbox, r.evidence.ref.page_dims);
    if (fx < b.left || fx > b.left + b.width || fy < b.top || fy > b.top + b.height) return;
    const area = b.width * b.height;
    if (area < bestArea) {
      best = i;
      bestArea = area;
    }
  });
  return best;
}

/** Where a unit sits inside its run. */
export interface UnitPlace {
  runId: string;
  /** 1-based S-number among runs, in segment order (singles take no number). */
  ordinal: number;
  /** 0-based index in run.units. */
  pos: number;
  size: number;
}

/** unit index -> its place in a run; units not in a run are absent. */
export function placeOf(plan: ReviewPlan): Map<number, UnitPlace> {
  const m = new Map<number, UnitPlace>();
  let ordinal = 0;
  for (const s of plan.segments) {
    if (s.kind !== "run") continue;
    ordinal += 1;
    s.run.units.forEach((u, pos) => m.set(u, { runId: s.run.id, ordinal, pos, size: s.run.units.length }));
  }
  return m;
}

function runHolding(plan: ReviewPlan, from: number): Run | null {
  for (const s of plan.segments) if (s.kind === "run" && s.run.units.includes(from)) return s.run;
  return null;
}

/** First / last member of the run containing `from`; null when `from` is not in a run. */
export function groupEnd(plan: ReviewPlan, from: number, which: "start" | "end"): number | null {
  const run = runHolding(plan, from);
  if (!run) return null;
  return which === "start" ? run.units[0] : run.units[run.units.length - 1];
}

/**
 * A random member of the run containing `from`, other than `from`, chosen uniformly with `rand()` (in [0,1))
 * among members not yet looked at; when every other member is looked at, uniformly among all other members.
 * null when `from` is not in a run.
 */
export function randomInGroup(plan: ReviewPlan, from: number, looked: ReadonlySet<string>, rand: () => number): number | null {
  const run = runHolding(plan, from);
  if (!run) return null;
  const others = run.units.filter((u) => u !== from);
  if (others.length === 0) return null;
  const unlooked = others.filter((u) => !looked.has(plan.units[u].id));
  const pool = unlooked.length > 0 ? unlooked : others;
  return pool[Math.min(pool.length - 1, Math.floor(rand() * pool.length))];
}
