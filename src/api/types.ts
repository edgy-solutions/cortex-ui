// ── Stream Event Protocol (SSE) ─────────────────────────────────
// The backend sends Server-Sent Events: event: <type>\ndata: <json>\n\n
// Event types: status, final_payload, stream_end

export type SemanticArchetype = 'PROCESS_TOPOLOGY' | 'HAZARD_DECLARATION' | 'ASSET_STATE_METRIC' | 'KNOWLEDGE_DOCUMENT';
export type SeverityLevel = 'INFO' | 'WARNING' | 'CRITICAL';

export interface UIEntity {
  id: string;
  name?: string;
  type?: string;
  description?: string;
}

export interface UIRelation {
  source: string;
  target: string;
  relation?: string;
  predicate?: string;
}

export type TopologyUI = { archetype: 'PROCESS_TOPOLOGY'; subject_concept: string; nodes: UIEntity[]; edges: UIRelation[] };
export type HazardUI = { archetype: 'HAZARD_DECLARATION'; subject_concept: string; severity: SeverityLevel; hazards: UIEntity[] };
export type MetricUI = { archetype: 'ASSET_STATE_METRIC'; subject_concept: string; metrics: UIEntity[] };
export type DocumentUI = { archetype: 'KNOWLEDGE_DOCUMENT'; subject_concept: string; markdown_content: string };

export type SemanticUIContainer = TopologyUI | HazardUI | MetricUI | DocumentUI;

// Composite Dashboard wrapper (multiple components per screen)
export type DashboardUI = {
  components: SemanticUIContainer[];
};

/** Parsed stream event types */
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
  | { type: "stream_end" };

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
  session_id?: string;
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
