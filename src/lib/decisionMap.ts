/**
 * Decision-path MAP — the pure diff model.
 *
 * The map overlays the CAPTURED decision (what the router traversed, held
 * in the artifact: routing.candidates, graph_trace, graph_trace_alternates)
 * on a BOUNDED LIVE read of the graph (/decision_subgraph), and renders
 * their DIVERGENCE. This module computes the logical model — every node's
 * STATE — with NO rendering and NO layout, so the honesty-critical part
 * (which node is solid vs ghost vs dim vs couldn't-check) is testable in
 * isolation. The SVG component consumes this and only decides positions.
 *
 * THE FOUR STATES (the feature's honesty; each must render UNAMBIGUOUSLY):
 *   matched      — captured ∩ live: traversed and still exists (on-path, solid).
 *   ghost        — captured − live: traversed but GONE now. The staleness /
 *                  defeasibility signal (spatial valid_as_of). MUST NOT look
 *                  like dim.
 *   dim          — live − captured: present now, not part of the decision.
 *   capturedOnly — the live read FAILED (available=false). We cannot verify
 *                  anything against current state, so EVERY node is
 *                  "captured, unverified" — a distinct state, never rendered
 *                  as matched (that would present historical-as-current) and
 *                  never as an empty map (that reads as "nothing diverged").
 *
 * Match key is IDENTITY (uri), strict. A renamed/re-URI'd node reads as
 * gone (ghost), never fuzzy-matched to a successor.
 */
import type {
  RouteDecision,
  GraphTraceNode,
  DecisionSubgraphResponse,
} from "@/api/types";

export type NodeState = "matched" | "ghost" | "dim" | "capturedOnly";

export interface MapSpineNode {
  uri: string;
  label: string;
  state: NodeState;
  isSubject: boolean;
}
export interface MapLoser {
  uri: string;
  label: string;
  score?: number;
  state: NodeState;
}
export interface MapVerbBranch {
  verbLabel: string;
  outputUri: string;
  outputLabel: string;
  taken: boolean; // solid vs dashed
  state: NodeState; // of the output node
}
export interface MapContextNode {
  uri: string;
  label: string;
}
export interface MapModel {
  available: boolean; // false → couldn't-check; render capturedOnly + banner
  reason: string;
  /** The vertical structural spine (ancestor_chain, subject-first). */
  spine: MapSpineNode[];
  /** Subject-leg losers — the resolver candidates not chosen (dashed). */
  losers: MapLoser[];
  /** Verb-leg branches — taken (solid) + alternates (dashed). */
  verbs: MapVerbBranch[];
  /** Live 1-hop neighbors not part of the decision (dim). */
  context: MapContextNode[];
  /** Winner's LLM confidence (the selecting signal — NOT recall). */
  winnerConfidence?: number;
}

/** The captured decision, distilled from the artifact's fields. */
export interface CapturedDecision {
  subjectUri: string;
  subjectLabel: string;
  winnerConfidence?: number;
  /** class nodes to send to /decision_subgraph (subject, ancestor, output, candidates). */
  classUris: string[];
  verbIris: string[];
  labels: Map<string, string>;
  candidates: { uri: string; label: string; score?: number }[];
  ancestorUri: string | null;
  outputUri: string | null;
  outputLabel: string | null;
  takenVerbLabel: string | null;
  alternates: { verbLabel: string; outputUri: string; outputLabel: string; score?: number }[];
}

function shortUri(uri: string): string {
  if (!uri) return "";
  const frag = uri.split(/[#/:]/).filter(Boolean).pop();
  return frag || uri;
}

// ── SPO Corridor data contract (design handoff 2a) ──────────────────────
export type CorridorNodeState = "missing" | "unverified";
export interface CorridorData {
  subject: {
    chosen: string;
    conf?: number;
    candidates: { name: string; recall?: number }[];
  };
  predicates: {
    name: string;
    score?: number;
    object: string;
    chosen?: boolean;
  }[];
  nodeStates?: Record<string, CorridorNodeState>;
  unverifiedAll?: boolean;
  /** The CALLER persona + domain this decision was computed under — the
   *  framing the SPO sentence reads inside ("acting as DATA_STEWARD, …"). */
  actingPersona?: string | null;
  actingDomains?: string[];
}

/**
 * Build the SPO-corridor input from the captured decision + the live diff.
 * The four honesty-states come from the diff: a captured node absent from
 * the live layer → "missing" (traversed, now gone); a failed live read →
 * unverifiedAll (couldn't verify anything). Chosen predicate carries its
 * real classify confidence; alternate predicate scores are not captured
 * yet (a follow-up thread — same class as the verb-leg-loser gap).
 */
export function buildCorridorData(
  routing: RouteDecision,
  graphTrace: GraphTraceNode[],
  alternates: GraphTraceNode[],
  live: DecisionSubgraphResponse,
): CorridorData {
  const captured = collectCapturedDecision(routing, graphTrace, alternates);
  const available = live.available;
  const liveSet = new Set(live.live_nodes.map((n) => n.uri));
  const nodeStates: Record<string, CorridorNodeState> = {};
  const mark = (name: string, uri: string | null | undefined) => {
    if (available && uri && !liveSet.has(uri)) nodeStates[name] = "missing";
  };

  // Exclude the WINNER from the candidate column — it's the pivot at
  // center, not a left-column loser. (Without this it renders twice and
  // the extra row overflows/clips the corridor.)
  const candidates = captured.candidates
    .filter((c) => c.uri !== captured.subjectUri)
    .map((c) => {
      mark(c.label, c.uri);
      return { name: c.label, recall: c.score };
    });

  const predicates: CorridorData["predicates"] = [];
  if (captured.outputUri) {
    mark(captured.outputLabel || shortUri(captured.outputUri), captured.outputUri);
    predicates.push({
      name: captured.takenVerbLabel || routing.action.label,
      score: routing.action.confidence,
      object: captured.outputLabel || shortUri(captured.outputUri),
      chosen: true,
    });
  }
  for (const a of captured.alternates) {
    // NO `mark()` here, deliberately. `classUris` (built in collectCapturedDecision) sends
    // the subject, its ancestor, the chosen output and the subject candidates for
    // verification — it does NOT send the alternates' output classes. So an alternate's URI
    // can never appear in `liveSet`, and marking it diffed every alternate as "missing" on a
    // perfectly healthy graph: the corridor drew the whole dashed fan as a dashed ring at
    // 55% opacity, which the on-screen legend names "traversed, now missing". The surface
    // whose pitch is "rendered from captured routing data, not synthesized" was reporting a
    // deletion it had never checked for.
    //
    // The fix narrows the CLAIM rather than widening the query. Asking the server about
    // alternates too would be the bigger change and the riskier one; not asserting a verdict
    // about something never queried is the rule this module already enforces one branch
    // above, where an unavailable live read marks nothing missing. Un-queried and unverified
    // are the same epistemic state and now render the same way: captured, not verified.
    predicates.push({ name: a.verbLabel, object: a.outputLabel, score: a.score });
  }

  return {
    subject: {
      chosen: captured.subjectLabel,
      conf: captured.winnerConfidence,
      candidates,
    },
    predicates,
    nodeStates,
    unverifiedAll: !available,
    actingPersona: routing.acting?.persona ?? null,
    actingDomains: routing.acting?.domains ?? [],
  };
}

/**
 * Distill the artifact's captured decision into the identities the map
 * needs (to send) and the overlay data (to draw). Pure over the store
 * fields.
 */
export function collectCapturedDecision(
  routing: RouteDecision,
  graphTrace: GraphTraceNode[],
  alternates: GraphTraceNode[],
): CapturedDecision {
  const labels = new Map<string, string>();
  const add = (uri?: string | null, label?: string | null) => {
    if (uri && !labels.has(uri)) labels.set(uri, label || shortUri(uri));
  };

  const subjectUri = routing.about.uri;
  add(subjectUri, routing.about.label);

  const ancestorNode = graphTrace.find((n) => n.role === "ancestor_class") ?? null;
  const outputNode = graphTrace.find((n) => n.role === "output_class") ?? null;
  add(ancestorNode?.uri, ancestorNode?.label);
  add(outputNode?.uri, outputNode?.label);

  const candidates = (routing.candidates ?? []).map((c) => {
    add(c.uri, c.label);
    return { uri: c.uri, label: c.label || shortUri(c.uri), score: c.score };
  });

  const takenVerbLabel = outputNode?.via_verb
    ? shortUri(outputNode.via_verb)
    : routing.action.label || null;

  const altBranches = alternates.map((a) => {
    add(a.uri, a.label);
    return {
      verbLabel: a.via_verb ? shortUri(a.via_verb) : a.label,
      outputUri: a.uri,
      outputLabel: a.label || shortUri(a.uri),
      score: a.score,
    };
  });

  const classUris = Array.from(
    new Set(
      [
        subjectUri,
        ancestorNode?.uri,
        outputNode?.uri,
        ...candidates.map((c) => c.uri),
      ].filter((u): u is string => !!u),
    ),
  );

  const verbIris = Array.from(
    new Set(
      [
        outputNode?.via_verb,
        ...alternates.map((a) => a.via_verb),
      ].filter((u): u is string => !!u),
    ),
  );

  return {
    subjectUri,
    subjectLabel: routing.about.label || shortUri(subjectUri),
    winnerConfidence: routing.about.confidence,
    classUris,
    verbIris,
    labels,
    candidates,
    ancestorUri: ancestorNode?.uri ?? null,
    outputUri: outputNode?.uri ?? null,
    outputLabel: outputNode?.label ?? null,
    takenVerbLabel,
    alternates: altBranches,
  };
}

/**
 * Assign the four states by diffing the captured decision against the live
 * layer. Pure — the whole reason this is separate from the SVG.
 */
export function buildMapModel(
  captured: CapturedDecision,
  live: DecisionSubgraphResponse,
): MapModel {
  const labelOf = (uri: string) => captured.labels.get(uri) || shortUri(uri);

  // COULDN'T-CHECK: the live read failed. Render the captured path only,
  // every node "capturedOnly" (unverified) — never matched (that would
  // present historical-as-current), never empty (reads as "no divergence").
  if (!live.available) {
    const spineUris = [
      captured.subjectUri,
      ...(captured.ancestorUri ? [captured.ancestorUri] : []),
    ];
    return {
      available: false,
      reason: live.reason || "current graph state unavailable",
      spine: spineUris.map((uri, i) => ({
        uri,
        label: labelOf(uri),
        state: "capturedOnly" as NodeState,
        isSubject: i === 0,
      })),
      losers: captured.candidates
        .filter((c) => c.uri !== captured.subjectUri)
        .map((c) => ({ ...c, label: labelOf(c.uri), state: "capturedOnly" as NodeState })),
      verbs: [
        ...(captured.outputUri
          ? [{
              verbLabel: captured.takenVerbLabel || "",
              outputUri: captured.outputUri,
              outputLabel: captured.outputLabel || shortUri(captured.outputUri),
              taken: true,
              state: "capturedOnly" as NodeState,
            }]
          : []),
        ...captured.alternates.map((a) => ({
          verbLabel: a.verbLabel,
          outputUri: a.outputUri,
          outputLabel: a.outputLabel,
          taken: false,
          state: "capturedOnly" as NodeState,
        })),
      ],
      context: [],
      winnerConfidence: captured.winnerConfidence,
    };
  }

  const liveSet = new Set(live.live_nodes.map((n) => n.uri));
  const stateOf = (uri: string): NodeState =>
    liveSet.has(uri) ? "matched" : "ghost";

  // Spine = the live ancestor_chain (full, subject-first). Fall back to the
  // captured subject (+ancestor) if the chain came back empty (e.g. subject
  // gone → walk returns nothing → the subject renders ghost).
  const chain = live.ancestor_chain.length
    ? live.ancestor_chain
    : [captured.subjectUri, ...(captured.ancestorUri ? [captured.ancestorUri] : [])];
  const spine: MapSpineNode[] = chain.map((uri, i) => ({
    uri,
    label: labelOf(uri),
    state: stateOf(uri),
    isSubject: i === 0,
  }));

  const spineSet = new Set(chain);

  const losers: MapLoser[] = captured.candidates
    .filter((c) => c.uri !== captured.subjectUri)
    .map((c) => ({ uri: c.uri, label: labelOf(c.uri), score: c.score, state: stateOf(c.uri) }));

  const verbs: MapVerbBranch[] = [
    ...(captured.outputUri
      ? [{
          verbLabel: captured.takenVerbLabel || "",
          outputUri: captured.outputUri,
          outputLabel: captured.outputLabel || shortUri(captured.outputUri),
          taken: true,
          state: stateOf(captured.outputUri),
        }]
      : []),
    ...captured.alternates.map((a) => ({
      verbLabel: a.verbLabel,
      outputUri: a.outputUri,
      outputLabel: a.outputLabel,
      taken: false,
      state: stateOf(a.outputUri),
    })),
  ];

  // Dim context: live neighbors NOT on the spine and NOT captured.
  const capturedSet = new Set(captured.classUris);
  const context: MapContextNode[] = live.context_nodes
    .filter((n) => !spineSet.has(n.uri) && !capturedSet.has(n.uri))
    .map((n) => ({ uri: n.uri, label: labelOf(n.uri) }));

  return {
    available: true,
    reason: "",
    spine,
    losers,
    verbs,
    context,
    winnerConfidence: captured.winnerConfidence,
  };
}
