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
