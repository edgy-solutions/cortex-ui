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

/** Request payload for workflow compilation */
export interface CompileRequest {
  session_id: string;
  blueprint: {
    ontology_terms: Array<{ category: string; label: string }>;
    data_bindings: Array<{ model: string; schema: string; healthy: boolean }>;
    nodes: Array<{ id: string; type: string; label: string }>;
    edges: Array<{ source: string; target: string }>;
  };
}

/** Response from the compile endpoint */
export interface CompileResponse {
  success: boolean;
  run_id: string;
  dagster_job_name?: string;
  message?: string;
}
