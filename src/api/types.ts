// ── Stream Event Protocol (SSE) ─────────────────────────────────
export { 
  SemanticArchetype, 
  SeverityLevel,
  ChartType,
  MoodType,
} from '@platform/iagent-contracts';

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
  };
  action: {
    label: string;          // human-readable verb label (e.g. "Search technical manuals")
    iri: string;            // mesh:retrieveKnowledge etc.
    confidence: number;     // raw 0..1 from /classify_predicate
    classify_called: boolean; // Contract A invariant
    /** Number of candidate verbs the compat-walk surfaced (N=1 is the
        Contract A N=1 confirmation case). */
    candidate_count: number;
  };
  handled_by: {
    engine_name: string;    // "Engine W" / "Engine E" / "Engine A" / etc.
    provider: string;       // provider field from the verb edge
    endpoint_url?: string;  // the actual HTTP endpoint
  };
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
}

/**
 * GraphTraceNode — a step in the (S, P) compat-walk from /find_compatible_verbs.
 * The visualization shows the actual subClassOf walk + the resolved verb edge,
 * because that walk IS the proof the system is substrate-grounded.
 */
export interface GraphTraceNode {
  uri: string;
  label: string;
  role: "resolved_subject" | "ancestor_class" | "verb_target" | "output_class";
  /** Number of subClassOf hops from the resolved subject. 0 = subject itself. */
  hops?: number;
  /** Verb name if this node is reached via a verb edge (not subClassOf). */
  via_verb?: string;
}

/** Parsed stream event types — extended Phase 0 typed union.
 *
 *  All variants are DERIVED FROM real pipeline data:
 *    status, context_update, chat_message, ui_payload, final_payload,
 *    stream_end — existing variants, unchanged so this is non-breaking.
 *    pipeline_stage — drives the left-stream ThinkingCard (with stable
 *      `kind` for upsert-by-kind dispatch).
 *    route_decision — drives the right-HUD Routing Decision card.
 *    sources        — drives the right-HUD Sources & Evidence trail.
 *    graph_trace    — drives the right-HUD (detailed-mode) Graph Trace.
 *
 *  Per architect's Phase 0 ruling: declare the typed union once,
 *  later phases ADD variants, the panel and stream never diverge.
 */
export type StreamEvent =
  | {
      type: "status";
      action: "think" | "found" | "error" | "plan";
      category?: "Concept" | "Process" | "Asset";
      label: string;
      personas?: string[];
    }
  | { type: "context_update"; contextType: "ontology" | "bindings"; data: string[] }
  | { type: "chat_message"; data: { role: string; content: string } }
  | { type: "ui_payload"; payload: DashboardUI }
  | { type: "final_payload"; payload: DashboardUI }
  | { type: "stream_end" }
  // ── Phase 0+: typed grounding-panel events ─────────────────
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
  | { type: "route_decision"; decision: RouteDecision }
  | { type: "sources"; sources: Source[] }
  | { type: "graph_trace"; nodes: GraphTraceNode[] };

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
