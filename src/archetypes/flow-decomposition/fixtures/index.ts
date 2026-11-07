/**
 * DISCRIMINATING FIXTURES — ADR-0055 §2, for `FLOW_DECOMPOSITION`.
 *
 * SYNTHETIC: generic names and invented figures, built to the served contract (see
 * `../contract.ts`) and closing EXACTLY at every node. Edges are generated from a small tree spec
 * and sorted as the producer sorts them (level, source, value descending, target) — the spec
 * carries the signed decimal, the builder derives `value`, `value_exact`, `sign`, `level`.
 *
 * The negative fixtures are made by breaking ONE rule of `plainRows()`, so each trips only the rule
 * its name gives.
 */
export const FLOW_DECOMPOSITION_ABSENCES = [
  "data-flow-refusal",
  "data-flow-node",
  "data-flow-link",
  "data-flow-sign",
  "data-flow-sink",
  "data-flow-passthrough",
  "data-flow-crumbs",
  "data-flow-crumb",
  "data-flow-note",
  "data-flow-verdict",
  "data-flow-empty",
] as const;

export type FlowDecompositionAbsence = (typeof FLOW_DECOMPOSITION_ABSENCES)[number];

export interface Edge {
  source: string[] | null;
  target: string[];
  value: number;
  value_exact?: string;
  sign: string;
  level: number;
  node_kind: string;
}

export interface FlowFixture {
  name: string;
  payload: Record<string, unknown>;
  declares: FlowDecompositionAbsence[];
}

export interface Spec {
  name: string;
  /** Signed decimal string, e.g. "-300.50". */
  v: string;
  sink?: boolean;
  kids?: Spec[];
}

export const spec = (name: string, v: string, kids?: Spec[], sink = false): Spec => ({ name, v, kids, sink });

const pathKey = (p: string[] | null): string => (p === null ? "" : JSON.stringify(p));

export function edgesOf(root: Spec): Edge[] {
  const out: Edge[] = [];
  const visit = (n: Spec, source: string[] | null) => {
    const target = [...(source ?? []), n.name];
    const neg = n.v.startsWith("-");
    const abs = neg ? n.v.slice(1) : n.v;
    const zero = Number(abs) === 0;
    out.push({
      source,
      target,
      value: Number(abs),
      value_exact: abs,
      sign: zero ? "zero" : neg ? "negative" : "positive",
      level: target.length - 1,
      node_kind: n.sink ? "other" : "item",
    });
    for (const k of n.kids ?? []) visit(k, target);
  };
  visit(root, null);
  return out.sort(
    (a, b) =>
      a.level - b.level ||
      (pathKey(a.source) < pathKey(b.source) ? -1 : pathKey(a.source) > pathKey(b.source) ? 1 : 0) ||
      b.value - a.value ||
      (pathKey(a.target) < pathKey(b.target) ? -1 : 1),
  );
}

export const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

export function find(rows: Edge[], ...target: string[]): Edge {
  const hit = rows.find((e) => JSON.stringify(e.target) === JSON.stringify(target));
  if (!hit) throw new Error(`fixture edge not found: ${target.join(" / ")}`);
  return hit;
}

/**
 * Four levels below the root; both signs at several levels; a leaf zero (B4) and a zero node WITH
 * offsetting children (B3: +50 / -50, not drawn); a sink at level 2 (under A) and one at level 3
 * (under A1); a sink whose sign is zero (under A2); and 0.10 + 0.20 = 0.30 exactly under C1, which
 * a float sum gets wrong. 1500.00 - 300.50 + 0.30 = 1199.80.
 */
export const GOOD_TREE: Spec = spec("Program", "1199.80", [
  spec("Group A", "1500.00", [
    spec("Item A1", "1000.00", [
      spec("Part A1a", "800.00", [spec("Piece A1a1", "500.00"), spec("Piece A1a2", "350.00"), spec("Piece A1a3", "-50.00")]),
      spec("Part A1b", "-100.00"),
      spec("All other", "300.00", undefined, true),
    ]),
    spec("Item A2", "-200.00", [spec("Part A2a", "-200.00"), spec("All other", "0.00", undefined, true)]),
    spec("All other", "700.00", undefined, true),
  ]),
  spec("Group B", "-300.50", [
    spec("Item B1", "-500.50", [
      spec("Part B1a", "-400.25", [spec("Piece B1a1", "-300.00"), spec("Piece B1a2", "-100.25")]),
      spec("Part B1b", "-100.25"),
    ]),
    spec("Item B2", "200.00"),
    spec("Item B3", "0.00", [spec("Part B3a", "50.00"), spec("Part B3b", "-50.00")]),
    spec("Item B4", "0.00"),
  ]),
  spec("Group C", "0.30", [spec("Item C1", "0.30", [spec("Part C1a", "0.10"), spec("Part C1b", "0.20")])]),
]);

/** `render` as engine-fin serves it: the row's block plus `other_label`. The top-level
 *  `value_label` beside it is the engine's echo of `render.value_label`. */
export const GOOD_RENDER = { shape: "FLOW_DECOMPOSITION", value_label: "Net amount", unit: "USD", other_label: "All other" };

export const PLAIN_TREE: Spec = spec("Total", "50.00", [
  spec("Branch 1", "60.00", [
    spec("Leaf 1a", "45.00"),
    spec("Leaf 1b", "-5.00"),
    spec("All other", "20.00", undefined, true),
  ]),
  spec("Branch 2", "-10.00", [spec("Leaf 2a", "-10.00")]),
]);
export const PLAIN_RENDER = { shape: "FLOW_DECOMPOSITION", value_label: "Quantity", other_label: "All other" };
export const plainRows = (): Edge[] => edgesOf(PLAIN_TREE);
export const plain = (rows: Edge[], over: Record<string, unknown> = {}): Record<string, unknown> => ({
  rows,
  value_label: "Quantity",
  render: PLAIN_RENDER,
  ...over,
});

/** PLAIN's rows with one mutation applied. */
export const broken = (mutate: (rows: Edge[]) => void): Edge[] => {
  const rows = clone(plainRows());
  mutate(rows);
  return rows;
};

/** An item whose LABEL equals `other_label`, and a sink whose label is something else. */
export const LOOKALIKE_TREE: Spec = spec("Total", "35.00", [
  spec("Branch", "35.00", [
    spec("All other", "10.00"),
    spec("Remainder", "20.00", undefined, true),
    spec("Deep", "5.00", [spec("Leaf", "5.00")]),
  ]),
]);

const DRAWN: FlowDecompositionAbsence[] = [
  "data-flow-node",
  "data-flow-link",
  "data-flow-sign",
  "data-flow-crumbs",
  "data-flow-crumb",
];
const REFUSED: FlowDecompositionAbsence[] = ["data-flow-refusal"];

export const FLOW_DECOMPOSITION_FIXTURES: FlowFixture[] = [
  {
    name: "four levels, both signs, zeros, sinks at levels 2 and 3, a verdict",
    payload: {
      rows: edgesOf(GOOD_TREE),
      value_label: "Net amount",
      render: GOOD_RENDER,
      verdict: "Synthetic fixture: one program, three groups.",
    },
    declares: [...DRAWN, "data-flow-sink", "data-flow-passthrough", "data-flow-verdict", "data-flow-note"],
  },
  {
    name: "plain — small, no unit, no verdict, a sink at the deepest level",
    payload: plain(plainRows()),
    declares: [...DRAWN, "data-flow-sink"],
  },
  {
    name: "an item labelled like the sink and a sink labelled otherwise",
    payload: plain(edgesOf(LOOKALIKE_TREE)),
    declares: [...DRAWN, "data-flow-sink", "data-flow-passthrough"],
  },
  {
    name: "everything at zero — nothing to draw",
    payload: { rows: edgesOf(spec("Total", "0.00", [spec("Branch", "0.00")])), value_label: "Quantity" },
    declares: ["data-flow-crumbs", "data-flow-crumb", "data-flow-empty", "data-flow-note"],
  },
  // ── findings: drawn, plus an amber line ─────────────────────────────────────────────────
  {
    name: "closure — one value_exact is a cent off",
    payload: plain(broken((r) => void (find(r, "Total", "Branch 1", "Leaf 1a").value_exact = "45.01"))),
    declares: [...DRAWN, "data-flow-sink", "data-flow-note"],
  },
  {
    name: "closure_unchecked — value_exact missing on one edge",
    payload: plain(broken((r) => void delete find(r, "Total", "Branch 2", "Leaf 2a").value_exact)),
    declares: [...DRAWN, "data-flow-sink", "data-flow-note"],
  },
  {
    name: "other_label_missing — a sink and no render.other_label",
    payload: plain(plainRows(), { render: {} }),
    declares: [...DRAWN, "data-flow-sink", "data-flow-note"],
  },
  {
    name: "shape_mismatch — render.shape names another archetype",
    payload: plain(plainRows(), { render: { ...PLAIN_RENDER, shape: "MULTI_SERIES" } }),
    declares: [...DRAWN, "data-flow-sink", "data-flow-note"],
  },
  {
    name: "zero_subtree — a zero node with items beneath it",
    payload: plain(
      edgesOf(
        spec("Total", "50.00", [
          spec("Branch 1", "60.00", [
            spec("Leaf 1a", "45.00"),
            spec("Leaf 1b", "-5.00"),
            spec("All other", "20.00", undefined, true),
          ]),
          spec("Branch 2", "-10.00", [spec("Leaf 2a", "-10.00")]),
          spec("Branch 3", "0.00", [spec("Leaf 3a", "5.00"), spec("Leaf 3b", "-5.00")]),
        ]),
      ),
    ),
    declares: [...DRAWN, "data-flow-sink", "data-flow-note"],
  },
  // ── refusals: one rule each ─────────────────────────────────────────────────────────────
  { name: "no_rows — an empty table", payload: plain([]), declares: REFUSED },
  {
    name: "malformed_edge — an edge without a value",
    payload: plain(broken((r) => void delete (find(r, "Total", "Branch 2") as Partial<Edge>).value)),
    declares: REFUSED,
  },
  {
    name: "unknown_sign — a sign outside the closed list",
    payload: plain(broken((r) => void (find(r, "Total", "Branch 2").sign = "up"))),
    declares: REFUSED,
  },
  {
    name: "unknown_node_kind — a kind outside the closed list",
    payload: plain(broken((r) => void (find(r, "Total", "Branch 2").node_kind = "remainder"))),
    declares: REFUSED,
  },
  {
    name: "root_count — two edges with a null source",
    payload: plain(broken((r) => void (find(r, "Total", "Branch 2").source = null))),
    declares: REFUSED,
  },
  {
    name: "level_mismatch — a level that is not the path depth",
    payload: plain(broken((r) => void (find(r, "Total", "Branch 2", "Leaf 2a").level = 1))),
    declares: REFUSED,
  },
  {
    name: "not_a_tree — a target path that appears twice",
    payload: plain(broken((r) => void r.push(clone(find(r, "Total", "Branch 2", "Leaf 2a"))))),
    declares: REFUSED,
  },
  {
    name: "sink_has_children — an edge whose source is a sink",
    payload: plain(
      broken(
        (r) =>
          void r.push({
            source: ["Total", "Branch 1", "All other"],
            target: ["Total", "Branch 1", "All other", "Inner"],
            value: 1,
            value_exact: "1",
            sign: "positive",
            level: 3,
            node_kind: "item",
          }),
      ),
    ),
    declares: REFUSED,
  },
  {
    name: "zero_with_value — sign zero beside a value",
    payload: plain(broken((r) => void (find(r, "Total", "Branch 2", "Leaf 2a").sign = "zero"))),
    declares: REFUSED,
  },
];
