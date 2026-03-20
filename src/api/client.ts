import axios from "axios";
import {
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

/**
 * Parses a single SSE block (event + data) into a StreamEvent.
 * SSE format: "event: <type>\ndata: <json>\n\n"
 */
function parseSSE(block: string): StreamEvent | null {
  let eventType = "";
  let dataStr = "";

  for (const line of block.split("\n")) {
    if (line.startsWith("event: ")) {
      eventType = line.slice(7).trim();
    } else if (line.startsWith("data: ")) {
      dataStr = line.slice(6);
    }
  }

  if (!eventType) return null;

  try {
    const parsed = dataStr ? JSON.parse(dataStr) : {};
    switch (eventType) {
      case "status": {
        return {
          type: "status",
          action: parsed.action,
          category: parsed.category,
          label: parsed.label,
          personas: parsed.personas,
        };
      }
      case "final_payload": {
        return { type: "final_payload", payload: parsed };
      }
      case "stream_end":
        return { type: "stream_end" };
      default:
        return null;
    }
  } catch (e) {
    console.warn("Failed to parse SSE data:", eventType, dataStr, e);
    return null;
  }
}

// ── Streaming Interview ───────────────────────────────────
/**
 * Connects to POST /interview/stream and yields parsed StreamEvents.
 * The backend sends Server-Sent Events (SSE) format.
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

      // SSE blocks are separated by double newlines
      const blocks = buffer.split("\n\n");
      // Keep the last incomplete block in the buffer
      buffer = blocks.pop() ?? "";

      for (const block of blocks) {
        const trimmed = block.trim();
        if (!trimmed) continue;
        const event = parseSSE(trimmed);
        if (event) {
          onEvent(event);
          if (event.type === "stream_end") return;
        }
      }
    }

    // Process any remaining buffer
    if (buffer.trim()) {
      const event = parseSSE(buffer.trim());
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
