// ── Stream Event Protocol (SSE) ─────────────────────────────────
export {
  SemanticArchetype,
  SeverityLevel,
  ChartType,
  MoodType,
} from '@platform/iagent-contracts';

// The fallback_reason vocabulary + presentation lives in lib/routing so
// the decision-path visualizer has one source of truth for the enum.
import type { FallbackReason } from '@/lib/routing';

import type {
  DashboardUI,
  TopologyUI,
  HazardUI,
  MetricUI,
  DocumentUI,
  ChartUI,
  DigitalTwinUI,
  UIEntity,
  UIRelation,
  AnomalyNode
} from '@platform/iagent-contracts';

export type {
  DashboardUI,
  TopologyUI,
  HazardUI,
  MetricUI,
  DocumentUI,
  ChartUI,
  DigitalTwinUI,
  UIEntity,
  UIRelation,
  AnomalyNode
};

export type SemanticUIContainer = TopologyUI | HazardUI | MetricUI | DocumentUI | ChartUI | DigitalTwinUI;

/**
 * Pipeline stage IDs — the 5 stable kinds the routing substrate produces.
 * These are NOT synthesized; each one corresponds to a real pipeline call
 * (/plan, /resolve, /find_compatible_verbs, /classify_predicate, engine
 * dispatch, final composition). The architect's governing rule for the
 * grounding panel: surface what the pipeline did, never invent a narrative.
 *
 * Used as the stable identity for upsert-by-kind in the thinking-step
 * store dispatch — fixes the "Agent reasoning time 10s/20s/30s" duplicate
 * accumulation bug where each heartbeat appended a new step instead of
 * updating the existing one.
 */
export type PipelineStageKind =
  | "understanding"   // /plan: extract concepts, persona
  | "locating"        // /resolve: subject class resolution
  | "choosing_action" // /find_compatible_verbs + /classify_predicate
  | "retrieving"      // engine dispatch (Engine W/E/A/etc.)
  | "composing";      // final answer composition

export const PIPELINE_STAGES: readonly {
  kind: PipelineStageKind;
  label: string;
}[] = [
  { kind: "understanding",   label: "Understanding your question" },
  { kind: "locating",        label: "Locating the subject" },
  { kind: "choosing_action", label: "Choosing how to answer" },
  { kind: "retrieving",      label: "Retrieving evidence" },
  { kind: "composing",       label: "Composing the answer" },
];

/**
 * RouteDecision — the structured payload that drives the right-HUD's
 * Routing Decision card. Every field is a projection of a real pipeline
 * response, NEVER synthesized:
 *   about        ← /resolve (subject_uri + confidence + label)
 *   action       ← /classify_predicate (verb_iri + confidence +
 *                  classify_called from Contract A) + compat-walk hops
 *   handled_by   ← the verb edge's `provider` and `endpoint_url`
 *
 * Confidence is the raw float as the pipeline reported it. The UI
 * projects to a bucket for readability; the float is preserved for
 * hover/inspection. Per architect's ruling 2026-06-21: do NOT hide
 * low confidence behind euphemism — show "low confidence — system
 * wasn't sure; you may want to rephrase". Hiding it manufactures
 * confidence the pipeline did not have.
 */
export interface RouteDecision {
  about: {
    label: string;          // human-readable subject class label (NOT the URI)
    uri: string;            // the actual OntologyClass URI
    confidence: number;     // raw 0..1 from /resolve
    /** Instance-resolution provenance (if any), straight from /resolve */
    instance_resolved?: boolean;
    instance_identifier?: string;
    /** Friendly label of the resolved instance (e.g. "Customer 360") —
     *  the specific thing, vs `label` which is the class ("Dashboard").
     *  Present when an instance resolved; empty for set/type-level
     *  queries. The answer summary leads with this when available. */
    instance_label?: string;
  };
  action: {
    label: string;          // human-readable verb label (e.g. "Search technical manuals")
    iri: string;            // mesh:retrieveKnowledge etc.
    confidence: number;     // raw 0..1 from /classify_predicate
    classify_called: boolean; // Contract A invariant
    /** Number of candidate verbs the compat-walk surfaced (N=1 is the
        Contract A N=1 confirmation case). */
    candidate_count: number;
    /** OUTPUT-side persona of the verb edge (e.g. "TECH_WRITER",
     *  "DATA_STEWARD", "AUDITOR"). Source: `owner_persona` property on
     *  the (input)-[verb]->(output) edge in Neo4j. This is the substrate
     *  persona — "which type of expert produced this answer" — NOT the
     *  caller-identity persona (which is a separate future ADR; see
     *  [[pingsso-claim-gap]] in iagent-mesh-sdk memory). Surfacing it
     *  in the UI gives an attribution chip on the Routing Decision
     *  card; the user can see who in the system "owns" this kind of
     *  answer. Never conflate with caller-identity persona. */
    owner_persona?: string;
  };
  handled_by: {
    engine_name: string;    // "Engine W" / "Engine E" / "Engine A" / etc.
    provider: string;       // provider field from the verb edge
    endpoint_url?: string;  // the actual HTTP endpoint
  };

  /**
   * Decision-path visualizer (Part 1) fields. The gateway projection emits
   * these; older projections may omit them (all optional for backward
   * compat). "Render only what was captured" — the UI renders these when
   * present, and honestly shows nothing extra when absent.
   */
  /** The supervisor's authoritative status: "matched" | "no_match" |
   *  "infra_error". */
  route_status?: string;
  /** True when routing fell to the Engine A generalist instead of a
   *  specialist. When true, `fallback_reason` carries WHY. */
  fallback?: boolean;
  /** The STRUCTURED closed-enum reason (Part 0). Passed through verbatim
   *  from the supervisor — see src/lib/routing.ts for presentation. */
  fallback_reason?: FallbackReason;
  /** The resolver candidate pool — winner AND the losers it beat, each
   *  with a score. Rendered losers-first-class so "why did nothing win"
   *  (or "what did the winner beat") is visible, not just the winner. */
  candidates?: SubjectCandidate[];

  /** Acting-persona provenance — the CALLER persona + domain this decision
   *  was computed under. Persona-driven routing means the same query can
   *  pick different verbs under different personas; this is the premise
   *  that makes such a divergence self-explaining. DISTINCT from
   *  action.owner_persona (the answerer-side "voice"). */
  acting?: { persona?: string | null; domains?: string[] };
}

/**
 * SubjectCandidate — one entry in the resolver's candidate pool, captured
 * by the supervisor (subject_candidates) with its score. The winner is the
 * one whose `uri` equals RouteDecision.about.uri; the rest are the losers,
 * rendered first-class with their scores so the contest is visible.
 */
export interface SubjectCandidate {
  uri: string;
  label?: string;
  score?: number;
}

/**
 * Source — one citation from the engine that produced the answer.
 * Mirrors the architect's discipline: snippet is matched-chunk text
 * (what the retriever saw), NOT an LLM-summary (synthesis = theater).
 */
export interface Source {
  type: "document" | "graph_node" | "catalog_asset";
  label: string;        // human-readable identifier
  uri: string;          // canonical identifier
  relevance?: number;   // 0..1 if the engine reports it
  snippet?: string;     // first ~120 chars of matched-chunk text
  open_url?: string;    // deep link to viewer (S3 URL / DataHub URL / etc.)

  /**
   * Access-decision provenance per ADR-0025.
   *
   * RESERVED SLOT: null today (no retrieval enforces access control
   * yet per ADR-0025 §Non-goals). Shaped to hold the Topaz decision's
   * record when enforcement lands. Capture-or-lose-forever applies at
   * decision time per `[[verify-subtle-acceptance-by-inspection]]`;
   * reserving the slot now means the enforcement session doesn't
   * need a second migration through writer + Neo4j + projector +
   * Postgres + Electric + cortex-ui Source.
   *
   * Field meanings (the documented shape):
   *   outcome              — allow / deny / filter. A `"deny"` decision
   *                          implies the source is NOT in CITES (its
   *                          record exists for audit of why a
   *                          candidate was excluded). A `"filter"`
   *                          decision means the source IS in CITES
   *                          but with CLS/RLS applied.
   *   policy_version       — the Topaz policy bundle version the
   *                          decision was made under. Required because
   *                          policy changes; a v1.3.2 decision may
   *                          not reproduce under v1.4.0.
   *   attributes_considered — KEYS (not values) of subject/resource/
   *                          environment attributes the policy
   *                          consulted. Values may be sensitive;
   *                          the audit question is "what was
   *                          consulted," not "what was the value."
   *   filters_applied      — column-level redaction set + row-filter
   *                          expression Topaz returned. Mirrors the
   *                          mock Rego at topaz-configmap.yaml's
   *                          `allowed_columns` / `row_filters` shape.
   *   decided_at           — epoch milliseconds of the decision moment.
   *                          Required because environment attributes
   *                          (time-of-day) and policy version are
   *                          time-bound.
   *
   * INTERIM under `[[coupled-interim-mechanisms-retire-together]]` —
   * the Restate+topic successor's durable handler subsumes this
   * slot's crash-resumability; the slot's CONTENT survives, only
   * its WRITE PATH changes.
   */
  access_decision?: {
    outcome: "allow" | "deny" | "filter";
    policy_version: string;
    attributes_considered: {
      subject: string[];      // attribute keys, not values
      resource: string[];
      environment: string[];
    };
    filters_applied?: {
      columns_redacted?: string[];
      rows_filtered_by?: string;
    };
    decided_at: number;       // epoch ms
  } | null;
}

/**
 * GraphTraceNode — a step in the (S, P) compat-walk from /find_compatible_verbs.
 * The visualization shows the actual subClassOf walk + the resolved verb edge,
 * because that walk IS the proof the system is substrate-grounded.
 */
export interface GraphTraceNode {
  uri: string;
  label: string;
  role: "resolved_subject" | "ancestor_class" | "verb_target" | "output_class" | "alternate_verb";
  /** Number of subClassOf hops from the resolved subject. 0 = subject itself. */
  hops?: number;
  /** Verb name if this node is reached via a verb edge (not subClassOf). */
  via_verb?: string;
  /** Per-alternate semantic score (Weaviate hybrid query→verb match), on
   *  alternate_verb nodes — lets the decision-path map sort + label the
   *  alternate fan instead of anonymous dashed lines. */
  score?: number;
}

/**
 * Decision-subgraph MAP — the base layer (POST /decision_subgraph). A
 * BOUNDED live Neo4j read of the decision's neighborhood, diffed on the
 * frontend against the captured decision. `available=false` is the
 * COULDN'T-CHECK state (live read failed) — the map must render
 * "captured-only, cannot verify what changed", never an empty-looking map.
 */
export interface DecisionSubgraphRequest {
  class_uris: string[];
  verb_iris?: string[];
  subject_uri?: string;
}

export interface SubgraphNode {
  uri: string;
  labels?: string[];
}
export interface SubgraphEdge {
  source: string;
  target: string;
  type: string;
}
export interface DecisionSubgraphResponse {
  available: boolean;
  reason?: string;
  live_nodes: SubgraphNode[];
  live_edges: SubgraphEdge[];
  context_nodes: SubgraphNode[];
  /** Ordered subClassOf spine, subject-first — the map's vertical
   *  backbone with every intermediate class a real node. */
  ancestor_chain: string[];
}

/** Parsed stream event types — Option A clean cut (2026-06-22).
 *
 *  The old `status` variant (action: "think" | "found" | "error" | "plan"
 *  with free-text labels) is REMOVED in this revision. Every signal now
 *  comes through a typed variant that projects real pipeline data:
 *
 *    pipeline_stage  ← Dagster step status transitions (RUNNING/SUCCESS/FAILURE)
 *                      + the gateway-level /route_intent call
 *    pipeline_error  ← typed error event (replaces action="error" status)
 *    route_decision  ← supervisor-materialized routing decision (when
 *                      that asset lands; UI tolerates absence)
 *    sources         ← engine-attached citation list (when engines emit it)
 *    graph_trace     ← supervisor-materialized compat-walk (when that
 *                      asset lands)
 *    context_update  ← ontology terms + data bindings (unchanged)
 *    chat_message    ← agent's text answer (unchanged)
 *    ui_payload /
 *      final_payload ← schema-driven semantic payload (unchanged)
 *    stream_end      ← terminator (unchanged)
 *
 *  Dagster path discipline: every pipeline_stage and pipeline_error
 *  emitted in the ONE_SHOT routing flow MUST derive from real Dagster
 *  step status (the gateway's polling loop reads it from the run's
 *  step stats / asset materializations). The gateway is not allowed
 *  to bypass Dagster to fabricate stage progress — the supervisor is
 *  the audit trail, and the events the UI sees are projections of
 *  what Dagster actually recorded.
 *
 *  The active-roster "personas summoning" decoration is GONE. It was
 *  visual flavor that didn't surface a real grounding signal; the
 *  output-side `owner_persona` lives on the verb edge instead and is
 *  surfaced as an attribution chip in the Routing Decision card.
 *  Caller-identity persona from Keycloak claims is a separate future
 *  ADR (see [[pingsso-claim-gap]]).
 */
export type StreamEvent =
  | { type: "context_update"; contextType: "ontology" | "bindings"; data: string[] }
  | { type: "chat_message"; data: { role: string; content: string } }
  | { type: "ui_payload"; payload: DashboardUI }
  | { type: "final_payload"; payload: DashboardUI }
  | { type: "stream_end" }
  // ── Typed grounding-panel events ─────────────────
  | {
      type: "pipeline_stage";
      kind: PipelineStageKind;
      status: "started" | "completed" | "failed";
      /** Optional payload that lets later phases fold in detail without
          new event types: subject_uri, verb_iri, n_candidates, etc. */
      detail?: {
        subject_uri?: string;
        verb_iri?: string;
        n_candidates?: number;
      };
      /** ms since pipeline_start; used by ThinkingCard for elapsed display. */
      elapsed_ms?: number;
    }
  | {
      /** Typed error event. Replaces the legacy action="error" status
       *  event with a structured payload. Optional `kind` lets the UI
       *  attach the error to the relevant pipeline stage (e.g. a red
       *  icon on the "retrieving" row). `retryable` is the policy hint
       *  the backend includes when known (e.g. transient HTTP 5xx vs.
       *  a verb-unfound contract-B short-circuit).  */
      type: "pipeline_error";
      kind?: PipelineStageKind;
      message: string;
      retryable?: boolean;
      /** Optional cause classification — verb_unfound, llm_timeout,
          engine_5xx, etc. — for downstream telemetry / diagnostics. */
      cause?: string;
    }
  | { type: "route_decision"; decision: RouteDecision }
  | { type: "sources"; sources: Source[] }
  | { type: "graph_trace"; nodes: GraphTraceNode[]; alternates?: GraphTraceNode[] }
  | {
      /** Bug 2 — a data-plane ACCESS DENIAL. The gateway emits this typed
       *  event when an engine's can_read gate 403s for the caller. Distinct
       *  from `pipeline_error` (this is an authorization outcome, not a
       *  fault) and from an empty result: it carries the denied asset(s) and
       *  the domain to route a HITL access-request to the right approvers. */
      type: "access_denied";
      denied_assets: string[];
      subject: string;
      domain: string;
      message: string;
    };

/**
 * Artifact — the durable, grounded answer-object per ADR-0023.
 *
 * One AnswerArtifact per answerer-output. NOT a chat-transcript-turn
 * (that's `Message` in useInterviewStore). `Message` references
 * `Artifact` by id when a turn produced one; an `Artifact` references
 * its triggering `Message` by id. They are STRUCTURALLY DISTINCT and
 * MUST stay distinct — collapsing them re-creates the same
 * concept-conflation class as the persona-conflation and the
 * canvas-overwrite the foundation closes.
 *
 * Capture-or-lose-forever applies to `valid_as_of`, `produced_for`,
 * `produced_by` (refined when routing arrives), and `derived_from_artifact_id`
 * (when applicable) — they must be set at creation. No backfill is
 * possible. The fields below are commented inline with WHY each one
 * exists, so a future implementer cannot strip them thinking they
 * are incidental.
 *
 * Phase 1 of the weekend session (mock-backed). Monday's backend work
 * wires the Neo4j+Electric projection; the Artifact type stays put.
 */
export interface Artifact {
  /** Stable identifier. Phase 1: client-side generated UID;
   *  Monday+: URN-shaped (`urn:li:answerArtifact:...`) from the backend. */
  id: string;

  /** When the artifact was created. */
  created_at: number;
  /** Last update — bumps when pending→complete or on substrate-stale mark. */
  updated_at: number;

  /**
   * As-of of the grounding. Semantically "the time-point the substrate
   * was sampled at," distinct from `created_at` which is when the
   * artifact was made. Initially equals `created_at`; diverges when
   * an artifact is produced from a historical snapshot.
   *
   * REQUIRED — capture-or-lose-forever. This is the field that makes
   * freshness checkable against captured grounding (sources + routing).
   * See ADR-0023 §"Freshness as the artifact's stateful dimension."
   */
  valid_as_of: number;

  /**
   * Optional natural expiry — "current sprint status" expires at sprint
   * end; "who's on call" expires at rotation change; "what was Q3
   * revenue" has no expiry. Null when no natural expiry applies;
   * freshness is then computed against grounding instead.
   */
  valid_until?: number | null;

  /** Raw user-question text. */
  question_text: string;

  /**
   * The answer's factual S·P headline — the line the answer-first left
   * column leads with (the question is the dim second line). Composed
   * ONCE at the gateway write point from the captured routing facts
   * (`subject label · verb label`; fallback answers → the structured
   * `fallback_reason`), stored on the artifact, and read VERBATIM here
   * — per ADR-0028 Decision 4 and the codebase's synthesis-is-theater
   * principle, it is a CAPTURED FACT, never an LLM summary, never
   * re-derived on read. v1 is S·P (guaranteed-correct, archetype-blind);
   * object-enrichment (S·P·O) is a per-archetype write-point follow-up.
   * Empty string when no headline was captured (legacy/thin-routing
   * rows) — the UI degrades to `question_text`.
   */
  summary: string;

  /**
   * Resolved intent — subject, verb, parameters as the routing layer
   * resolved them. Preserved because re-running resolution wouldn't
   * reproduce the historical answer. Phase 1: derived from routing
   * when it arrives; null until then.
   */
  resolved_intent: {
    subject_uri?: string;
    verb_iri?: string;
    parameters?: Record<string, unknown>;
  };

  /**
   * The chat-transcript message this artifact was produced FOR. Lets
   * the canvas show "which question this artifact answered" without
   * duplicating the question text into the Message. Bidirectional
   * reference: Message.artifactId points the other way.
   */
  message_id: string;

  /**
   * Lifecycle status for the UI. NOT the ADR's "artifact state"
   * (validity is). This is the pending→complete responsiveness flow
   * only — instant create in `pending`, transitions to `complete` when
   * the pipeline finishes, or `failed` on honest error.
   *
   * IMPORTANT: this field is a UI concern, NOT an ADR-modeled artifact
   * property. When this projection moves to Neo4j+Electric, this field
   * is COMPUTED/DERIVED, NOT persisted on the artifact node — the node
   * is born complete or it isn't born. See ADR-0023 §"Freshness as
   * the artifact's stateful dimension" for why generation-state is
   * never an artifact property: it's provenance-at-creation plus
   * transient UI, not state the artifact carries.
   */
  status: "pending" | "complete" | "failed";

  /**
   * The presentation predicate's output. Shape derived from `DashboardUI`
   * (components array) plus archetype hints. Null while pending.
   * Phase 1: comes from `ui_payload` / `final_payload` events.
   */
  rendered_output: {
    components: unknown[];
    archetype?: string;
    component_uri?: string;
  } | null;

  /**
   * Provenance — answerer-side. The agent/user that PRODUCED this
   * artifact. Agent actors carry `version`/`endpoint`/`code_hash` for
   * repro/audit; user actors only carry their actor_id.
   *
   * Combined with `routing.action.owner_persona`, this carries the
   * ANSWERER-SIDE persona per ADR-0009. Structurally separate from
   * `produced_for` (user-side); conflating them is the bug ADR-0009
   * closed.
   *
   * Phase 1 reality: set to a `pending` sentinel at createPending, then
   * refined when `route_decision` arrives carrying the real engine
   * identity in `handled_by`. The lifecycle "pending sentinel → refined
   * by routing" is the artifact-update path the responsiveness flow
   * exercises (acceptance #2).
   */
  produced_by: {
    actor_type: "agent" | "user";
    actor_id: string;
    version?: string;
    endpoint?: string;
    code_hash?: string;
  };

  /**
   * Provenance — user-side. The requesting human. Per ADR-0009 this is
   * STRUCTURALLY SEPARATE from `produced_by`; conflating them is the
   * bug ADR-0009 closed.
   *
   * Today's claim gap [[pingsso-claim-gap]]: the PingSSO JWT lacks
   * `user_persona` / `entitled_domains` claims. The slot exists from
   * day one even though it's populated thinly (`user_id`,
   * `is_authenticated`); persona / entitlements stay nullable until
   * claims expand. Slot existing now means the claims expansion is a
   * populate, NOT a schema migration.
   *
   * IMPORTANT: a `null` persona here means "unknown user persona," NOT
   * a default value. Treating null as "default" would silently mask the
   * claim gap, which is the opposite of why the slot exists.
   *
   * Capture A per ADR-0025 / ADR-0026 step 6: `entitlement_source`
   * records where the persona / entitled_domains came from. Step 6
   * retired the JWT-claim path, collapsing the origin vocabulary from
   * three JWT-era values (claim / fallback / partial) to TWO honest
   * states that MUST match the backend's `Literal["topaz", "none"]`:
   *   "topaz" — Topaz returned a non-empty entitlement matrix.
   *   "none"  — Topaz returned nothing (unseeded user). HONEST-EMPTY:
   *             user_persona null, entitled_domains []. Never a
   *             fabricated default.
   * The persisted VALUE is what downstream code sees; the origin flag is
   * the audit fact that would otherwise be lost (capture-or-lose-forever
   * per `[[verify-subtle-acceptance-by-inspection]]`). Per
   * `[[optimistic-defaults-are-dishonest]]`: the client-side pending seed
   * defaults to `"none"` (the client truly doesn't know at pending-
   * creation time; the Electric-synced server value overwrites on first
   * apply) — NOT a fabricated `"topaz"`.
   */
  produced_for: {
    user_id: string;
    is_authenticated: boolean;
    user_persona?: string | null;
    entitled_domains?: string[] | null;
    entitlement_source: "topaz" | "none";
  };

  /**
   * The routing decision (subject, verb, confidence, handler,
   * `owner_persona`). The substrate already produces this as a
   * structured object; the artifact records it.
   *
   * `routing.action.owner_persona` is the ANSWERER-SIDE persona — the
   * persona the engine occupied when answering, distinct from
   * `produced_for.user_persona`. See ADR-0009 and the inline comment
   * on RouteDecision.action.owner_persona.
   *
   * Phase 1: comes from `route_decision` event. Null until then.
   */
  routing: RouteDecision | null;

  /**
   * Sources cited. Each `Source` is shaped as an addressable citation
   * (URI + type). Dedup-by-URN is a derived selector when needed; the
   * artifact carries the citations it made.
   *
   * Phase 1: comes from `sources` event. Empty array until then.
   * Monday+: each Source becomes its own `:Source` node and `:CITES`
   * is the edge; client-side, an array attached to the artifact is the
   * equivalent shape.
   */
  sources: Source[];

  /** Graph trace nodes (subject graph for the HUD's reasoning panel). */
  graph_trace: GraphTraceNode[];

  /** Verb-leg alternates — the untaken compatible verbs (role
   *  "alternate_verb"). Sibling to graph_trace; the decision-path diagram
   *  draws these as branches-not-taken. Empty when only one verb fit. */
  graph_trace_alternates: GraphTraceNode[];

  /**
   * Lineage — id of the artifact this follow-up was DERIVED_FROM. Null
   * for top-of-thread artifacts. One-hop sufficient for Phase 1;
   * multi-hop lineage queries become traversals once on Neo4j.
   *
   * Phase 1 almost always null (no follow-up detection yet in the
   * mock-backed flow); the seed signature accepts it so the lineage
   * edge can be captured the moment follow-up detection lands without
   * changing the creation API.
   */
  derived_from_artifact_id?: string | null;

  /**
   * Substrate-write-state. Orthogonal to `status` — `status` is the
   * pipeline-lifecycle (pending/complete/failed), this is whether the
   * answer has been written to Neo4j as the substrate of record.
   *
   * - `persistence_pending` — initial value at delivery time; the
   *   cortex-bff Neo4j write is in flight (or queued for retry).
   * - `durable` — the cortex-bff Neo4j write succeeded; the artifact
   *   is in the graph-of-record.
   * - `persistence_failed` — cortex-bff's retry budget exhausted; the
   *   user has the answer, but it is NOT in the graph-of-record. The
   *   system honestly knows this; the dashboard would surface it.
   *
   * Per the planning doc §3.1 Decision 0 sub-decision: DO NOT collapse
   * into `status`. The two questions are orthogonal facts about the
   * artifact; collapsing them re-creates the same concept-conflation
   * class as the persona-conflation, the Message-vs-Artifact
   * conflation, and the canvas-overwrite (see
   * [[verify-subtle-acceptance-by-inspection]]).
   *
   * INTERIM under the Restate+topic successor: the durable handler
   * formalizes this via the journal (exactly-once, crash-resumable)
   * instead of a recorded honest-state. Retires with Decisions 0+1+3
   * per [[coupled-interim-mechanisms-retire-together]]. See
   * docs/plans/projector-build-plan.md §3.5 Through-line.
   */
  durability_status: "persistence_pending" | "durable" | "persistence_failed";

  /**
   * The projector's monotonic apply-order position (Decision 3
   * Option C: watermark-as-column on every artifact row, not a synced
   * row, not a separate shape). The cortex-bff writer assigns it from
   * a Neo4j sequence node on every UPDATE — including updates that
   * only flip `durability_status`. Bumped on EVERY apply per
   * [[verify-subtle-acceptance-by-inspection]]'s vestigial-watermark
   * defense.
   *
   * `0` is the pre-projection SENTINEL: it means the projector has
   * not yet assigned this artifact a real watermark (the client just
   * created a pending artifact locally; the SSE write hasn't completed
   * yet OR the projector hasn't read it back). Any positive value is
   * a server-assigned position.
   *
   * Distinct concept from `valid_as_of` — `valid_as_of` is the
   * semantic as-of of the grounding (ADR-0023's freshness primitive);
   * `watermark` is the transport-side apply-order position (Option
   * C's see-your-write primitive). Two distinct concept spaces; do
   * NOT collapse under any framing.
   *
   * INTERIM under the Restate+topic successor: the topic offset
   * becomes the position; the per-row watermark column becomes
   * redundant scaffolding. Retires with Decisions 0+1+3 per
   * [[coupled-interim-mechanisms-retire-together]]. See
   * docs/plans/projector-build-plan.md §3.4 Decision 3 (RESOLVED
   * Option C) and §3.5 Through-line.
   */
  watermark: number;

  /**
   * TASK marker. Present ONLY on synthetic artifacts adapted from a HITL
   * task (id prefixed `task:`), absent on answer artifacts. It makes a task
   * a first-class timeline/canvas/HUD citizen: the same `currentArtifactId`
   * selection signal, the same archetype rendering (GROUPED_REVIEW /
   * APPROVAL_TASK), the same HUD contract. `task_state` is the TASK's own
   * pending/resolved state — distinct from `status` (which is always
   * `complete` for a task-artifact so it displays). Pending-is-a-state: the
   * timeline styles the row from `task_state` at its chronological position,
   * never relocating it. Kept in sync with `useHumanTaskStore` by the
   * task→artifact reconciler.
   */
  task_ref?: TaskRef;
}

/** The HITL task a synthetic task-artifact stands for (see Artifact.task_ref). */
export interface TaskRef {
  /** HumanTask.taskId — the /act + fetchReviewBatch key. */
  taskId: string;
  workflowId: string | null;
  /** grouped_review | pcn_disposition | workflow_ack | access_request. */
  kind: string;
  /** The TASK's state (not the artifact's UI status). Terminal states are PER SPECIES:
   *  a triage task ends acknowledged/redriven, never approved/rejected — the server refuses
   *  those verbs on it (422). Only `pending` is load-bearing for filtering. */
  task_state: "pending" | "approved" | "rejected" | "acknowledged" | "redriven" | "expired";
  audience: string;
  requestedBy: string;
  subjectRef: string | null;
}

/** BPMN graph state emitted by the backend on each turn */
export interface BPMNGraphUpdate {
  tasks: BPMNTask[];
  gateways: BPMNGateway[];
  sequence_flows: BPMNSequenceFlow[];
  unresolved_paths: string[];
  is_ready_to_compile: boolean;
}

/** Request payload for the interview stream endpoint */
export interface InterviewRequest {
  message: string;
  // Required: identifies the chat thread / DagsterRunTracker key on the
  // backend. Omitting it used to cause the gateway to mint a fresh UUID
  // per request, defeating dedup and launching duplicate Dagster runs.
  session_id: string;
  current_graph_json?: string;
  /**
   * Client-supplied AnswerArtifact id. Hop 3 (Electric → store) needs
   * cortex-ui's locally-created pending artifact id to equal the
   * server's persisted artifact id, otherwise Electric streams the
   * real artifact with a DIFFERENT id, `existingIdx === -1`, and the
   * pending stays foregrounded with empty data while the real one
   * sits unviewed. `useInterviewAgent` passes the same `artifactId`
   * it gave to `createPendingArtifact`; cortex-bff uses it as the
   * persisted id; Electric upsert finds the pending row by id and
   * merges in place.
   */
  artifact_id?: string;
  /**
   * ADR-0026 step 4: per-prompt persona/domain override from the
   * picker. Both together = override this request; both absent =
   * server falls back to the caller's `entitlements.default` (or
   * first cell, or legacy JWT-claim path). Server 400s if only
   * one is set. Server 403s (`cell_not_entitled`) if the cell is
   * outside the caller's entitlement matrix.
   */
  active_persona?: string;
  active_domains?: string[];
}

// ── ADR-0026 entitlement matrix ────────────────────────────

/** One (persona, domain) cell the user is entitled to. */
export interface EntitlementCell {
  persona: string;
  domain: string;
}

/** Response body for GET /me/entitlements */
export interface Entitlements {
  user_id: string;
  email: string;
  cells: EntitlementCell[];
  default: EntitlementCell | null;
  /** Provenance flag — the two honest post-step-6 states: topaz | none. */
  source: string;
}

// ── BPMN Payload Models ───────────────────────────────────

/** A BPMN task node — the unit of work in a workflow */
export interface BPMNTask {
  id: string;
  name: string;
  type: "service_task" | "user_task" | "timer_event";
  agent_endpoint: string;
  /** IOF-MRO ontology URI grounding this task (required for service_task) */
  ontology_class?: string;
  /** DataHub/dbt model name grounding this task (required for service_task) */
  data_source?: string;
}

/** A BPMN gateway — routing/branching logic */
export interface BPMNGateway {
  id: string;
  name: string;
  type: "exclusive";
}

/** A BPMN sequence flow — an edge connecting two elements */
export interface BPMNSequenceFlow {
  id: string;
  source_ref: string;
  target_ref: string;
  condition_expression?: string;
}

/** The simplified BPMN payload sent to the backend */
export interface BPMNPayload {
  tasks: BPMNTask[];
  gateways: BPMNGateway[];
  sequence_flows: BPMNSequenceFlow[];
}

/** Request payload for workflow compilation */
export interface CompileRequest {
  session_id: string;
  bpmn_payload: BPMNPayload;
}

/** Response from the compile endpoint */
export interface CompileResponse {
  success: boolean;
  run_id: string;
  dagster_job_name?: string;
  message?: string;
  boot_log: string;
}
