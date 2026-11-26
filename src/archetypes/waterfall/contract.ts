/**
 * WATERFALL — a walk from a start total to an end total, one floating bar per level-1 step.
 * Structural: it knows "a start, signed steps, an end, and they balance exactly", nothing else.
 * Config names the case; every word shown comes from the data (`walk.*.label`, the paths,
 * `render.*`, `verdict`) or is a generic UI word.
 *
 * ── CHOSEN BY THE SERVED SHAPE, NEVER INFERRED ─────────────────────────────────────────────
 * The server picks this archetype from the row's declared `render.shape` (invincible-agent #553).
 * cortex never switches a flow card to a waterfall because `walk` is present, and never infers a
 * total: a WATERFALL row without `walk` is REFUSED (`walk_missing`).
 *
 * ── THE WALK (invincible-agent #552) ───────────────────────────────────────────────────────
 * `walk: {start: {label, value, value_exact}, end: {...}}`. `value_exact` is a plain decimal
 * string, may be negative, not quantized. Invariant: start + Σ signed level-1 edges == end,
 * EXACTLY. The check runs on the exact strings in BigInt units (a float sum gets 0.1 + 0.2 wrong);
 * a table that does not balance is refused with the gap named, never drawn.
 *
 * ── THE STEPS ──────────────────────────────────────────────────────────────────────────────
 * The level-1 edges of the flow edge table, read by the flow card's own parser
 * (`readFlowTable`): one way to read an edge. SERVED ORDER, no re-sort. A level-1 `node_kind:
 * "other"` edge is the remainder bar, labelled by `render.other_label`. `value` is ABSOLUTE and
 * `sign` is the step's sign, so a step's signed amount is +value_exact, -value_exact or 0.
 */
import {
  FLOW_DECOMPOSITION_REFUSAL_REASONS,
  FLOW_REFUSAL_WORDS,
  formatScaled,
  readFlowTable,
  readProvenance,
  scaled,
  type FlowNode,
  type FlowSign,
} from "../flow-decomposition/contract";

export const WATERFALL_WALK_REFUSAL_REASONS = ["walk_missing", "walk_malformed", "walk_unchecked", "walk_unbalanced"] as const;
export const WATERFALL_REFUSAL_REASONS = [...FLOW_DECOMPOSITION_REFUSAL_REASONS, ...WATERFALL_WALK_REFUSAL_REASONS] as const;
export type WaterfallRefusalReason = (typeof WATERFALL_REFUSAL_REASONS)[number];

export const WATERFALL_REFUSAL_WORDS: Record<WaterfallRefusalReason, string> = {
  ...FLOW_REFUSAL_WORDS,
  walk_missing: "the row served no walk (start and end totals); this card does not infer them",
  walk_malformed: "the walk's start or end is missing a label or an exact decimal value",
  walk_unchecked: "a step has no exact value, so the walk cannot be checked",
  walk_unbalanced: "the start and the steps do not add up to the end",
};

export const WATERFALL_NOTE_KINDS = ["closure", "closure_unchecked", "other_label_missing", "shape_mismatch"] as const;
export type WaterfallNoteKind = (typeof WATERFALL_NOTE_KINDS)[number];

export const WATERFALL_ENVELOPE_FIELDS = ["walk", "value_label", "render", "verdict", "data_provenance"] as const;

export const WATERFALL_CONTRACT = {
  archetype: "WATERFALL",
  component: "Waterfall",
  layout: "full-width",
  recomputes: true,
  fields: {
    /** The flow edge table; the card draws its level-1 edges, in served order. */
    rows: { encoding: "array", parsesTo: "array-of-objects", required: true },
    /** `{start: {label, value, value_exact}, end: {...}}`. Absent is a refusal, never inferred. */
    walk: { type: "object", required: true },
    value_label: { type: "string", required: false },
    /** The card reads `shape`, `value_label`, `unit` and `other_label`. */
    render: { type: "object", required: false },
    verdict: { type: "string", required: false },
    data_provenance: { type: "string", required: false },
  },
  refusalReasons: WATERFALL_REFUSAL_REASONS,
} as const;

export interface WalkEnd {
  label: string;
  /** The exact decimal as served (may be negative). */
  exact: string;
  /** For geometry and text only; the balance is checked on `exact`. */
  value: number;
}

export interface WalkStep {
  key: string;
  /** `render.other_label` for a remainder that has one, else the path's last element. */
  label: string;
  path: string[];
  kind: FlowNode["kind"];
  sign: FlowSign;
  /** Absolute amount, as the edge's `value_exact`. */
  exact: string;
  /** Signed amount (for geometry): +value for positive, -value for negative, 0 for zero. */
  signed: number;
}

export interface WaterfallNote {
  kind: WaterfallNoteKind;
  text: string;
}

export interface WaterfallTable {
  ok: true;
  valueLabel: string | undefined;
  unit: string | undefined;
  verdict: string | undefined;
  provenance: string | undefined;
  start: WalkEnd;
  end: WalkEnd;
  /** The level-1 edges, in the order they were served. */
  steps: WalkStep[];
  notes: WaterfallNote[];
}

export type WaterfallRead = WaterfallTable | { ok: false; refusal: WaterfallRefusalReason; detail: string };

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
/** A plain decimal: optional minus, digits, optional fraction. No exponent, no plus, no spaces. */
const WALK_DECIMAL = /^-?\d+(\.\d+)?$/;

const refuse = (refusal: WaterfallRefusalReason, detail: string): WaterfallRead => ({ ok: false, refusal, detail });

function readEnd(raw: unknown, which: "start" | "end"): WalkEnd | string {
  if (!isObj(raw)) return `walk.${which} is not an object`;
  if (typeof raw.label !== "string" || raw.label === "") return `walk.${which}.label is not a non-empty string`;
  if (typeof raw.value_exact !== "string" || !WALK_DECIMAL.test(raw.value_exact)) {
    return `walk.${which}.value_exact is not a plain decimal string`;
  }
  return { label: raw.label, exact: raw.value_exact, value: Number(raw.value_exact) };
}

/** A decimal that may be negative, as BigInt units of 10^-scale. */
function signedUnits(exact: string, scale: number): bigint {
  return exact.startsWith("-") ? -scaled(exact.slice(1), scale) : scaled(exact, scale);
}

const fracLen = (exact: string): number => (exact.split(".")[1] ?? "").length;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function readWaterfall(comp: any): WaterfallRead {
  const table = readFlowTable(comp);
  if (!table.ok) return table;

  if (comp?.walk === undefined || comp?.walk === null) return refuse("walk_missing", "walk is absent");
  if (!isObj(comp.walk)) return refuse("walk_malformed", "walk is not an object");
  const start = readEnd(comp.walk.start, "start");
  if (typeof start === "string") return refuse("walk_malformed", start);
  const end = readEnd(comp.walk.end, "end");
  if (typeof end === "string") return refuse("walk_malformed", end);

  // Level-1 edges in the order the table arrived: a Map keeps insertion order, and nothing sorts.
  const level1 = [...table.nodes.values()].filter((n) => n.level === 1);
  const unchecked = level1.filter((n) => n.exact === undefined);
  if (unchecked.length > 0) {
    return refuse("walk_unchecked", `value_exact missing on level-1 edge ${unchecked.map((n) => n.path.join(" / ")).join(", ")}`);
  }

  const steps: WalkStep[] = level1.map((n) => {
    const exact = n.exact as string;
    return {
      key: n.key,
      label: n.label,
      path: n.path,
      kind: n.kind,
      sign: n.sign,
      exact,
      signed: n.sign === "zero" ? 0 : n.sign === "negative" ? -Number(exact) : Number(exact),
    };
  });

  const scale = Math.max(fracLen(start.exact), fracLen(end.exact), ...steps.map((s) => fracLen(s.exact)));
  const stepUnits = (s: WalkStep): bigint => {
    if (s.sign === "zero") return BigInt(0);
    const u = scaled(s.exact, scale);
    return s.sign === "negative" ? -u : u;
  };
  const sum = steps.reduce((acc, s) => acc + stepUnits(s), BigInt(0));
  const startU = signedUnits(start.exact, scale);
  const endU = signedUnits(end.exact, scale);
  const reached = startU + sum;
  if (reached !== endU) {
    return refuse(
      "walk_unbalanced",
      `start ${formatScaled(startU, scale)} + steps ${formatScaled(sum, scale)} = ${formatScaled(reached, scale)}, ` +
        `but end is ${formatScaled(endU, scale)} (gap ${formatScaled(endU - reached, scale)})`,
    );
  }

  // The flow card's findings that bear on a walk; its shape_mismatch ("drawn as a flow") and
  // zero_subtree (a subtree this card never draws) are about the other card.
  const notes: WaterfallNote[] = table.notes
    .filter((n) => n.kind !== "shape_mismatch" && n.kind !== "zero_subtree")
    .map((n) => ({ kind: n.kind as WaterfallNoteKind, text: n.text }));
  const render = isObj(comp?.render) ? comp.render : {};
  if (typeof render.shape === "string" && render.shape !== WATERFALL_CONTRACT.archetype) {
    notes.push({
      kind: "shape_mismatch",
      text: `render.shape is ${JSON.stringify(render.shape)}: this table was declared as another shape and is drawn as a waterfall`,
    });
  }

  return {
    ok: true,
    valueLabel: table.valueLabel,
    unit: table.unit,
    verdict: table.verdict,
    provenance: readProvenance(comp),
    start,
    end,
    steps,
    notes,
  };
}
