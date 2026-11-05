/**
 * FLOW_DECOMPOSITION — a total split into its parts, level by level, drawn as a left-to-right
 * flow. Structural: it knows "a tree of signed amounts that closes at every node", nothing else.
 * Config names the case; the only words it shows come from the data (`value_label`, `render.*`,
 * `verdict`, the paths) and generic UI words.
 *
 * CORTEX-PROPOSED. The producer's measure is merged (invincible-agent #255, `3546b85c`) and its
 * served table is the contract below (`docs/plans/fin-variance-decomposition.md`, "The served
 * table: the contract cortex reads"). The PROJECTOR that lifts it into a component is not built
 * (Lane 1), so this card is inert until a component with this archetype arrives.
 *
 * ── THE TABLE ───────────────────────────────────────────────────────────────────────────────
 *
 * `rows` is an edge table, not a nested tree: `{source, target, value, value_exact, sign, level,
 * node_kind}`. Paths are lists of strings, root first; a node's label is the last element. Exactly
 * one root edge (`source: null`, `target: [root]`, `level: 0`) carries the total. `value` is the
 * ABSOLUTE amount and `sign` is the TARGET's sign, so the root's net is data, not prose.
 *
 * ── THE READER REFUSES, IT DOES NOT REPAIR ──────────────────────────────────────────────────
 *
 * Each refusal below is a rule the producer already guarantees, so a table that breaks one is
 * a defect in transit and drawing it would present a wrong flow as a right one. A refusal names
 * its reason and the edge. Three FINDINGS do not refuse — the table still draws — and are told
 * beside it: closure (the signed children of a node do not sum to the node), a sink with no
 * `render.other_label`, and zero nodes that have items beneath them (not drawn).
 *
 * ── A SINK IS RECOGNISED BY `node_kind`, NEVER BY ITS LABEL ─────────────────────────────────
 *
 * `node_kind: "other"` marks the "All other" collapse. A real item can be called anything, a sink
 * can be labelled anything; only the kind says which it is. The label is for display.
 *
 * ── CLOSURE IS CHECKED IN DECIMALS, NOT FLOATS ──────────────────────────────────────────────
 *
 * `value` is a cent-quantized float; `value_exact` is the exact Decimal string beside it. 0.1 +
 * 0.2 !== 0.3 in a float, so a closure check on `value` would raise a defect on a table that
 * closes exactly. The check scales every `value_exact` to the longest fraction in the table and
 * adds BigInts.
 */

export const FLOW_SIGNS = ["positive", "negative", "zero"] as const;
export type FlowSign = (typeof FLOW_SIGNS)[number];

export const FLOW_NODE_KINDS = ["item", "other"] as const;
export type FlowNodeKind = (typeof FLOW_NODE_KINDS)[number];

/** One reason per rule. A closed list: an unknown reason is a red in the tests, not a string. */
export const FLOW_DECOMPOSITION_REFUSAL_REASONS = [
  "no_rows",
  "malformed_edge",
  "unknown_sign",
  "unknown_node_kind",
  "root_count",
  "level_mismatch",
  "not_a_tree",
  "sink_has_children",
  "zero_with_value",
] as const;
export type FlowRefusalReason = (typeof FLOW_DECOMPOSITION_REFUSAL_REASONS)[number];

/** The reason in words, for the amber block. */
export const FLOW_REFUSAL_WORDS: Record<FlowRefusalReason, string> = {
  no_rows: "the table has no rows",
  malformed_edge: "an edge is missing a field or carries one of the wrong type",
  unknown_sign: "an edge carries a sign this card does not know",
  unknown_node_kind: "an edge carries a node kind this card does not know",
  root_count: "the table does not have exactly one well-formed root edge",
  level_mismatch: "an edge's level does not match the depth of its path",
  not_a_tree: "the edges do not form a tree",
  sink_has_children: "a collapsed-items node has items beneath it",
  zero_with_value: "an edge's sign and its value disagree about zero",
};

export const FLOW_NOTE_KINDS = ["closure", "closure_unchecked", "other_label_missing", "zero_subtree"] as const;
export type FlowNoteKind = (typeof FLOW_NOTE_KINDS)[number];

export const FLOW_DECOMPOSITION_ENVELOPE_FIELDS = ["value_label", "render", "verdict"] as const;

export const FLOW_DECOMPOSITION_CONTRACT = {
  archetype: "FLOW_DECOMPOSITION",
  component: "FlowDecomposition",
  layout: "full-width",
  /** A decomposition moves as the facts beneath it move (ADR-0042 Ruling 9's discriminant). */
  recomputes: true,
  fields: {
    /** The edge table. Edge: source, target, value, value_exact, sign, level, node_kind. */
    rows: { encoding: "array", parsesTo: "array-of-objects", required: true },
    value_label: { type: "string", required: false },
    /** The card reads ONLY `render.unit` and `render.other_label`; every other key is ignored. */
    render: { type: "object", required: false },
    verdict: { type: "string", required: false },
  },
  refusalReasons: FLOW_DECOMPOSITION_REFUSAL_REASONS,
} as const;

export interface FlowNode {
  /** Internal identity: the path, JSON-encoded. Paths are unique by construction. */
  key: string;
  path: string[];
  /** What is drawn: `render.other_label` for a sink that has one, else the path's last element. */
  label: string;
  level: number;
  kind: FlowNodeKind;
  sign: FlowSign;
  /** Absolute amount (>= 0). */
  value: number;
  /** The exact decimal string, when the edge carried one. */
  exact: string | undefined;
  parent: string | null;
  children: string[];
}

export interface FlowNote {
  kind: FlowNoteKind;
  text: string;
}

export interface FlowTable {
  ok: true;
  valueLabel: string | undefined;
  unit: string | undefined;
  otherLabel: string | undefined;
  verdict: string | undefined;
  /** Keyed by `FlowNode.key`, in the order the edges arrived (root first). */
  nodes: Map<string, FlowNode>;
  rootKey: string;
  notes: FlowNote[];
}

export type FlowRead = FlowTable | { ok: false; refusal: FlowRefusalReason; detail: string };

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const isPath = (v: unknown): v is string[] => Array.isArray(v) && v.length > 0 && v.every((s) => typeof s === "string");
const keyOf = (path: string[]): string => JSON.stringify(path);
const show = (path: string[] | null): string => (path === null ? "(root)" : path.join(" / "));
const DECIMAL = /^\d+(\.\d+)?$/;

interface RawEdge {
  index: number;
  source: string[] | null;
  target: string[];
  value: number;
  exact: string | undefined;
  sign: FlowSign;
  level: number;
  kind: FlowNodeKind;
}

function refuse(refusal: FlowRefusalReason, detail: string): FlowRead {
  return { ok: false, refusal, detail };
}

/** Parse one row, or say which rule it breaks. Field-level rules only. */
function readEdge(raw: unknown, index: number): RawEdge | Extract<FlowRead, { ok: false }> {
  const at = `edge ${index}`;
  const bad = (what: string) => refuse("malformed_edge", `${at}: ${what}`) as Extract<FlowRead, { ok: false }>;
  if (!isObj(raw)) return bad("not an object");
  const { source, target, value, value_exact, sign, level, node_kind } = raw;
  if (source !== null && !isPath(source)) return bad("source is neither null nor a list of strings");
  if (!isPath(target)) return bad("target is not a non-empty list of strings");
  const where = `${at} (${show(target)})`;
  const badAt = (what: string) => refuse("malformed_edge", `${where}: ${what}`) as Extract<FlowRead, { ok: false }>;
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) return badAt("value is not a finite number >= 0");
  if (value_exact !== undefined && (typeof value_exact !== "string" || !DECIMAL.test(value_exact))) {
    return badAt("value_exact is present but not a decimal string");
  }
  if (typeof level !== "number" || !Number.isInteger(level) || level < 0) return badAt("level is not a non-negative integer");
  if (typeof sign !== "string") return badAt("sign is missing");
  if (typeof node_kind !== "string") return badAt("node_kind is missing");
  if (!(FLOW_SIGNS as readonly string[]).includes(sign)) {
    return refuse("unknown_sign", `${where}: sign ${JSON.stringify(sign)}`) as Extract<FlowRead, { ok: false }>;
  }
  if (!(FLOW_NODE_KINDS as readonly string[]).includes(node_kind)) {
    return refuse("unknown_node_kind", `${where}: node_kind ${JSON.stringify(node_kind)}`) as Extract<FlowRead, { ok: false }>;
  }
  if ((sign === "zero") !== (value === 0)) {
    return refuse("zero_with_value", `${where}: sign ${sign} with value ${value}`) as Extract<FlowRead, { ok: false }>;
  }
  return {
    index,
    source,
    target,
    value,
    exact: value_exact as string | undefined,
    sign: sign as FlowSign,
    level,
    kind: node_kind as FlowNodeKind,
  };
}

/** A decimal string as BigInt units of 10^-scale. */
function scaled(exact: string, scale: number): bigint {
  const [whole, frac = ""] = exact.split(".");
  return BigInt(whole + frac.padEnd(scale, "0"));
}

function formatScaled(units: bigint, scale: number): string {
  const neg = units < BigInt(0);
  const digits = (neg ? -units : units).toString().padStart(scale + 1, "0");
  const body = scale === 0 ? digits : `${digits.slice(0, -scale)}.${digits.slice(-scale)}`;
  return neg ? `-${body}` : body;
}

/** Closure findings for a table whose every edge carries `value_exact`. Exact, never floats. */
function closureNotes(nodes: Map<string, FlowNode>): FlowNote[] {
  const scale = Math.max(0, ...[...nodes.values()].map((n) => (n.exact?.split(".")[1] ?? "").length));
  const zero = BigInt(0);
  const signed = (n: FlowNode): bigint => {
    if (n.sign === "zero") return zero;
    const units = scaled(n.exact as string, scale);
    return n.sign === "negative" ? -units : units;
  };
  const notes: FlowNote[] = [];
  for (const node of nodes.values()) {
    if (node.children.length === 0) continue;
    const sum = node.children.reduce((acc, k) => acc + signed(nodes.get(k) as FlowNode), zero);
    const own = signed(node);
    if (sum !== own) {
      notes.push({
        kind: "closure",
        text:
          `${node.label}: its items sum to ${formatScaled(sum, scale)} but it is ${formatScaled(own, scale)} ` +
          `(difference ${formatScaled(sum - own, scale)})`,
      });
    }
  }
  return notes;
}

/** Read an edge table off a component, or refuse it with one reason and the edge at fault. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function readFlowTable(comp: any): FlowRead {
  const rows: unknown = comp?.rows;
  if (!Array.isArray(rows) || rows.length === 0) return refuse("no_rows", "rows is missing, not a list, or empty");

  const edges: RawEdge[] = [];
  for (let i = 0; i < rows.length; i++) {
    const e = readEdge(rows[i], i);
    if (!("target" in e)) return e;
    edges.push(e);
  }

  const roots = edges.filter((e) => e.source === null);
  if (roots.length !== 1) return refuse("root_count", `${roots.length} edges have a null source; expected exactly one`);
  const root = roots[0];
  if (root.level !== 0 || root.target.length !== 1) {
    return refuse("root_count", `root edge ${show(root.target)}: level ${root.level}, path length ${root.target.length}; expected level 0 and one element`);
  }

  for (const e of edges) {
    if (e.level !== e.target.length - 1) {
      return refuse("level_mismatch", `edge ${e.index} (${show(e.target)}): level ${e.level}, path depth ${e.target.length - 1}`);
    }
  }

  const byKey = new Map<string, RawEdge>();
  for (const e of edges) {
    const k = keyOf(e.target);
    if (byKey.has(k)) return refuse("not_a_tree", `edge ${e.index}: ${show(e.target)} appears as a target twice`);
    byKey.set(k, e);
  }
  for (const e of edges) {
    if (e.source === null) continue;
    if (keyOf(e.source) !== keyOf(e.target.slice(0, -1))) {
      return refuse("not_a_tree", `edge ${e.index} (${show(e.target)}): source ${show(e.source)} is not the path minus its last element`);
    }
    if (!byKey.has(keyOf(e.source))) {
      return refuse("not_a_tree", `edge ${e.index} (${show(e.target)}): source ${show(e.source)} is no edge's target`);
    }
  }
  for (const e of edges) {
    if (e.source === null) continue;
    const parent = byKey.get(keyOf(e.source)) as RawEdge;
    if (parent.kind === "other") {
      return refuse("sink_has_children", `edge ${e.index} (${show(e.target)}): its source ${show(e.source)} is a collapsed-items node`);
    }
  }

  const render = isObj(comp?.render) ? comp.render : {};
  const otherLabel = typeof render.other_label === "string" && render.other_label.trim() !== "" ? render.other_label : undefined;
  const unit = typeof render.unit === "string" && render.unit !== "" ? render.unit : undefined;

  const nodes = new Map<string, FlowNode>();
  for (const e of edges) {
    nodes.set(keyOf(e.target), {
      key: keyOf(e.target),
      path: e.target,
      label: e.kind === "other" && otherLabel !== undefined ? otherLabel : e.target[e.target.length - 1],
      level: e.level,
      kind: e.kind,
      sign: e.sign,
      value: e.value,
      exact: e.exact,
      parent: e.source === null ? null : keyOf(e.source),
      children: [],
    });
  }
  for (const n of nodes.values()) if (n.parent !== null) (nodes.get(n.parent) as FlowNode).children.push(n.key);

  const notes: FlowNote[] = [];
  const unchecked = [...nodes.values()].filter((n) => n.exact === undefined).length;
  if (unchecked > 0) {
    notes.push({ kind: "closure_unchecked", text: `closure not checked: value_exact missing on ${unchecked} edges` });
  } else {
    notes.push(...closureNotes(nodes));
  }
  if ([...nodes.values()].some((n) => n.kind === "other") && otherLabel === undefined) {
    notes.push({
      kind: "other_label_missing",
      text: "render.other_label is missing: collapsed items are labelled with the last element of their path",
    });
  }
  const zeroWithItems = [...nodes.values()].filter((n) => n.sign === "zero" && n.children.length > 0).length;
  if (zeroWithItems > 0) {
    notes.push({ kind: "zero_subtree", text: `${zeroWithItems} items at zero have items beneath them that aren't drawn` });
  }

  return {
    ok: true,
    valueLabel: typeof comp?.value_label === "string" && comp.value_label !== "" ? comp.value_label : undefined,
    unit,
    otherLabel,
    verdict: typeof comp?.verdict === "string" ? comp.verdict : undefined,
    nodes,
    rootKey: keyOf(root.target),
    notes,
  };
}
