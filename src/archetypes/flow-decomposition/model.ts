/**
 * The model the card hands to `Sankey` — pure, so the rules that decide WHAT is drawn are tested
 * without a chart. `contract.ts` reads and refuses; this file selects and lays out the levels.
 *
 * ── COLUMNS COME FROM THE DATA ──────────────────────────────────────────────────────────────
 *
 * A node's column is its `level` (relative to the focused node). Recharts computes columns from
 * graph depth, so the rules below keep that true: every drawn node is reachable from the view's
 * first node by drawn links. Nothing here knows how many levels there are.
 *
 * ── ZERO DRAWS NO BAND ──────────────────────────────────────────────────────────────────────
 *
 * A zero node is not drawn, and neither is anything beneath it (it would be unreachable, and
 * recharts would put it in column 0). Each zero child is LISTED on its parent's hover instead.
 *
 * ── THE SINK IS A BYPASS BAND ───────────────────────────────────────────────────────────────
 *
 * A sink is terminal at its own level, but its band should not vanish while its siblings carry on
 * deeper. When the drawn maximum level M exceeds the sink's level L, the band continues to the
 * right edge through hidden pass-through nodes at L+1..M, each linked with the sink's value.
 */
import type { FlowNode, FlowSign, FlowTable } from "./contract";

export interface DrawnNode {
  /** Index in the Sankey `nodes` array. */
  index: number;
  /** `FlowNode.key` for a real node; the sink's key for a pass-through. */
  key: string;
  /** Recharts reads the label from `name`. */
  name: string;
  label: string;
  path: string[];
  kind: FlowNode["kind"];
  sign: FlowSign;
  /** The real amount. Recharts overwrites `value` on its node objects (with the larger of in and out), so labels read this. */
  amount: number;
  value: number;
  /** Column, relative to the view's first node. Equals `level` minus the focused node's level. */
  depth: number;
  /** A hidden continuation of a sink's band: no rect, no label. */
  passthrough: boolean;
  /** Drawn children exist, so a click can focus its subtree. */
  clickable: boolean;
}

export interface DrawnLink {
  source: number;
  target: number;
  value: number;
  sign: FlowSign;
  /** The real node this link belongs to (the sink, for a pass-through). */
  key: string;
  passthrough: boolean;
}

export interface Crumb {
  key: string;
  label: string;
}

export interface FlowGraph {
  nodes: DrawnNode[];
  links: DrawnLink[];
  focusKey: string;
  crumbs: Crumb[];
  /** Zero children, by parent key, as display labels. */
  zeroByParent: Map<string, string[]>;
  maxDepth: number;
}

/** Whether a click on this node would focus its subtree: a drawn child exists and it is not a sink. */
function hasDrawnChild(table: FlowTable, node: FlowNode): boolean {
  return node.kind === "item" && node.children.some((k) => (table.nodes.get(k) as FlowNode).sign !== "zero");
}

export function buildFlowGraph(table: FlowTable, focus: string | null): FlowGraph {
  const focusKey = focus !== null && table.nodes.has(focus) ? focus : table.rootKey;
  const first = table.nodes.get(focusKey) as FlowNode;
  const nodes: DrawnNode[] = [];
  const links: DrawnLink[] = [];
  const zeroByParent = new Map<string, string[]>();
  const indexOf = new Map<string, number>();

  const add = (n: FlowNode): number => {
    const index = nodes.length;
    indexOf.set(n.key, index);
    nodes.push({
      index,
      key: n.key,
      name: n.label,
      label: n.label,
      path: n.path,
      kind: n.kind,
      sign: n.sign,
      value: n.value,
      amount: n.value,
      depth: n.level - first.level,
      passthrough: false,
      clickable: hasDrawnChild(table, n),
    });
    return index;
  };

  const walk = (n: FlowNode) => {
    const from = indexOf.get(n.key) as number;
    for (const k of n.children) {
      const child = table.nodes.get(k) as FlowNode;
      if (child.sign === "zero") {
        const list = zeroByParent.get(n.key) ?? [];
        list.push(child.label);
        zeroByParent.set(n.key, list);
        continue;
      }
      links.push({ source: from, target: add(child), value: child.value, sign: child.sign, key: child.key, passthrough: false });
      walk(child);
    }
  };
  add(first);
  walk(first);

  const maxDepth = Math.max(...nodes.map((n) => n.depth));
  for (const sink of nodes.filter((n) => n.kind === "other")) {
    let from = sink.index;
    for (let d = sink.depth + 1; d <= maxDepth; d++) {
      const index = nodes.length;
      nodes.push({ ...sink, index, depth: d, passthrough: true, clickable: false });
      links.push({ source: from, target: index, value: sink.value, sign: sink.sign, key: sink.key, passthrough: true });
      from = index;
    }
  }

  const crumbs: Crumb[] = [];
  for (let k: string | null = focusKey; k !== null; k = (table.nodes.get(k) as FlowNode).parent) {
    crumbs.unshift({ key: k, label: (table.nodes.get(k) as FlowNode).label });
  }
  return { nodes, links, focusKey, crumbs, zeroByParent, maxDepth };
}

const NUMBER = new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 });

/** `+1,065,000 USD`, `−35,000 USD` (U+2212), `0`. The unit only when the table served one. */
export function signedText(sign: FlowSign, value: number, unit: string | undefined): string {
  const body = NUMBER.format(value);
  const signed = sign === "positive" ? `+${body}` : sign === "negative" ? `−${body}` : body;
  return unit === undefined ? signed : `${signed} ${unit}`;
}

export interface Hover {
  title: string;
  valueLabel: string | undefined;
  value: string;
  signWords: string;
  zeroList: string | undefined;
  sink: string | undefined;
}

/** What a hover on a node (or on a band into it) says. A pass-through answers as its sink. */
export function hoverFor(table: FlowTable, key: string): Hover | undefined {
  const node = table.nodes.get(key);
  if (!node) return undefined;
  const zeros = zeroLabelsOf(table, node);
  return {
    title: node.label,
    valueLabel: table.valueLabel,
    value: signedText(node.sign, node.value, table.unit),
    signWords: node.sign,
    zeroList: zeros.length > 0 ? `${zeros.length} at zero: ${zeros.join(", ")}` : undefined,
    sink: node.kind === "other" ? "sink (collapsed items)" : undefined,
  };
}

function zeroLabelsOf(table: FlowTable, node: FlowNode): string[] {
  return node.children.map((k) => table.nodes.get(k) as FlowNode).filter((c) => c.sign === "zero").map((c) => c.label);
}
