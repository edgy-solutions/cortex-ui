/**
 * DISCRIMINATING FIXTURES — ADR-0055 §2, for `WATERFALL`.
 *
 * SYNTHETIC: generic names and invented figures, built to the served contract (see
 * `../contract.ts`; the edge table is the flow card's, built with its fixture helpers). The walk
 * balances EXACTLY: 1000.00 + 300.00 + 40.50 - 250.00 + 109.50 = 1200.00. The negative fixtures
 * break ONE rule of `good()`, so each trips only the rule its name gives.
 */
import { clone, edgesOf, find, spec, type Edge, type Spec } from "../../flow-decomposition/fixtures";

export const WATERFALL_ABSENCES = [
  "data-waterfall-refusal",
  "data-waterfall-bar",
  "data-waterfall-sign",
  "data-waterfall-remainder",
  "data-waterfall-connector",
  "data-waterfall-verdict",
  "data-waterfall-note",
  "data-waterfall-provenance",
] as const;

export type WaterfallAbsence = (typeof WATERFALL_ABSENCES)[number];

export interface WaterfallFixture {
  name: string;
  payload: Record<string, unknown>;
  declares: WaterfallAbsence[];
}

export const WATERFALL_RENDER = { shape: "WATERFALL", value_label: "Net movement", unit: "USD", other_label: "All other" };
export const WATERFALL_PROVENANCE = "SYNTHETIC DATA: invented figures, not a program. Source: urn:fixture:waterfall";

const end = (label: string, v: string) => ({ label, value: Number(v), value_exact: v });

/**
 * Served order of the level-1 steps: Beta (40.50), Alpha (300.00), the remainder (109.50), Gamma
 * (-250.00). Not by value, not by signed value, not by label: a re-sort changes it.
 */
export const STEP_ORDER = ["Beta", "Alpha", "All other", "Gamma"] as const;

const TREE: Spec = spec("Program", "200.00", [
  spec("Alpha", "300.00", [spec("Alpha 1", "300.00")]),
  spec("Beta", "40.50"),
  spec("Gamma", "-250.00", [spec("Gamma 1", "-250.00")]),
  spec("All other", "109.50", undefined, true),
]);

/** edgesOf sorts by value; the producer's order is whatever it served, so put the level-1 edges in `order`. */
export function servedInOrder(rows: Edge[], order: readonly string[]): Edge[] {
  const level1 = rows.filter((e) => e.level === 1);
  const byLabel = (l: string) => level1.find((e) => e.target[e.target.length - 1] === l) as Edge;
  const reordered = order.map(byLabel);
  let k = 0;
  return rows.map((e) => (e.level === 1 ? reordered[k++] : e));
}

export const goodRows = (): Edge[] => servedInOrder(edgesOf(TREE), STEP_ORDER);

export const good = (over: Record<string, unknown> = {}): Record<string, unknown> => ({
  rows: goodRows(),
  walk: { start: end("Opening total", "1000.00"), end: end("Closing total", "1200.00") },
  value_label: "Net movement",
  render: WATERFALL_RENDER,
  ...over,
});

export const brokenRows = (mutate: (rows: Edge[]) => void): Edge[] => {
  const rows = clone(goodRows());
  mutate(rows);
  return rows;
};

/** A negative start, no remainder: -100.00 + 40.00 - 10.50 = -70.50. */
export const NEGATIVE_START: Record<string, unknown> = {
  rows: edgesOf(spec("Program", "29.50", [spec("Up", "40.00"), spec("Down", "-10.50")])),
  walk: { start: end("Opening total", "-100.00"), end: end("Closing total", "-70.50") },
  value_label: "Net movement",
  render: { shape: "WATERFALL", value_label: "Net movement" },
};

const BARS: WaterfallAbsence[] = ["data-waterfall-bar", "data-waterfall-sign", "data-waterfall-connector"];
const REFUSED: WaterfallAbsence[] = ["data-waterfall-refusal"];

export const WATERFALL_FIXTURES: WaterfallFixture[] = [
  {
    name: "balanced — a remainder step, both signs, a verdict, a banner",
    payload: good({ verdict: "Synthetic fixture: one walk.", data_provenance: WATERFALL_PROVENANCE }),
    declares: [...BARS, "data-waterfall-remainder", "data-waterfall-verdict", "data-waterfall-provenance"],
  },
  {
    name: "negative start — totals below zero, no remainder",
    payload: NEGATIVE_START,
    declares: BARS,
  },
  {
    name: "shape_mismatch — render.shape names another archetype",
    payload: good({ render: { ...WATERFALL_RENDER, shape: "MULTI_SERIES" } }),
    declares: [...BARS, "data-waterfall-remainder", "data-waterfall-note"],
  },
  {
    name: "other_label_missing — a remainder and no render.other_label",
    payload: good({ render: { shape: "WATERFALL" } }),
    declares: [...BARS, "data-waterfall-remainder", "data-waterfall-note"],
  },
  // ── refusals: one rule each ─────────────────────────────────────────────────────────────
  { name: "no_rows — a flow refusal passes through", payload: good({ rows: [] }), declares: REFUSED },
  {
    name: "walk_missing — no walk is served, so no total is inferred",
    payload: (({ walk: _w, ...rest }) => rest)(good()),
    declares: REFUSED,
  },
  {
    name: "walk_malformed — a value_exact that is not a plain decimal",
    payload: good({ walk: { start: end("Opening total", "1000.00"), end: { label: "Closing total", value: 1200, value_exact: "1.2e3" } } }),
    declares: REFUSED,
  },
  {
    name: "walk_unchecked — a level-1 edge without value_exact",
    payload: good({ rows: brokenRows((r) => void delete find(r, "Program", "Beta").value_exact) }),
    declares: REFUSED,
  },
  {
    name: "walk_unbalanced — the end is a cent off",
    payload: good({ walk: { start: end("Opening total", "1000.00"), end: end("Closing total", "1200.01") } }),
    declares: REFUSED,
  },
];
