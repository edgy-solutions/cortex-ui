/**
 * CHARACTERIZATION of the DECISION-PATH MAP model — the corridor an executive reads as
 * "here is the path the router actually took, and here is what it considered and rejected".
 *
 * One claim dominates this file, and it is the claim the module's own header makes:
 * NEVER SYNTHESIZE. Every node, every predicate, every score in the corridor must come from
 * a CAPTURED field on `routing` / `graph_trace` / `graph_trace_alternates`. A synthesized
 * decision path's defect is that it is PLAUSIBLE — a routing decision carries a subject
 * label, a verb label, a verb IRI and two confidences, which is everything a composer needs
 * to emit "Dashboard ─ Look up ownership ▸ Owner" with a number beside it, and no happy-path
 * test can tell that apart from the real thing. So the seal here is the ABSENT case: a
 * fixture deliberately loaded with all the raw material, a `graph_trace` that is empty, and
 * assertions that the verb string does not appear ANYWHERE in the result.
 *
 * The seal has a live hazard behind it, pinned twice below. `takenVerbLabel` DOES fall back
 * to `routing.action.label` when no captured verb edge exists — a composed verb name sitting
 * ready in the distillation. It never reaches the screen only because `buildCorridorData`
 * pushes the predicate row inside `if (captured.outputUri)`. Both halves are pinned, so
 * moving that push outside the guard turns this file red instead of turning the demo into
 * theater.
 *
 * The second theme is THE CONTEST. "The system considered alternatives and rejected them" is
 * the beat, so the losers must survive with their REAL recall values: verbatim, in captured
 * order, `undefined` left as `undefined` (a `?? 0` would render a fabricated 0.00 measurement
 * chip), the winner excluded exactly once, and nothing invented when the pool is absent.
 *
 * The third is THE STATE VOCABULARY. "couldn't verify" (`unverifiedAll` / `capturedOnly`)
 * must never be promoted to a verified state, and each state must come from its own captured
 * condition rather than from a default. Both vocabularies are swept from the unions declared
 * in the module source, and each sweep carries a POSITIVE CONTROL — a derivation that
 * silently matched nothing would pass over zero cases and read as coverage.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it, expect } from "vitest";
import type {
  RouteDecision,
  GraphTraceNode,
  DecisionSubgraphResponse,
} from "@/api/types";
import {
  buildCorridorData,
  collectCapturedDecision,
  buildMapModel,
  type NodeState,
  type CorridorNodeState,
} from "./decisionMap";

// ── Fixtures ──────────────────────────────────────────────────────────────────

/**
 * A fully-loaded routing decision: a subject with a label AND an instance label, a verb with
 * a label AND an IRI, two DISTINCT confidences, a scored candidate pool and an acting
 * persona. Every string here is raw material a synthesizer would reach for, so the
 * never-synthesize assertions check for them BY NAME. The two confidences differ (0.91 vs
 * 0.88) so a swap between "which candidate won" and "how sure the verb was" is visible.
 *
 * The candidate pool is deliberately NOT in score order — 0.94, then 0.17, then 0.62 — so
 * "preserved verbatim" and "silently re-ranked" cannot both pass.
 */
const ROUTING: RouteDecision = {
  about: {
    label: "Dashboard",
    uri: "urn:x:Dashboard",
    confidence: 0.91,
    instance_resolved: true,
    instance_identifier: "urn:x:dash:c360",
    instance_label: "Customer 360",
  },
  action: {
    label: "Look up ownership",
    iri: "mesh:lookupOwnership",
    confidence: 0.88,
    classify_called: true,
    candidate_count: 3,
  },
  handled_by: { engine_name: "Engine A", provider: "engine_a_lookup_ownership" },
  candidates: [
    { uri: "urn:x:Dashboard", label: "Dashboard", score: 0.94 }, // the winner
    { uri: "urn:x:Datamart", label: "Datamart", score: 0.17 },
    { uri: "urn:x:Report", label: "Report", score: 0.62 },
  ],
  acting: { persona: "DATA_STEWARD", domains: ["FINANCE", "RISK"] },
};

/** The captured walk: subject → ancestor → output, reached over a real verb edge. The
 *  `resolved_subject` node carries a DIFFERENT uri from routing.about on purpose — the
 *  distillation is characterized below as ignoring it entirely. */
const TRACE: GraphTraceNode[] = [
  { uri: "urn:x:NotTheSubject", label: "Trace Subject", role: "resolved_subject", hops: 0 },
  { uri: "urn:x:Asset", label: "Asset", role: "ancestor_class", hops: 2 },
  { uri: "urn:x:Team", label: "Owning Team", role: "output_class", via_verb: "mesh:lookupOwnership" },
];

const ALTS: GraphTraceNode[] = [
  { uri: "urn:x:Steward", label: "Data Steward", role: "alternate_verb", via_verb: "mesh:findSteward", score: 0.31 },
  { uri: "urn:x:Runbook", label: "Runbook", role: "alternate_verb", via_verb: "mesh:retrieveKnowledge", score: 0.08 },
];

/** Live layer: Dashboard / Asset / Team / Report exist; Datamart, Steward and Runbook are
 *  GONE, so the diff has something on both sides. Glossary is a live neighbour that was
 *  never part of the decision — the only source of a `dim` node. */
const live = (o: Partial<DecisionSubgraphResponse> = {}): DecisionSubgraphResponse => ({
  available: true,
  reason: "",
  live_nodes: [
    { uri: "urn:x:Dashboard" },
    { uri: "urn:x:Asset" },
    { uri: "urn:x:Team" },
    { uri: "urn:x:Report" },
  ],
  live_edges: [],
  context_nodes: [{ uri: "urn:x:Glossary" }],
  ancestor_chain: ["urn:x:Dashboard", "urn:x:Asset"],
  ...o,
});

const DOWN: DecisionSubgraphResponse = {
  available: false,
  reason: "neo4j read timed out",
  live_nodes: [],
  live_edges: [],
  context_nodes: [],
  ancestor_chain: [],
};

/** The strings a composer would reach for. None of them may appear in a result built from a
 *  decision whose walk was never captured. */
const SYNTHESIZER_BAIT = [
  "Look up ownership",
  "lookupOwnership",
  "mesh:lookupOwnership",
  "Customer 360",
  "Owning Team",
];

// ── The declared vocabularies, read from the source rather than hand-listed ────

const MODULE_SRC = readFileSync(path.join(__dirname, "decisionMap.ts"), "utf8");
const declaredUnion = (name: string) => {
  const block = MODULE_SRC.match(new RegExp(`export type ${name}\\s*=([^;]*);`))?.[1] ?? "";
  return [...block.matchAll(/"([A-Za-z0-9_]+)"/g)].map((m) => m[1]);
};
const DECLARED_NODE_STATES = declaredUnion("NodeState") as NodeState[];
const DECLARED_CORRIDOR_STATES = declaredUnion("CorridorNodeState") as CorridorNodeState[];

describe("decisionMap — the state vocabularies under sweep", () => {
  it("both honesty vocabularies are read from the module's own unions — positive control", () => {
    // The sweeps below assert that every declared state is reachable and that no state
    // outside the union is emitted. A regex that matched nothing would satisfy both by
    // iterating an empty list, which reads as coverage and is none.
    expect(DECLARED_NODE_STATES).toEqual(["matched", "ghost", "dim", "capturedOnly"]);
    expect(DECLARED_CORRIDOR_STATES).toEqual(["missing", "unverified"]);
  });
});

// ── NEVER SYNTHESIZE ──────────────────────────────────────────────────────────

describe("buildCorridorData — the corridor renders CAPTURED routing, never a composed path", () => {
  it("emits NO predicate when the walk was never captured, though routing holds a verb, an IRI and a confidence", () => {
    // The seal, and the assertion the whole feature rests on. `routing` here carries
    // everything needed to compose "Customer 360 ─ Look up ownership ▸ Owner (0.88)"; the
    // graph trace is empty, so the system never actually walked to an output class. A
    // composer would still produce a confident-looking corridor. `toBeTruthy` or a
    // length check cannot see that — the absence of the verb STRING anywhere in the result
    // is what refuses it.
    const data = buildCorridorData(ROUTING, [], [], live());

    expect(data.predicates).toEqual([]);
    const serialized = JSON.stringify(data);
    for (const bait of SYNTHESIZER_BAIT) {
      expect(serialized, bait).not.toContain(bait);
    }
  });

  it("the composed-verb fallback exists in the distillation and is INERT — the output-uri guard is what disarms it", () => {
    // The hazard behind the seal, pinned as found so it cannot move quietly.
    // `collectCapturedDecision` falls back to `routing.action.label` for `takenVerbLabel`
    // when no captured verb edge exists, so a composed verb name is sitting ready. It reaches
    // no screen only because the predicate row is pushed inside `if (captured.outputUri)`.
    // Moving that push outside the guard — or giving `outputUri` a fallback — turns a
    // never-walked decision into a rendered path, and turns the test above red.
    const captured = collectCapturedDecision(ROUTING, [], []);

    expect(captured.takenVerbLabel).toBe("Look up ownership"); // composed, not captured
    expect(captured.outputUri).toBeNull();
    expect(captured.outputLabel).toBeNull();
    expect(buildCorridorData(ROUTING, [], [], live()).predicates).toEqual([]);
  });

  it("names the chosen predicate from the CAPTURED verb edge, not from routing's prettier label", () => {
    // The two disagree by construction: the trace edge is `mesh:lookupOwnership` (shortened
    // to "lookupOwnership") while routing's display label is "Look up ownership". The
    // corridor shows what the walk traversed. Reading the label instead would look better and
    // would be a different fact — the substrate edge is the evidence, the label is copy.
    const data = buildCorridorData(ROUTING, TRACE, [], live());

    expect(data.predicates[0].name).toBe("lookupOwnership");
    expect(data.predicates[0].name).not.toBe(ROUTING.action.label);
    expect(data.predicates[0].object).toBe("Owning Team");
    expect(data.predicates[0].chosen).toBe(true);
  });

  it("falls to routing.action.label ONLY when a real output class was captured without a verb edge", () => {
    // Characterized as found. The fallback is defensible here — an output class WAS
    // traversed, only the edge name is missing — and it is the same expression that is
    // dangerous in the no-trace case above. Pinned so the two situations stay distinguishable.
    const noVerbEdge: GraphTraceNode[] = [
      { uri: "urn:x:Team", label: "Owning Team", role: "output_class" },
    ];
    const data = buildCorridorData(ROUTING, noVerbEdge, [], live());

    expect(data.predicates[0].name).toBe("Look up ownership");
  });

  it("invents no alternates and no candidates when neither was captured", () => {
    // A corridor with one lonely spine is the honest picture of a decision that evaluated
    // nothing. Padding it with the class hierarchy, or re-using the trace nodes as
    // pseudo-candidates, would manufacture a contest that never happened.
    const bare: RouteDecision = { ...ROUTING, candidates: undefined };
    const data = buildCorridorData(bare, TRACE, [], live());

    expect(data.subject.candidates).toEqual([]);
    expect(data.predicates.filter((p) => !p.chosen)).toEqual([]);
    expect(data.predicates).toHaveLength(1);
  });

  it("carries the ACTING persona as captured, and null/empty when the decision recorded none", () => {
    // The corridor's top bar reads "acting as DATA_STEWARD / FINANCE, RISK". That is a claim
    // about whose authority the decision was computed under; defaulting it to the answerer's
    // persona, or to any standing value, would attribute a routing choice to a caller who
    // never made it.
    expect(buildCorridorData(ROUTING, TRACE, ALTS, live()).actingPersona).toBe("DATA_STEWARD");
    expect(buildCorridorData(ROUTING, TRACE, ALTS, live()).actingDomains).toEqual(["FINANCE", "RISK"]);

    const anon = buildCorridorData({ ...ROUTING, acting: undefined }, TRACE, ALTS, live());
    expect(anon.actingPersona).toBeNull();
    expect(anon.actingDomains).toEqual([]);
  });
});

// ── THE CONTEST: candidates not chosen ────────────────────────────────────────

describe("buildCorridorData — the rejected candidates survive with their real recall", () => {
  it("keeps every loser with its captured score, in CAPTURED order, and drops only the winner", () => {
    // The demo beat: "it considered these and rejected them". Three things can quietly break
    // it — a loser dropped, a score replaced, or the pool re-sorted so the displayed order
    // stops being the order the resolver reported. The fixture pool is unsorted (0.94, 0.17,
    // 0.62) precisely so a hidden re-rank cannot pass as "preserved".
    const data = buildCorridorData(ROUTING, TRACE, ALTS, live());

    expect(data.subject.candidates).toEqual([
      { name: "Datamart", recall: 0.17 },
      { name: "Report", recall: 0.62 },
    ]);
    expect(data.subject.chosen).toBe("Dashboard");
  });

  it("the winner is excluded by URI IDENTITY once — not by label, and not by position", () => {
    // The winner is the pivot at centre; leaving it in the left column renders it twice and
    // overflows the corridor. Excluding it by LABEL instead would silently delete a genuine
    // namesake loser, and excluding by position would delete whichever candidate happened to
    // sort first. Here a second candidate wears the winner's label under a different uri and
    // must survive.
    const namesake: RouteDecision = {
      ...ROUTING,
      candidates: [
        { uri: "urn:x:Dashboard", label: "Dashboard", score: 0.94 },
        { uri: "urn:y:Dashboard", label: "Dashboard", score: 0.55 },
      ],
    };
    const data = buildCorridorData(namesake, TRACE, [], live());

    expect(data.subject.candidates).toEqual([{ name: "Dashboard", recall: 0.55 }]);
  });

  it("leaves an UNSCORED candidate's recall undefined — never 0, which would be a measurement", () => {
    // A `?? 0` here would put a "0.00" recall chip on a candidate the resolver never scored:
    // a fabricated number, and the worst kind, because it reads as a confident finding of
    // irrelevance. `0` itself must also survive as `0` — the two are different facts.
    const mixed: RouteDecision = {
      ...ROUTING,
      candidates: [
        { uri: "urn:x:Dashboard", label: "Dashboard", score: 0.94 },
        { uri: "urn:x:Unscored", label: "Unscored" },
        { uri: "urn:x:Zero", label: "Zeroed", score: 0 },
      ],
    };
    const data = buildCorridorData(mixed, TRACE, [], live());

    expect(data.subject.candidates[0]).toEqual({ name: "Unscored", recall: undefined });
    expect(data.subject.candidates[0].recall).toBeUndefined();
    expect(data.subject.candidates[1]).toEqual({ name: "Zeroed", recall: 0 });
  });

  it("labels a candidate from its URI when the pool captured no label — never a blank chip", () => {
    // An unlabelled candidate is a real projector shape. A blank chip on the map is an
    // unreadable rejection; the uri fragment is the honest minimum and is still captured data.
    const unlabelled: RouteDecision = {
      ...ROUTING,
      candidates: [{ uri: "urn:x:Dashboard", score: 0.9 }, { uri: "urn:x:Lakehouse", score: 0.4 }],
    };
    const data = buildCorridorData(unlabelled, TRACE, [], live());

    expect(data.subject.candidates).toEqual([{ name: "Lakehouse", recall: 0.4 }]);
  });

  it("the subject's confidence is the RESOLVE confidence, never the verb's and never a recall", () => {
    // Three plausible numbers sit on this decision: 0.91 (how sure the resolver was of the
    // subject), 0.88 (how sure classify was of the verb) and 0.94 (the winner's recall). The
    // corridor's subject chip claims the first. Reading either of the others is invisible in
    // a screenshot and is a different sentence about the system's certainty.
    const data = buildCorridorData(ROUTING, TRACE, ALTS, live());

    expect(data.subject.conf).toBe(0.91);
    expect(data.predicates[0].score).toBe(0.88);
    expect(data.subject.conf).not.toBe(ROUTING.action.confidence);
  });

  it("alternate predicates keep their captured semantic score and their own verb edge", () => {
    // The dashed fan is "verbs the compat-walk surfaced and classify passed over". Its scores
    // are what makes it a ranking rather than anonymous decoration; SpoCorridor folds rows
    // below 0.1 by score, so losing the number silently changes WHICH alternates are visible.
    const data = buildCorridorData(ROUTING, TRACE, ALTS, live());
    const alts = data.predicates.filter((p) => !p.chosen);

    expect(alts).toEqual([
      { name: "findSteward", object: "Data Steward", score: 0.31 },
      { name: "retrieveKnowledge", object: "Runbook", score: 0.08 },
    ]);
  });

  it("an alternate with no verb edge shows its OBJECT's label as the predicate name", () => {
    // Characterized as found, not endorsed. `verbLabel` falls back to the node's own label,
    // so the corridor reads "Data Steward ▸ Data Steward" — the same word on the line and on
    // the box. Harmless-looking, and it is the shape that would make a reader believe a verb
    // named "Data Steward" exists in the ontology.
    const noEdge: GraphTraceNode[] = [
      { uri: "urn:x:Steward", label: "Data Steward", role: "alternate_verb", score: 0.31 },
    ];
    const data = buildCorridorData(ROUTING, TRACE, noEdge, live());
    const alt = data.predicates.find((p) => !p.chosen)!;

    expect(alt.name).toBe("Data Steward");
    expect(alt.object).toBe("Data Steward");
  });
});

// ── THE STATE VOCABULARY: couldn't-verify is never promoted ───────────────────

describe("buildCorridorData — the honesty states come from distinct captured conditions", () => {
  it("marks ONLY the captured nodes the live read says are gone, and marks nothing that is present", () => {
    // "missing" is the staleness signal: traversed then, absent now. It has to be earned by a
    // live read that came back and did not contain the node. The absence of a key is the
    // verified-present state — so a mark that fired for everything, or for nothing, would
    // both look like a working map.
    const data = buildCorridorData(ROUTING, TRACE, ALTS, live());

    expect(data.nodeStates).toEqual({
      Datamart: "missing",
      "Data Steward": "missing",
      Runbook: "missing",
    });
    expect(data.nodeStates).not.toHaveProperty("Report"); // live → verified present
    expect(data.nodeStates).not.toHaveProperty("Owning Team");
    expect(data.unverifiedAll).toBe(false);
  });

  it("a FAILED live read marks nothing missing — couldn't-verify is never promoted to a verdict", () => {
    // The load-bearing half of the state vocabulary. With `available: false` the live node set
    // is empty, so a diff that forgot to check availability would declare EVERY captured node
    // gone — presenting a total outage as a total graph deletion. `unverifiedAll` is the only
    // thing said, and `nodeStates` stays empty so no node carries a second, contradicting
    // state underneath it.
    const data = buildCorridorData(ROUTING, TRACE, ALTS, DOWN);

    expect(data.unverifiedAll).toBe(true);
    expect(data.nodeStates).toEqual({});
    // The captured decision is still fully drawn — an empty corridor reads as "nothing diverged".
    expect(data.subject.chosen).toBe("Dashboard");
    expect(data.subject.candidates).toHaveLength(2);
    expect(data.predicates).toHaveLength(3);
  });

  it("every declared corridor state is reachable, and no third state is ever emitted", () => {
    // Swept from the declared union so a state added to the type without a condition to
    // produce it fails here rather than becoming a rendering branch nobody can trigger.
    // Positive control: both scenarios must actually produce states.
    const verified = buildCorridorData(ROUTING, TRACE, ALTS, live());
    const unverified = buildCorridorData(ROUTING, TRACE, ALTS, DOWN);
    const emitted = new Set<string>(Object.values(verified.nodeStates ?? {}));
    if (unverified.unverifiedAll) emitted.add("unverified");

    expect(emitted.size).toBeGreaterThan(1); // positive control
    expect([...emitted].sort()).toEqual([...DECLARED_CORRIDOR_STATES].sort());
  });

  it("never calls a node missing when it had no URI to look up — absent identity is not absent node", () => {
    // Added after a red-proof found this guard weak. `mark` skips on a falsy uri, so a
    // captured node with no identity is left unstated. Dropping that check makes
    // `liveSet.has("")` return false and paints the node "missing" — a deletion claim
    // manufactured from a projection gap, on a node that may be perfectly present. It reaches
    // the screen because SpoCorridor keys off the LABEL, which such a node still has.
    const idless: RouteDecision = {
      ...ROUTING,
      candidates: [
        { uri: "urn:x:Dashboard", label: "Dashboard", score: 0.94 },
        { uri: "", label: "Unidentified Candidate", score: 0.3 },
      ],
    };
    const altIdless: GraphTraceNode[] = [
      { uri: "", label: "Unidentified Branch", role: "alternate_verb", via_verb: "mesh:x", score: 0.2 },
    ];
    const data = buildCorridorData(idless, TRACE, altIdless, live());

    expect(data.nodeStates).not.toHaveProperty("Unidentified Candidate");
    expect(data.nodeStates).not.toHaveProperty("Unidentified Branch");
    // ...and both still render, with their captured scores — unstated, not dropped.
    expect(data.subject.candidates).toContainEqual({ name: "Unidentified Candidate", recall: 0.3 });
  });

  it("keys nodeStates by DISPLAY NAME, so two nodes sharing a label share a verdict", () => {
    // FINDING, characterized as found. `mark(name, uri)` records the state under the LABEL,
    // while the diff is computed on the URI. A rejected candidate called "Owning Team" that is
    // gone therefore paints the LIVE output class of the same name as "missing" — a present
    // node rendered as deleted, on the surface whose entire job is telling those apart.
    // SpoCorridor's `stateOf(name)` reads this map by name, so the collision reaches the screen.
    const collide: RouteDecision = {
      ...ROUTING,
      candidates: [
        { uri: "urn:x:Dashboard", label: "Dashboard", score: 0.94 },
        { uri: "urn:x:GoneTeam", label: "Owning Team", score: 0.2 },
      ],
    };
    const data = buildCorridorData(collide, TRACE, [], live());

    expect(data.nodeStates!["Owning Team"]).toBe("missing");
    expect(live().live_nodes.map((n) => n.uri)).toContain("urn:x:Team"); // the object IS live
    expect(data.predicates[0].object).toBe("Owning Team"); // ...and renders as gone
  });
});

// ── The distillation ──────────────────────────────────────────────────────────

describe("collectCapturedDecision — what the map asks the live graph about", () => {
  it("takes the subject from ROUTING, ignoring a trace node that claims to be the resolved subject", () => {
    // Characterized as found. The walk's `resolved_subject` role is never read; the subject is
    // `routing.about.uri`. That makes routing the single source of the pivot — but it also
    // means a trace whose subject disagrees is never queried and never diffed, so a
    // divergence between the two captures is invisible rather than reported.
    const captured = collectCapturedDecision(ROUTING, TRACE, ALTS);

    expect(captured.subjectUri).toBe("urn:x:Dashboard");
    expect(captured.classUris).not.toContain("urn:x:NotTheSubject");
    expect(captured.labels.has("urn:x:NotTheSubject")).toBe(false);
  });

  it("sends subject, ancestor, output and every candidate to the live read, de-duplicated", () => {
    // These uris ARE the /decision_subgraph request. A uri missing here is a node the live
    // layer is never asked about, which then diffs as "gone" for the rest of the session — a
    // staleness claim manufactured by an under-specified query, not by the graph.
    const captured = collectCapturedDecision(ROUTING, TRACE, ALTS);

    expect(captured.classUris).toEqual([
      "urn:x:Dashboard",
      "urn:x:Asset",
      "urn:x:Team",
      "urn:x:Datamart",
      "urn:x:Report",
    ]);
    expect(captured.verbIris).toEqual([
      "mesh:lookupOwnership",
      "mesh:findSteward",
      "mesh:retrieveKnowledge",
    ]);
  });

  it("does NOT send the alternates' output classes for verification", () => {
    // Characterized as found. `classUris` covers the chosen path and the subject candidates;
    // the alternate branch TARGETS (Steward, Runbook) are absent from the request while
    // `buildCorridorData` still diffs them against the response. They are therefore marked
    // "missing" unconditionally — the dashed fan reads as "every alternative has since been
    // deleted" on a perfectly healthy graph. This is why the fixture's alternates come back
    // missing above.
    const captured = collectCapturedDecision(ROUTING, TRACE, ALTS);

    expect(captured.classUris).not.toContain("urn:x:Steward");
    expect(captured.classUris).not.toContain("urn:x:Runbook");
    expect(buildCorridorData(ROUTING, TRACE, ALTS, live()).nodeStates).toMatchObject({
      "Data Steward": "missing",
      Runbook: "missing",
    });
  });

  it("degrades every label to its URI fragment rather than to an empty string", () => {
    // Labels feed both the corridor text and the map spine. An empty one renders a nameless
    // box that cannot be pointed at in a demo; the fragment is short, ugly and true.
    const thin: RouteDecision = {
      ...ROUTING,
      about: { label: "", uri: "urn:x:ns#Dashboard", confidence: 0.5 },
      candidates: [{ uri: "urn:x:Lakehouse" }],
    };
    const captured = collectCapturedDecision(thin, [{ uri: "urn:x:Team", label: "", role: "output_class" }], []);

    expect(captured.subjectLabel).toBe("Dashboard");
    expect(captured.candidates[0].label).toBe("Lakehouse");
    expect(captured.labels.get("urn:x:Team")).toBe("Team");
  });

  it("survives a completely empty capture instead of throwing into the map render", () => {
    // The pending shape: routing arrived, the walk did not. This runs inside a DecisionMap
    // effect, so a throw here is a blank HUD panel with no error surface.
    const empty: RouteDecision = {
      about: { label: "", uri: "", confidence: 0 },
      action: { label: "", iri: "", confidence: 0, classify_called: false, candidate_count: 0 },
      handled_by: { engine_name: "", provider: "" },
    };
    const captured = collectCapturedDecision(empty, [], []);

    expect(captured.classUris).toEqual([]);
    expect(captured.verbIris).toEqual([]);
    expect(captured.takenVerbLabel).toBeNull();
    expect(() => buildCorridorData(empty, [], [], DOWN)).not.toThrow();
  });
});

// ── buildMapModel: the four-state diff ────────────────────────────────────────

describe("buildMapModel — the four states, each earned by its own condition", () => {
  it("every declared NodeState is reachable and none is a default — positive control", () => {
    // The four states are the feature's honesty. If any one of them were unreachable, the
    // renderer would carry a branch nobody can trigger; if any were the default, a node would
    // fall into it by omission rather than by evidence. Swept from the declared union, so a
    // fifth state added to the type without a condition fails here.
    //
    // `dim` is the one state carried STRUCTURALLY rather than in a field — `MapContextNode`
    // has no `state`, membership in `context` IS the state — so it is folded in from there.
    // That asymmetry is itself worth knowing: the renderer must remember it.
    const up = buildMapModel(collectCapturedDecision(ROUTING, TRACE, ALTS), live());
    const down = buildMapModel(collectCapturedDecision(ROUTING, TRACE, ALTS), DOWN);
    const states = (m: ReturnType<typeof buildMapModel>) => [
      ...m.spine.map((n) => n.state),
      ...m.losers.map((n) => n.state),
      ...m.verbs.map((n) => n.state),
      ...m.context.map(() => "dim" as NodeState),
    ];
    const seen = new Set<NodeState>([...states(up), ...states(down)]);

    expect(states(up).length).toBeGreaterThan(3); // positive control: something was classified
    expect(states(down).length).toBeGreaterThan(3);
    expect([...seen].sort()).toEqual([...DECLARED_NODE_STATES].sort());
    // The two conditions are disjoint: a reachable live layer never yields capturedOnly, and
    // an unreachable one never yields a verified verdict.
    expect(states(up)).not.toContain("capturedOnly");
    expect(states(down)).toEqual(states(down).map(() => "capturedOnly"));
  });

  it("matched vs ghost is decided by strict URI identity — a re-URI'd node reads GONE, never fuzzy-matched", () => {
    // The staleness signal only means something if it cannot be talked out of. A node that
    // was renamed keeps its label and changes its identity; matching on the label would
    // silently present a DIFFERENT node as the one the router traversed.
    const renamed = live({
      live_nodes: [{ uri: "urn:x:Dashboard" }, { uri: "urn:x:v2:Asset" }],
      ancestor_chain: ["urn:x:Dashboard", "urn:x:Asset"],
    });
    const m = buildMapModel(collectCapturedDecision(ROUTING, TRACE, ALTS), renamed);

    expect(m.spine.map((n) => [n.uri, n.state])).toEqual([
      ["urn:x:Dashboard", "matched"],
      ["urn:x:Asset", "ghost"],
    ]);
  });

  it("dim is live-minus-captured — a context node that was part of the decision is never dimmed", () => {
    // `dim` says "present now, not part of this decision". Including a captured node there
    // would demote a traversed node to background; excluding a genuine neighbour hides the
    // surrounding graph the divergence is read against.
    const withOverlap = live({
      context_nodes: [{ uri: "urn:x:Glossary" }, { uri: "urn:x:Report" }, { uri: "urn:x:Asset" }],
    });
    const m = buildMapModel(collectCapturedDecision(ROUTING, TRACE, ALTS), withOverlap);

    expect(m.context.map((n) => n.uri)).toEqual(["urn:x:Glossary"]); // Report captured, Asset on spine
  });

  it("a FAILED live read renders the captured path unverified, never matched and never empty", () => {
    // Two failure modes, both worse than a banner: rendering historical nodes as `matched`
    // presents the past as the present, and rendering nothing reads as "we checked and
    // nothing diverged". The reason string is passed through so the banner can say what broke.
    const m = buildMapModel(collectCapturedDecision(ROUTING, TRACE, ALTS), DOWN);

    expect(m.available).toBe(false);
    expect(m.reason).toBe("neo4j read timed out");
    expect(m.spine.map((n) => [n.uri, n.state])).toEqual([
      ["urn:x:Dashboard", "capturedOnly"],
      ["urn:x:Asset", "capturedOnly"],
    ]);
    expect(m.losers.map((n) => n.state)).toEqual(["capturedOnly", "capturedOnly"]);
    expect(m.verbs.map((n) => n.state)).toEqual(["capturedOnly", "capturedOnly", "capturedOnly"]);
    expect(m.context).toEqual([]); // nothing live was read, so nothing may be claimed as context
    expect(m.winnerConfidence).toBe(0.91);
  });

  it("supplies its own reason when the failed read gave none — the banner never renders blank", () => {
    // `reason` is optional on the response and required on the model. A blank banner is an
    // unexplained empty map, which is the state most likely to be read as "no divergence".
    const m = buildMapModel(collectCapturedDecision(ROUTING, TRACE, ALTS), { ...DOWN, reason: "" });

    expect(m.reason).toBe("current graph state unavailable");
  });

  it("falls back to the captured spine when the live ancestor chain came back empty", () => {
    // A subject deleted from the graph makes the walk return nothing. Without the fallback the
    // spine is empty and the map loses its subject entirely; with it, the subject renders as a
    // ghost — which is the actual news.
    const m = buildMapModel(
      collectCapturedDecision(ROUTING, TRACE, ALTS),
      live({ live_nodes: [], ancestor_chain: [] }),
    );

    expect(m.spine.map((n) => [n.uri, n.state, n.isSubject])).toEqual([
      ["urn:x:Dashboard", "ghost", true],
      ["urn:x:Asset", "ghost", false],
    ]);
  });

  it("marks only the FIRST spine node as the subject, in both the live and the failed branch", () => {
    // The subject is the pivot the corridor reads outward from. Two subjects, or none, makes
    // the sentence unreadable; the flag is positional, so a chain reordered upstream moves it
    // without anything throwing.
    for (const [why, m] of [
      ["live", buildMapModel(collectCapturedDecision(ROUTING, TRACE, ALTS), live())],
      ["failed", buildMapModel(collectCapturedDecision(ROUTING, TRACE, ALTS), DOWN)],
    ] as const) {
      expect(m.spine.filter((n) => n.isSubject).map((n) => n.uri), why).toEqual(["urn:x:Dashboard"]);
    }
  });

  it("keeps the chosen verb branch flagged TAKEN and every alternate NOT taken", () => {
    // Solid vs dashed on the canvas. A branch flagged taken is the claim "this is the path the
    // router followed"; flipping it makes an alternative the system rejected look like the
    // decision it made.
    const m = buildMapModel(collectCapturedDecision(ROUTING, TRACE, ALTS), live());

    expect(m.verbs.map((v) => [v.verbLabel, v.taken, v.state])).toEqual([
      ["lookupOwnership", true, "matched"],
      ["findSteward", false, "ghost"],
      ["retrieveKnowledge", false, "ghost"],
    ]);
  });

  it("preserves the losers' captured scores through the diff, unchanged by the live layer", () => {
    // The live read decides a loser's STATE, never its recall. A diff that recomputed or
    // dropped the score would erase the evidence that the alternative was evaluated at all —
    // leaving a node that merely looks unrelated to the decision.
    const m = buildMapModel(collectCapturedDecision(ROUTING, TRACE, ALTS), live());

    expect(m.losers).toEqual([
      { uri: "urn:x:Datamart", label: "Datamart", score: 0.17, state: "ghost" },
      { uri: "urn:x:Report", label: "Report", score: 0.62, state: "matched" },
    ]);
  });
});
