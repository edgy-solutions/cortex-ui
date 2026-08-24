/**
 * CHARACTERIZATION of the CROSS-ANSWER EDGE MODEL (ADR-0028) and the component walk the
 * GRAPH map and the GRAPH list tab both cluster by.
 *
 * Two properties carry this file.
 *
 * The first is WHAT MAKES TWO ANSWERS THE SAME SUBJECT. The key is the resolved INSTANCE
 * ("Customer 360"), never the class ("Dashboard"). That distinction is the difference between
 * a cluster that means something and a hairball connecting every answer about a dashboard to
 * every other, and it is invisible in a fixture whose answers happen to share both. So the
 * corpus below deliberately holds two answers about the SAME class and DIFFERENT instances,
 * which must not be linked, alongside answers that share an instance, which must.
 *
 * The second is A FILED FINDING, pinned here as a GATE rather than a note.
 * `connectedComponents` seeds its adjacency from the ids it is handed, then adds whatever an
 * edge NAMES — so a stale edge pointing at a filtered-out or removed row emits a component
 * member for an artifact that does not exist. `layoutGraph` then writes a POSITION for that
 * phantom and names the cluster with `byId.get(comp[0])!`. That non-null assertion is safe
 * today only because a component always STARTS from a real id; it is one traversal-order
 * change from a TypeError. The tests below assert the phantom IS emitted and that the first
 * member IS always real, so seeding-only-from-known-ids (the fix) turns this file red and
 * the finding cannot be closed silently.
 *
 * Every derived sweep carries a POSITIVE CONTROL: a derivation that silently returns nothing
 * passes vacuously and reads as coverage while being none.
 */
import { describe, it, expect } from "vitest";
import type { Artifact, RouteDecision } from "@/api/types";
import {
  subjectInstanceKey,
  computeSameSubjectEdges,
  computeStageEdges,
  connectedComponents,
  type StageEdge,
} from "./stageEdges";

// ── Fixtures ──────────────────────────────────────────────────────────────────

const PRODUCED_FOR: Artifact["produced_for"] = {
  user_id: "alice",
  is_authenticated: true,
  entitlement_source: "none",
};

/** `classLabel` and the instance are separate knobs on purpose: the whole point of the key is
 *  that answers can agree on one and disagree on the other. */
const route = (classLabel: string, instance?: { label: string; id: string }): RouteDecision => ({
  about: {
    label: classLabel,
    uri: `urn:x:${classLabel}`,
    confidence: 0.9,
    ...(instance
      ? { instance_resolved: true, instance_identifier: instance.id, instance_label: instance.label }
      : {}),
  },
  action: {
    label: "Look up ownership",
    iri: "mesh:lookupOwnership",
    confidence: 0.9,
    classify_called: true,
    candidate_count: 1,
  },
  handled_by: { engine_name: "Engine A", provider: "engine_a_lookup_ownership" },
});

const answer = (id: string, routing: RouteDecision | null): Artifact => ({
  id,
  created_at: 1_000,
  updated_at: 1_000,
  valid_as_of: 1_000,
  valid_until: null,
  question_text: `question for ${id}`,
  summary: `summary for ${id}`,
  resolved_intent: {},
  message_id: `msg-${id}`,
  status: "complete",
  rendered_output: null,
  produced_by: { actor_type: "agent", actor_id: "engine_a_lookup_ownership" },
  produced_for: PRODUCED_FOR,
  routing,
  sources: [],
  graph_trace: [],
  graph_trace_alternates: [],
  derived_from_artifact_id: null,
  durability_status: "durable",
  watermark: 1,
});

const C360 = { label: "Customer 360", id: "urn:x:dash:c360" };
const EXEC = { label: "Exec Overview", id: "urn:x:dash:exec" };
const GOLD = { label: "Orders Gold", id: "urn:x:dataset:orders_gold" };

/**
 * Three answers about C360, one about a DIFFERENT dashboard instance (same class — the
 * hairball trap), two about a dataset instance, and one class-only answer that resolved no
 * instance at all.
 */
const CORPUS: Artifact[] = [
  answer("a1", route("Dashboard", C360)),
  answer("a2", route("Dashboard", C360)),
  answer("a3", route("Dashboard", C360)),
  answer("a4", route("Dashboard", EXEC)),
  answer("a5", route("Dataset", GOLD)),
  answer("a6", route("Dataset", GOLD)),
  answer("a7", route("Runbook")),
];
const IDS = CORPUS.map((a) => a.id);

const pair = (e: StageEdge) => [e.from, e.to].sort().join("~");
const pairs = (es: StageEdge[]) => es.map(pair).sort();

// ── subjectInstanceKey ────────────────────────────────────────────────────────

describe("subjectInstanceKey — the same-subject key is the INSTANCE, never the class", () => {
  it("returns the resolved instance identifier, not the class uri and not the instance LABEL", () => {
    // Three plausible strings sit on `about`. The class uri would link every dashboard answer
    // to every other; the friendly label is display text that two different instances can
    // share. Only the identifier is identity.
    const a = answer("x", route("Dashboard", C360));

    expect(subjectInstanceKey(a)).toBe("urn:x:dash:c360");
    expect(subjectInstanceKey(a)).not.toBe("urn:x:Dashboard");
    expect(subjectInstanceKey(a)).not.toBe("Customer 360");
  });

  it("returns EMPTY for every shape that did not resolve an instance — no key, no hairball", () => {
    // A set-level question ("how many dashboards are there") resolves a class and no instance.
    // Returning the class here, or any non-empty sentinel, would collapse unrelated answers
    // into one cluster that the user cannot explain — and `computeSameSubjectEdges` skips on
    // falsiness, so an empty string is load-bearing rather than cosmetic.
    const absences: Array<[string, Artifact]> = [
      ["pending row, no routing at all", answer("x", null)],
      ["class-only answer", answer("x", route("Runbook"))],
      ["flag set, identifier missing", answer("x", { ...route("Dashboard"), about: { label: "D", uri: "u", confidence: 1, instance_resolved: true } })],
      ["identifier present, flag false", answer("x", { ...route("Dashboard"), about: { label: "D", uri: "u", confidence: 1, instance_resolved: false, instance_identifier: "urn:x:dash:c360" } })],
      ["identifier is an empty string", answer("x", { ...route("Dashboard"), about: { label: "D", uri: "u", confidence: 1, instance_resolved: true, instance_identifier: "" } })],
    ];
    expect(absences.length).toBeGreaterThanOrEqual(5); // positive control

    for (const [why, a] of absences) expect(subjectInstanceKey(a), why).toBe("");
  });

  it("tests the resolution flag for TRUTHINESS, not for === true", () => {
    // Characterized as found, and an asymmetry worth knowing: `isUnresolved` in answerDisplay
    // is deliberately `=== true` so a JSON round-trip cannot loosen it, while this guard is a
    // bare `&&`. A projector emitting the string "false" would therefore CREATE edges here
    // that the strict check elsewhere would refuse.
    const stringy = answer("x", {
      ...route("Dashboard"),
      about: { label: "D", uri: "u", confidence: 1, instance_resolved: "false" as unknown as boolean, instance_identifier: "urn:x:dash:c360" },
    });

    expect(subjectInstanceKey(stringy)).toBe("urn:x:dash:c360");
  });
});

// ── computeStageEdges ─────────────────────────────────────────────────────────

describe("computeStageEdges — same-subject links, symmetric and instance-keyed", () => {
  it("links answers sharing an INSTANCE and refuses answers sharing only a CLASS", () => {
    // The hairball guard, stated in both directions on one corpus. a1/a2/a3 and a4 are all
    // "Dashboard" answers; only the first three are about the same dashboard. A key that
    // slipped to the class would connect all four and the assertion below would catch it as an
    // extra edge rather than as a vague "more edges than expected".
    const edges = computeStageEdges(CORPUS);

    expect(pairs(edges)).toEqual(["a1~a2", "a1~a3", "a2~a3", "a5~a6"]);
    expect(pairs(edges)).not.toContain("a1~a4");
  });

  it("emits a CLIQUE, not a chain — every pair once, never twice and never a mirror", () => {
    // Three answers about one subject must give three edges. A chain (n-1) leaves the cluster
    // fragile to one row being filtered out; emitting both directions doubles every line the
    // canvas draws and silently doubles the edge count any consumer counts on.
    const trio = CORPUS.slice(0, 3);
    const edges = computeStageEdges(trio);

    expect(edges).toHaveLength(3);
    expect(new Set(pairs(edges)).size).toBe(3);
    for (const e of edges) expect(e.from).not.toBe(e.to);
  });

  it("marks every same-subject edge UNDIRECTED — the relation is symmetric by construction", () => {
    // `directed` exists so lineage (upstream→downstream) can layer in as a second kind without
    // restructuring. A same-subject edge that claimed direction would render an arrowhead
    // asserting a causal order between two answers that merely discuss the same thing.
    const edges = computeStageEdges(CORPUS);

    expect(edges.length).toBeGreaterThan(0); // positive control
    for (const e of edges) {
      expect(e.kind).toBe("same-subject");
      expect(e.directed).toBe(false);
    }
  });

  it("never produces a LINEAGE edge — the second kind is entirely caller-supplied today", () => {
    // The union declares two kinds; this function produces one. Worth pinning because
    // GlobalCanvasStage concatenates fetched lineage edges onto this result, so anything
    // directed on the canvas came from the network, not from here. A future lineage branch
    // added inside this function would need its own characterization.
    expect(computeStageEdges(CORPUS).some((e) => e.kind === "lineage")).toBe(false);
    expect(computeStageEdges(CORPUS)).toEqual(computeSameSubjectEdges(CORPUS));
  });

  it("orders each pair by the INPUT array, so from/to carry no meaning beyond arrival order", () => {
    // Characterized as found. The caller passes the store's `artifacts` array, whose order
    // changes as rows arrive, so `from` and `to` swap between renders for the same two
    // answers. Harmless while the kind is undirected; it becomes a correctness question the
    // moment anything reads direction off an edge.
    const forward = computeStageEdges([CORPUS[0], CORPUS[1]])[0];
    const backward = computeStageEdges([CORPUS[1], CORPUS[0]])[0];

    expect([forward.from, forward.to]).toEqual(["a1", "a2"]);
    expect([backward.from, backward.to]).toEqual(["a2", "a1"]);
  });

  it("returns NO edges for degenerate corpora instead of throwing into the canvas memo", () => {
    // Each of these is a real moment: an empty stage, the first answer of a session, and a
    // stage of pending rows whose routing has not landed. This runs inside a `useMemo` on the
    // canvas, so a throw is a blank map rather than a caught error.
    expect(computeStageEdges([])).toEqual([]);
    expect(computeStageEdges([CORPUS[0]])).toEqual([]);
    expect(computeStageEdges([answer("p1", null), answer("p2", null)])).toEqual([]);
    expect(computeStageEdges([CORPUS[6]])).toEqual([]); // class-only, no instance
  });

  it("gives a DUPLICATE id sharing its own subject a SELF-EDGE", () => {
    // Characterized as found, not endorsed. `useCanvasStore` accepts a duplicate id (pinned in
    // its own tests), and the pairing is positional rather than by identity, so the same id
    // appears on both ends. The canvas then draws a line from a card to itself, and
    // `connectedComponents` absorbs it harmlessly — which is exactly why nobody would notice.
    const twin = { ...CORPUS[0], summary: "a second row, same id" };
    const edges = computeStageEdges([CORPUS[0], twin]);

    expect(edges).toEqual([{ from: "a1", to: "a1", kind: "same-subject", directed: false }]);
  });
});

// ── connectedComponents ───────────────────────────────────────────────────────

describe("connectedComponents — the clustering both GRAPH surfaces read", () => {
  it("partitions the known ids exactly once each — none lost, none duplicated", () => {
    // The map positions from these arrays and the list clusters from them. A duplicated id
    // means a card rendered twice at two positions; a lost one means an answer that is on the
    // stage and in no cluster. Positive control: the corpus must actually split, or "each id
    // once" is a statement about one big blob.
    const comps = connectedComponents(IDS, computeStageEdges(CORPUS));
    const flat = comps.flat();

    expect(comps.length).toBeGreaterThan(1);
    expect(comps.map((c) => c.length).sort()).toEqual([1, 1, 2, 3]);
    expect(flat.sort()).toEqual([...IDS].sort());
    expect(new Set(flat).size).toBe(flat.length);
  });

  it("puts exactly the transitively-linked answers together — reachability, not adjacency", () => {
    // Two answers linked only through a third must land in one component. A walk that stopped
    // at direct neighbours would split a subject's history into pieces the moment one answer
    // was the only bridge.
    const chain: StageEdge[] = [
      { from: "a1", to: "a2", kind: "same-subject", directed: false },
      { from: "a2", to: "a3", kind: "same-subject", directed: false },
    ];
    const comps = connectedComponents(["a1", "a2", "a3", "a4"], chain);

    expect(comps.map((c) => [...c].sort())).toEqual([["a1", "a2", "a3"], ["a4"]]);
  });

  it("follows an edge in BOTH directions regardless of which end it was written from", () => {
    // Adjacency is populated symmetrically, so the traversal does not depend on the input
    // ordering of `from`/`to` — which matters because that ordering is arbitrary (pinned
    // above). A one-way insert would cluster correctly or not depending on arrival order.
    const backwards: StageEdge[] = [{ from: "a3", to: "a1", kind: "same-subject", directed: false }];

    expect(connectedComponents(["a1", "a2", "a3"], backwards).map((c) => [...c].sort())).toEqual([
      ["a1", "a3"],
      ["a2"],
    ]);
  });

  it("FINDING — an edge naming an unknown id emits a component member for an artifact that does not exist", () => {
    // Filed and pinned as a GATE, not a note. Adjacency is seeded from `itemIds`, but the edge
    // loop calls `adj.get(e.from)?.add(e.to)` — so whatever an edge NAMES joins the graph. A
    // stale edge (a row filtered out of the stage, or removed mid-session while its edge
    // survived in a memo) therefore drags "ghost" into a4's component. `layoutGraph` writes a
    // POSITION for that phantom, and promotes a4 from singleton to a two-member ring drawn
    // orbiting an empty slot.
    //
    // This assertion is deliberately red-on-fix: seeding only from known ids — the correct
    // repair — removes "ghost" from the output and fails here. That is the point. Closing the
    // finding means editing this test, which means someone reads it.
    const stale: StageEdge[] = [
      ...computeStageEdges(CORPUS),
      { from: "a4", to: "ghost", kind: "same-subject", directed: false },
    ];
    const comps = connectedComponents(IDS, stale);
    const a4comp = comps.find((c) => c.includes("a4"))!;

    expect(a4comp).toEqual(["a4", "ghost"]);
    expect(comps.flat()).toContain("ghost");
    expect(IDS).not.toContain("ghost");
  });

  it("ignores an edge whose BOTH ends are unknown — nothing seeds a component from it", () => {
    // The other half of the finding, and the reason it has not crashed anything yet: the outer
    // loop iterates `itemIds` only, so a phantom is reachable only THROUGH a real id. An edge
    // between two strangers is silently dropped rather than inventing a cluster of ghosts.
    const orphaned: StageEdge[] = [{ from: "nowhere", to: "nohow", kind: "same-subject", directed: false }];
    const comps = connectedComponents(IDS, orphaned);

    expect(comps.flat().sort()).toEqual([...IDS].sort());
  });

  it("every component STARTS with a real id — the sole reason layoutGraph's non-null assertion holds", () => {
    // `layoutGraph` names each cluster with `instanceLabelOf(byId.get(comp[0])!)`. That `!` is
    // load-bearing and undefended: it is safe only because components are seeded from
    // `itemIds` and pushed with the seed first. A traversal rewrite that reordered `comp` —
    // a queue instead of a stack, a sort for stable ids, a reversal — would put a phantom at
    // index 0 and turn a stale edge into a TypeError inside the canvas render.
    const stale: StageEdge[] = [
      ...computeStageEdges(CORPUS),
      { from: "a4", to: "ghost", kind: "same-subject", directed: false },
      { from: "a7", to: "phantom", kind: "same-subject", directed: false },
    ];
    const comps = connectedComponents(IDS, stale);

    expect(comps.some((c) => c.length > 1)).toBe(true); // positive control
    for (const c of comps) expect(IDS, c.join(",")).toContain(c[0]);
  });

  it("emits each id ONCE even when itemIds repeats it — the duplicate answer has no cluster of its own", () => {
    // The store accepts duplicate ids, so this list can too. The `seen` guard collapses them,
    // which keeps the partition sound and quietly means one of the two cards is never assigned
    // to a cluster of its own — consistent with the layout, which writes one position for both.
    const comps = connectedComponents(["a1", "a1", "a2"], []);

    expect(comps).toEqual([["a1"], ["a2"]]);
  });

  it("terminates on a SELF-EDGE and on a cycle instead of spinning the render thread", () => {
    // Both shapes are reachable: the self-edge from a duplicate id (pinned above) and a cycle
    // from any three answers about one subject, since the edges are a clique. The `seen` check
    // inside the stack loop is what makes this a walk rather than a hang; nothing else guards
    // it, and a hang here freezes the canvas with no error.
    const looped: StageEdge[] = [
      { from: "a1", to: "a1", kind: "same-subject", directed: false },
      { from: "a1", to: "a2", kind: "same-subject", directed: false },
      { from: "a2", to: "a3", kind: "same-subject", directed: false },
      { from: "a3", to: "a1", kind: "same-subject", directed: false },
    ];
    const comps = connectedComponents(["a1", "a2", "a3"], looped);

    expect(comps).toHaveLength(1);
    expect([...comps[0]].sort()).toEqual(["a1", "a2", "a3"]);
  });

  it("returns one singleton per id with NO edges, and nothing at all with no ids", () => {
    // The pre-edge-computation frame the canvas renders (`edges = []` by default) must still
    // place every card, and an empty stage must not produce a phantom component.
    expect(connectedComponents(IDS, [])).toEqual(IDS.map((id) => [id]));
    expect(connectedComponents([], computeStageEdges(CORPUS))).toEqual([]);
  });

  it("is INDEPENDENT of edge order but FOLLOWS the id order it is given", () => {
    // Characterized as found. Membership is stable under any edge permutation — good, since
    // the caller concatenates fetched lineage edges onto the computed ones in whatever order
    // they arrive. Component ORDER, however, is the id order, which is the store's array
    // order: `layoutGraph` sorts by size and resolves ties by that, so an unrelated upsert
    // re-arranges the map.
    const edges = computeStageEdges(CORPUS);
    const shuffled = [...edges].reverse();

    const canonical = connectedComponents(IDS, edges).map((c) => [...c].sort().join(","));
    expect(connectedComponents(IDS, shuffled).map((c) => [...c].sort().join(",")).sort()).toEqual(
      [...canonical].sort(),
    );
    expect(connectedComponents([...IDS].reverse(), edges)[0]).toEqual(["a7"]);
    expect(connectedComponents(IDS, edges)[0]).toEqual(["a1", "a3", "a2"]);
  });
});
