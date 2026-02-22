// ── Stream Event Protocol ─────────────────────────────────
// The backend sends a chunked HTTP response. Each chunk is a line of text.
// Normal text chunks are the agent's response (streamed character-by-character).
// Special tokens trigger UI events (thinking cards, ontology lookups, etc).

/** Special tokens the backend injects into the stream */
export const StreamTokens = {
  /** Ontology lookup started: <<ONTOLOGY_LOOKUP:label>> */
  ONTOLOGY_LOOKUP: "<<ONTOLOGY_LOOKUP",
  /** Ontology result found: <<ONTOLOGY_FOUND:category:label>> */
  ONTOLOGY_FOUND: "<<ONTOLOGY_FOUND",
  /** DataHub query started: <<DATAHUB_QUERY:model:schema>> */
  DATAHUB_QUERY: "<<DATAHUB_QUERY",
  /** DataHub query result: <<DATAHUB_RESULT:model:schema:healthy>> */
  DATAHUB_RESULT: "<<DATAHUB_RESULT",
  /** Interview complete signal: <<INTERVIEW_COMPLETE>> */
  INTERVIEW_COMPLETE: "<<INTERVIEW_COMPLETE>>",
  /** Stream end signal: <<STREAM_END>> */
  STREAM_END: "<<STREAM_END>>",
} as const;

/** Parsed stream event types */
export type StreamEvent =
  | { type: "text"; content: string }
  | { type: "ontology_lookup"; label: string }
  | { type: "ontology_found"; category: string; label: string }
  | { type: "datahub_query"; model: string; schema: string }
  | { type: "datahub_result"; model: string; schema: string; healthy: boolean }
  | { type: "interview_complete" }
  | { type: "stream_end" };

/** Request payload for the interview stream endpoint */
export interface InterviewRequest {
  message: string;
  session_id?: string;
  context?: {
    ontology_terms: Array<{ category: string; label: string }>;
    data_bindings: Array<{ model: string; schema: string }>;
  };
}

// ── BPMN Payload Models ───────────────────────────────────

/** A BPMN task node — the unit of work in a workflow */
export interface BPMNTask {
  id: string;
  name: string;
  type: "service_task" | "user_task";
  agent_endpoint: string;
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
