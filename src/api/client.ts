import axios from "axios";
import { fetchEventSource } from "@microsoft/fetch-event-source";
import { config } from "@/config";
import {
  type StreamEvent,
  type InterviewRequest,
  type CompileRequest,
  type CompileResponse,
  type Entitlements,
  type DecisionSubgraphRequest,
  type DecisionSubgraphResponse,
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

// ── ADR-0026 entitlements ─────────────────────────────────
/**
 * Fetch the current user's (persona, domain) entitlement matrix from
 * cortex-bff (backed by topaz). Returns cells + default + provenance.
 *
 * The picker (PersonaPicker.tsx) calls this on login and populates
 * its dropdowns from the returned cells. Empty cells = no entitlements
 * seeded for this user → picker hides itself and the legacy JWT-claim
 * path handles routing.
 */
export async function fetchEntitlements(): Promise<Entitlements> {
  const token = getOidcToken();
  const resp = await axios.get<Entitlements>(`${API_URL}/me/entitlements`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    timeout: 5000,
  });
  return resp.data;
}

const api = axios.create({
  baseURL: API_URL,
  headers: { "Content-Type": "application/json" },
});

// Attach Bearer token and Trace ID to all REST requests
api.interceptors.request.use((cfg) => {
  const token = getOidcToken();
  if (token) {
    cfg.headers.Authorization = `Bearer ${token}`;
  }
  // Generate a unique trace ID for each request to link frontend actions to backend logs
  cfg.headers["X-Trace-Id"] = crypto.randomUUID();
  return cfg;
});

// ── HITL HumanTask queue (Slice 2 — workflow-ack) ───────────
/**
 * REST initial-load of the caller's pending queue. cortex-bff filters by
 * recipient_id = the caller's authz_id (the SAME key the Electric proxy
 * injects), so this and the live subscription agree by construction. The live
 * path is the Electric subscription; this is the on-open snapshot.
 */
export interface MyHumanTasksResponse {
  email: string;
  tasks: Array<Record<string, unknown>>;
}
export async function fetchMyHumanTasks(): Promise<MyHumanTasksResponse> {
  const { data } = await api.get<MyHumanTasksResponse>("/me/human_tasks");
  return data;
}

/**
 * Approve/reject a task. cortex-bff RE-CHECKS Topaz can_act (deny-by-default)
 * before acting; on approve of a workflow_ack task it resolves the Restate
 * promise so the suspended workflow resumes. `workflow_resumed` reflects that.
 */
export interface ActOnTaskResult {
  task_id: string;
  decision: string;
  rows_resolved: number;
  workflow_resumed?: boolean;
}
export async function actOnHumanTask(
  taskId: string,
  decision: "approved" | "rejected",
  comment = ""
): Promise<ActOnTaskResult> {
  const { data } = await api.post<ActOnTaskResult>(
    `/human_tasks/${encodeURIComponent(taskId)}/act`,
    { decision, comment }
  );
  return data;
}

/**
 * Bug 2 — Case-1 access request. A caller DENIED read on an asset asks for it.
 * Reuses the sealed Slice-3 substrate: this is ASYNC (creates a request
 * HumanTask routed to the domain's `access_grant:<domain>` approvers and
 * returns immediately — NO suspend, per the DoS ruling for query denials). The
 * grant SUBJECT is derived server-side from the caller's authz_id; we send only
 * the asset URN, the domain (approver audience), and an optional reason —
 * never a subject the client could spoof. An approver later writes the grant
 * (asset_grants.yaml), closing the deny→request→grant→allow loop.
 */
export interface CreateAccessRequestResult {
  request_id: string;
  status: string;
  approvers: number;
}
export async function createAccessRequest(req: {
  asset: string;
  domain?: string;
  reason?: string;
}): Promise<CreateAccessRequestResult> {
  // OMIT an empty domain so the backend's default approver audience applies —
  // sending `domain: ""` would route to `access_grant:` (zero approvers). The
  // routing normally carries the acting domain; this is the safety net.
  const body: { asset: string; reason: string; domain?: string } = {
    asset: req.asset,
    reason: req.reason ?? "",
  };
  if (req.domain) body.domain = req.domain;
  const { data } = await api.post<CreateAccessRequestResult>(
    "/access_requests",
    body
  );
  return data;
}

/**
 * Parses a single SSE block (event + data) into a StreamEvent.
 * SSE format: "event: <type>\ndata: <json>\n\n"
 *
 * Option A clean cut (2026-06-22): the legacy `status` event is no
 * longer parsed. The gateway has been updated to emit typed events
 * (`pipeline_stage`, `pipeline_error`, etc.) instead. If a legacy
 * gateway is still emitting `status`, those events are now dropped
 * silently — verify gateway version >= the Option A roll before
 * upgrading the UI.
 */
function parseSSE(eventType: string, dataStr: string): StreamEvent | null {
  try {
    const parsed = dataStr ? JSON.parse(dataStr) : {};
    switch (eventType) {
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
      // ── Typed grounding-panel events ─────────────────
      case "pipeline_stage": {
        return {
          type: "pipeline_stage",
          kind: parsed.kind,
          status: parsed.status,
          detail: parsed.detail,
          elapsed_ms: parsed.elapsed_ms,
        };
      }
      case "pipeline_error": {
        return {
          type: "pipeline_error",
          kind: parsed.kind,
          message: parsed.message ?? "Pipeline error",
          retryable: parsed.retryable,
          cause: parsed.cause,
        };
      }
      case "route_decision": {
        return { type: "route_decision", decision: parsed };
      }
      case "sources": {
        return { type: "sources", sources: parsed.sources ?? parsed };
      }
      case "graph_trace": {
        return {
          type: "graph_trace",
          nodes: parsed.nodes ?? parsed,
          alternates: parsed.alternates ?? [],
        };
      }
      case "access_denied": {
        return {
          type: "access_denied",
          denied_assets: parsed.denied_assets ?? [],
          subject: parsed.subject ?? "",
          domain: parsed.domain ?? "",
          message:
            parsed.message ?? "You don't have access to the requested data.",
        };
      }
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

  const ctrl = new AbortController();
  if (signal) {
    signal.addEventListener("abort", () => ctrl.abort());
  }

  await fetchEventSource(`${API_URL}/interview/stream`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Trace-Id": crypto.randomUUID(),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(request),
    signal: ctrl.signal,
    // CRITICAL: @microsoft/fetch-event-source by default binds a
    // visibilitychange listener that ABORTS the active SSE connection
    // when the tab loses focus and CREATES a brand new one when the
    // tab is shown again (see node_modules/@microsoft/fetch-event-source
    // /lib/esm/fetch.js, function onVisibilityChange).
    //
    // For a regular GET-based EventSource that pattern is fine because
    // the server replays from `Last-Event-ID`. For OUR endpoint,
    // /interview/stream is a POST that LAUNCHES a Dagster supervisor
    // job — so each lib-driven "reopen" produces a brand new POST that
    // either triggers a NEW Dagster run (when session_id happens to
    // change across reopens) or re-renders the early status events
    // (when DagsterRunTracker dedups). The user-visible "Analyzing
    // intent... / Analyzing intent..." loop with the elapsed counter
    // reset is exactly this: the user switched tabs (to look at
    // Dagster, the response, etc.) and on return the lib silently
    // reopened the connection.
    //
    // openWhenHidden: true tells the lib NOT to bind the
    // visibilitychange listener at all. The in-flight stream survives
    // tab switches. This is the correct setting for any POST-based SSE
    // that triggers stateful backend work — losing the connection
    // mid-orchestration cannot be made cheap by replay.
    openWhenHidden: true,
    async onopen(response) {
      if (response.ok && response.headers.get('content-type')?.startsWith('text/event-stream')) {
        return; // everything's good
      }
      // Throw the response so the onerror handler can intercept HTTP errors (like 401)
      throw response;
    },
    onmessage(msg) {
      if (msg.event === "stream_end") {
        onEvent({ type: "stream_end" });
        ctrl.abort(); // Prevent fetchEventSource from retrying
        return;
      }
      const event = parseSSE(msg.event, msg.data);
      if (event) {
        onEvent(event);
      }
    },
    onclose() {
      // If the server closes the connection cleanly but we haven't aborted,
      // do NOT retry. This is a POST request that triggers a new job.
      throw new Error("Server closed the connection unexpectedly.");
    },
    onerror(err) {
      console.error("SSE Stream Error:", err);
      
      // If the BFF throws a 401, tell the user to log in again!
      if (err instanceof Response && err.status === 401) {
          alert("Your session has expired. Please log in again.");
          window.location.href = "/"; // Redirect to root/login
          throw err;
      }
      
      // Re-throw for all other network errors
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

// ── Canvas persistence (ADR-0028) ────────────────────────
/** The caller's durable custom canvases (server-side, cross-device). Shape is
 *  the client's CustomCanvas[] stored verbatim. */
export async function fetchCanvases(): Promise<unknown[]> {
  const { data } = await api.get<{ canvases: unknown[] }>("/me/canvases");
  return data.canvases ?? [];
}
export async function saveCanvases(canvases: unknown[]): Promise<void> {
  await api.put("/me/canvases", { canvases });
}

// ── Mesh Config ──────────────────────────────────────────
export async function getMeshConfig(): Promise<any> {
  const { data } = await api.get("/mesh/config");
  return data;
}

// ── Decision-path MAP base layer ─────────────────────────
/**
 * Fetch the bounded live-graph neighborhood for the decision map. The
 * frontend holds the captured decision and diffs it against this. Network
 * failure surfaces as the COULDN'T-CHECK state — the caller renders
 * "captured-only, cannot verify", never an empty map.
 */
export async function fetchDecisionSubgraph(
  request: DecisionSubgraphRequest,
): Promise<DecisionSubgraphResponse> {
  try {
    const { data } = await api.post<DecisionSubgraphResponse>(
      "/decision_subgraph",
      request,
    );
    return data;
  } catch (e) {
    // The transport itself failed — treat as couldn't-check, same shape
    // the backend returns on a live-read failure. Never fabricate a base
    // layer; the map must say it couldn't verify.
    return {
      available: false,
      reason: `request failed: ${e instanceof Error ? e.message : String(e)}`,
      live_nodes: [],
      live_edges: [],
      context_nodes: [],
      ancestor_chain: [],
    };
  }
}

// ── ADR-0017 frontend self-registration ──────────────────
/**
 * Advertise this frontend's presentation capabilities to cortex-bff.
 *
 * Best-effort: if the call fails (network, server not yet upgraded,
 * etc.) we log + swallow. Engine F's in-memory default table covers the
 * same archetypes today, so a failed registration degrades to "Engine F
 * speaks for cortex-ui" — exactly the state we're trying to retire.
 */
export interface FrontendCapabilityPayload {
  subject_uri: string;
  object_uri: string;
  archetype: string;
  component?: string;
  layout?: string;
  expected_fields?: string[];
  persona_fit?: string[];
  domain_fit?: string[];
}

export async function registerFrontendCapabilities(payload: {
  frontend_id: string;
  frontend_version: string;
  capabilities: FrontendCapabilityPayload[];
}): Promise<{ accepted: number; frontend_id: string }> {
  const { data } = await api.post("/register_frontend_capabilities", payload);
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
