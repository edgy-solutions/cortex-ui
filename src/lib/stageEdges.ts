import type { Artifact } from "@/api/types";

/**
 * stageEdges — the TYPED cross-answer edge model for GRAPH mode (ADR-0028).
 *
 * Edges carry a `kind` and support DIRECTION from day one, even though only one
 * kind exists today — so lineage edges (a second kind, directed) layer on later
 * WITHOUT restructuring. "Make the mechanism general, populate it with one thing
 * now" (same discipline as the argument-fit slot, the compartment overlay).
 *
 *   same-subject (TODAY) — two answers about the SAME RESOLVED INSTANCE. Keyed
 *     on the instance URI, NOT the class: connecting every "Dataset" answer to
 *     every other would be a hairball, not signal. Symmetric (undirected).
 *   lineage (FILED FOLLOW-UP) — answers whose subjects are linked in DataHub
 *     lineage (customers_gold → silver → raw). DIRECTED (upstream→downstream).
 *     Needs backend lineage queries per subject; not built tonight. The model
 *     already takes it: {from, to, kind, directed}.
 */
export type EdgeKind = "same-subject" | "lineage";

export interface StageEdge {
  from: string; // answer id
  to: string; // answer id
  kind: EdgeKind;
  directed: boolean; // same-subject: false; lineage: true
}

/** The resolved INSTANCE URI the answer is about — the same-subject key. Empty
 *  when the answer didn't resolve to a specific instance (class-only answers
 *  don't get same-subject edges; that's intentional — no hairball). */
export function subjectInstanceKey(a: Artifact): string {
  const about = a.routing?.about;
  if (about?.instance_resolved && about.instance_identifier) {
    return about.instance_identifier;
  }
  return "";
}

/** Same-subject edges: all pairs of answers sharing a resolved instance. */
export function computeSameSubjectEdges(items: Artifact[]): StageEdge[] {
  const byKey = new Map<string, string[]>();
  for (const a of items) {
    const k = subjectInstanceKey(a);
    if (!k) continue;
    if (!byKey.has(k)) byKey.set(k, []);
    byKey.get(k)!.push(a.id);
  }
  const edges: StageEdge[] = [];
  for (const ids of byKey.values()) {
    for (let i = 0; i < ids.length; i++) {
      for (let j = i + 1; j < ids.length; j++) {
        edges.push({ from: ids[i], to: ids[j], kind: "same-subject", directed: false });
      }
    }
  }
  return edges;
}

/**
 * THE SUBJECT INDEX, in ONE O(N) pass. Everything lazy below reads it instead of the pairwise
 * edge list, which is O(sum of group size squared) and was what blocked the first paint at 1,000
 * answers.
 */
export interface SubjectIndex {
  /** subject key -> member ids in item order (only answers that resolved to an instance). */
  groups: Map<string, string[]>;
  /** answer id -> its subject key. */
  keyById: Map<string, string>;
  /** answer id -> position inside its group, so an edge keeps the (earlier, later) order. */
  posById: Map<string, number>;
}

export function indexSubjects(items: readonly Artifact[]): SubjectIndex {
  const groups = new Map<string, string[]>();
  const keyById = new Map<string, string>();
  const posById = new Map<string, number>();
  for (const a of items) {
    const k = subjectInstanceKey(a);
    if (!k) continue;
    let g = groups.get(k);
    if (!g) groups.set(k, (g = []));
    posById.set(a.id, g.length);
    g.push(a.id);
    keyById.set(a.id, k);
  }
  return { groups, keyById, posById };
}

/**
 * A SPANNING CHAIN per subject group: k-1 edges instead of k(k-1)/2. It has the same connected
 * components as the full clique, which is all the GRAPH layout and the list's graph clustering
 * read. It is NOT what is drawn: lines come from `sameSubjectEdgesFor`.
 */
export function subjectChainEdges(index: SubjectIndex): StageEdge[] {
  const edges: StageEdge[] = [];
  for (const ids of index.groups.values()) {
    for (let i = 1; i < ids.length; i++) {
      edges.push({ from: ids[i - 1], to: ids[i], kind: "same-subject", directed: false });
    }
  }
  return edges;
}

/**
 * LAZY same-subject edges: only those incident to an OPENED answer, within its subject group.
 * For one opened node in a group of k that is k-1 edges, the same ones `computeSameSubjectEdges`
 * gives for that node, with the same (earlier, later) orientation. An edge between two opened
 * nodes is emitted once.
 */
export function sameSubjectEdgesFor(openedIds: Iterable<string>, index: SubjectIndex): StageEdge[] {
  const edges: StageEdge[] = [];
  const seen = new Set<string>();
  for (const id of openedIds) {
    const k = index.keyById.get(id);
    if (!k) continue;
    const ids = index.groups.get(k)!;
    const me = index.posById.get(id)!;
    for (let j = 0; j < ids.length; j++) {
      if (j === me) continue;
      const [lo, hi] = j < me ? [j, me] : [me, j];
      const key = lo + ":" + hi + ":" + k;
      if (seen.has(key)) continue;
      seen.add(key);
      edges.push({ from: ids[lo], to: ids[hi], kind: "same-subject", directed: false });
    }
  }
  return edges;
}

/** All edges for the current answer set. Same-subject today; lineage (directed)
 *  slots in here as a second kind when the backend signal lands. */
export function computeStageEdges(items: Artifact[]): StageEdge[] {
  return computeSameSubjectEdges(items);
}

/** Connected components over an edge set (used by the GRAPH layout + the list's
 *  GRAPH clustering). Returns arrays of answer ids, one per component. */
export function connectedComponents(
  itemIds: string[],
  edges: StageEdge[],
): string[][] {
  const adj = new Map<string, Set<string>>();
  for (const id of itemIds) adj.set(id, new Set());
  for (const e of edges) {
    adj.get(e.from)?.add(e.to);
    adj.get(e.to)?.add(e.from);
  }
  const seen = new Set<string>();
  const comps: string[][] = [];
  for (const id of itemIds) {
    if (seen.has(id)) continue;
    const comp: string[] = [];
    const stack = [id];
    while (stack.length) {
      const cur = stack.pop()!;
      if (seen.has(cur)) continue;
      seen.add(cur);
      comp.push(cur);
      for (const n of adj.get(cur) ?? []) if (!seen.has(n)) stack.push(n);
    }
    comps.push(comp);
  }
  return comps;
}
