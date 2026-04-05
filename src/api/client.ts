import axios from "axios";
import { fetchEventSource } from "@microsoft/fetch-event-source";
import { config } from "@/config";
import {
  type StreamEvent,
  type InterviewRequest,
  type CompileRequest,
  type CompileResponse,
} from "./types";

// ── Auth Utilities ─────────────────────────────────────────
/**
 * Retrieves the OIDC user from session storage.
 * Matches the React OIDC Context storage pattern.
 */
function getOidcToken(): string | null {
  const storageKey = `oidc.user:${config.VITE_KEYCLOAK_REALM_URL}:${config.VITE_KEYCLOAK_CLIENT_ID}`;
  const oidcStorage = sessionStorage.getItem(storageKey);

  if (oidcStorage) {
    try {
      const user = JSON.parse(oidcStorage);
      return user?.access_token || null;
    } catch {
      return null;
    }
  }
  return null;
}

// ── Config ────────────────────────────────────────────────
const API_URL = config.VITE_API_URL;

const api = axios.create({
  baseURL: API_URL,
  headers: { "Content-Type": "application/json" },
});

// Attach Bearer token to all REST requests
api.interceptors.request.use((cfg) => {
  const token = getOidcToken();
  if (token) {
    cfg.headers.Authorization = `Bearer ${token}`;
  }
  return cfg;
});

/**
 * Parses a single SSE block (event + data) into a StreamEvent.
 * SSE format: "event: <type>\ndata: <json>\n\n"
 */
function parseSSE(eventType: string, dataStr: string): StreamEvent | null {
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
      case "context_update": {
        return {
          type: "context_update",
          contextType: parsed.type,
          data: parsed.data || [],
        };
      }
      case "final_payload": {
        return { type: "final_payload", payload: parsed };
      }
      case "ui_payload": {
        return { type: "ui_payload", payload: parsed };
      }
      case "chat_message": {
        return { type: "chat_message", data: parsed };
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
 * Uses @microsoft/fetch-event-source for robust authenticated streaming.
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
  const token = getOidcToken();

  await fetchEventSource(`${API_URL}/interview/stream`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(request),
    signal,
    onmessage(msg) {
      if (msg.event === "stream_end") {
        onEvent({ type: "stream_end" });
        return;
      }
      const event = parseSSE(msg.event, msg.data);
      if (event) {
        onEvent(event);
      }
    },
    onerror(err) {
      console.error("SSE Stream Error:", err);
      // Re-throw to let fetch-event-source handle retry logic or fail
      throw err;
    },
  });
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

// ── Mesh Config ──────────────────────────────────────────
export async function getMeshConfig(): Promise<any> {
  const { data } = await api.get("/mesh/config");
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

// ── Analyst / Superset ───────────────────────────────────
/**
 * Publishes a SQL-backed chart to Apache Superset.
 * Targets Engine A (Analyst Service) via the BFF.
 */
export async function publishToSuperset(
  sql: string,
  title: string
): Promise<{ summary: string }> {
  const taskPayload = {
    task_description: `Publish the chart '${title}' to Superset.`,
    custom_payload: {
      action: "publish",
      sql_query: sql,
      chart_title: title,
    },
  };

  const { data } = await api.post<{ summary: string }>("/analyze", taskPayload);
  return data;
}
