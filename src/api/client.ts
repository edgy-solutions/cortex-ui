import axios from "axios";
import {
  StreamTokens,
  type StreamEvent,
  type InterviewRequest,
  type CompileRequest,
  type CompileResponse,
} from "./types";

// ── Config ────────────────────────────────────────────────
const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:8000";

const api = axios.create({
  baseURL: API_URL,
  headers: { "Content-Type": "application/json" },
});

// ── Stream Parser ─────────────────────────────────────────
/**
 * Parses a raw chunk from the backend stream into a StreamEvent.
 * The backend sends lines in one of two forms:
 *   1) Plain text — forwarded as `{ type: "text", content: "..." }`
 *   2) Token lines — `<<TOKEN:arg1:arg2>>` parsed into structured events
 */
function parseStreamChunk(raw: string): StreamEvent | null {
  const line = raw.trim();
  if (!line) return null;

  // ── Special tokens ──
  if (line === StreamTokens.INTERVIEW_COMPLETE) {
    return { type: "interview_complete" };
  }

  if (line === StreamTokens.STREAM_END) {
    return { type: "stream_end" };
  }

  if (line.startsWith(StreamTokens.ONTOLOGY_LOOKUP)) {
    // <<ONTOLOGY_LOOKUP:iof:RotatingEquipment>>
    const inner = line.slice(StreamTokens.ONTOLOGY_LOOKUP.length + 1, -2);
    return { type: "ontology_lookup", label: inner };
  }

  if (line.startsWith(StreamTokens.ONTOLOGY_FOUND)) {
    // <<ONTOLOGY_FOUND:Concept:iof:ImpactDamage>>
    const inner = line.slice(StreamTokens.ONTOLOGY_FOUND.length + 1, -2);
    const sepIdx = inner.indexOf(":");
    const category = inner.slice(0, sepIdx);
    const label = inner.slice(sepIdx + 1);
    return { type: "ontology_found", category, label };
  }

  if (line.startsWith(StreamTokens.DATAHUB_QUERY)) {
    // <<DATAHUB_QUERY:stg_maintenance_logs:staging>>
    const inner = line.slice(StreamTokens.DATAHUB_QUERY.length + 1, -2);
    const [model, schema] = inner.split(":");
    return { type: "datahub_query", model, schema };
  }

  if (line.startsWith(StreamTokens.DATAHUB_RESULT)) {
    // <<DATAHUB_RESULT:stg_maintenance_logs:staging:true>>
    const inner = line.slice(StreamTokens.DATAHUB_RESULT.length + 1, -2);
    const parts = inner.split(":");
    return {
      type: "datahub_result",
      model: parts[0],
      schema: parts[1],
      healthy: parts[2] === "true",
    };
  }

  // ── Plain text ──
  return { type: "text", content: raw };
}

// ── Streaming Interview ───────────────────────────────────
/**
 * Connects to POST /interview/stream and yields parsed StreamEvents.
 * Uses the Fetch API (not axios) for ReadableStream support.
 *
 * @param request - The interview request payload
 * @param onEvent - Callback fired for each parsed stream event
 * @param signal - Optional AbortSignal for cancellation
 */
export async function streamInterviewResponse(
  request: InterviewRequest,
  onEvent: (event: StreamEvent) => void,
  signal?: AbortSignal
): Promise<void> {
  const response = await fetch(`${API_URL}/interview/stream`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(request),
    signal,
  });

  if (!response.ok) {
    throw new Error(
      `Interview stream failed: ${response.status} ${response.statusText}`
    );
  }

  const reader = response.body?.getReader();
  if (!reader) throw new Error("No response body reader available");

  const decoder = new TextDecoder();
  let buffer = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });

      // Process complete lines (delimited by newline)
      const lines = buffer.split("\n");
      // Keep the last incomplete fragment in the buffer
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        const event = parseStreamChunk(line);
        if (event) {
          onEvent(event);
          if (event.type === "stream_end") return;
        }
      }
    }

    // Process any remaining buffer
    if (buffer.trim()) {
      const event = parseStreamChunk(buffer);
      if (event) onEvent(event);
    }
  } finally {
    reader.releaseLock();
  }
}

// ── Compile Workflow ──────────────────────────────────────
/**
 * Sends the final blueprint to the backend for compilation into
 * a Dagster job + Restate service.
 */
export async function compileWorkflow(
  request: CompileRequest
): Promise<CompileResponse> {
  const { data } = await api.post<CompileResponse>(
    "/workflow/compile",
    request
  );
  return data;
}

// ── Health Check ─────────────────────────────────────────
export async function healthCheck(): Promise<boolean> {
  try {
    const { status } = await api.get("/health");
    return status === 200;
  } catch {
    return false;
  }
}
