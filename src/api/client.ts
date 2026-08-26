import axios from "axios";
import { fetchEventSource } from "@microsoft/fetch-event-source";
import { config } from "@/config";
import { CORTEX_UI_FRONTEND_ID } from "@/registry/frontendCapabilities";
import type { Disposition } from "@/lib/dispositions";
import type { ReviewBatch } from "@/components/GroupedReview/types";
import type { ProvenanceItem } from "@/components/Evidence/EvidenceCard";
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
    // 15s, not 5s. DEFENCE, not the fix: under HTTP/1.1 the browser caps ~6 connections per
    // origin, Electric holds two live shapes, and a bootstrap request can sit unsent past a 5s
    // deadline without the server ever seeing it. The ordering change (fetch on auth-ready,
    // ahead of shape subscriptions) is the actual repair; this only stops a queued request from
    // being abandoned before it is dispatched.
    timeout: 15000,
  });
  return resp.data;
}

const api = axios.create({
  baseURL: API_URL,
  headers: { "Content-Type": "application/json" },
});

/**
 * A stable per-conversation session id. Unlike X-Trace-Id (minted fresh per request),
 * this persists for the browser tab's session — surviving navigations within one sitting,
 * resetting on a new tab — so Langfuse can group a whole conversation's traces into one
 * Session (ADR-0038). sessionStorage is already the app's session-grain store (OIDC,
 * persona), so this rides the same lifetime.
 */
function getSessionId(): string {
  const KEY = "cortex-session-id";
  let sid = sessionStorage.getItem(KEY);
  if (!sid) {
    sid = crypto.randomUUID();
    sessionStorage.setItem(KEY, sid);
  }
  return sid;
}

// Attach Bearer token, Trace ID (per request) and Session ID (per sitting) to all REST requests
api.interceptors.request.use((cfg) => {
  const token = getOidcToken();
  if (token) {
    cfg.headers.Authorization = `Bearer ${token}`;
  }
  // Generate a unique trace ID for each request to link frontend actions to backend logs
  cfg.headers["X-Trace-Id"] = crypto.randomUUID();
  // Stable session id groups this conversation's traces in Langfuse (see getSessionId)
  cfg.headers["X-Session-Id"] = getSessionId();
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
  rows_resolved?: number;
  workflow_resumed?: boolean;
  // grouped_review bridge: the /act handler validates the decision against the durable workflow
  // (submit_decision) and only resolves the projection on acceptance. A policy-refused submission
  // (e.g. an unverified row riding accept-all) comes back accepted:false + status "still_pending".
  accepted?: boolean;
  status?: string;
  review_dispatched?: boolean;
  resolved_count?: number;
  reason?: string;
}
/** The verbs a task may be acted on with. PER SPECIES, not universal: a triage task ("this
 *  notice could not be prepared for review") takes acknowledged/redriven, and the API REFUSES
 *  approved/rejected on it with 422 — storing "approved" on an extraction failure writes a
 *  decision the data cannot represent, which ADR-0034's records would then archive immutably
 *  as promotion evidence. The server is the authority; this union only stops the wrong verb
 *  being spelled here. */
export type TaskDecision = "approved" | "rejected" | "acknowledged" | "redriven";

export async function actOnHumanTask(
  taskId: string,
  decision: TaskDecision,
  comment = "",
  // grouped_review only: per-part exceptions {mpn: {disposition, reason}}. Absent/empty = accept-all.
  overrides?: Record<string, { disposition: string; reason: string }>
): Promise<ActOnTaskResult> {
  const body: Record<string, unknown> = { decision, comment };
  if (overrides && Object.keys(overrides).length > 0) body.overrides = overrides;
  const { data } = await api.post<ActOnTaskResult>(
    `/human_tasks/${encodeURIComponent(taskId)}/act`,
    body
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
 * PCN/PDN grouped review — the reviewer fetches the batch, then resolves it in ONE action
 * (accept-all-with-exceptions) THROUGH the /act bridge. The client sends ONLY the exceptions
 * (`overrides` on actOnHumanTask); every other item takes its system-proposed disposition. Each
 * override MUST carry a reason (capture-why is structural). submit_decision re-checks the batch,
 * resolves the grouped HumanTask, and fans out — one durable submission path (single decider), so the
 * old /review_batches/{id}/resolve endpoint (never implemented) is retired rather than left as a
 * second route someone later "fixes" by building it.
 */
export interface ReviewOverrideInput {
  mpn: string;
  disposition: Disposition;
  reason: string;
}
/** Fetch the reviewer's grouped-review batch (parts + proposed dispositions + needs_review flags) so
 *  the detail view can render it. Existence-oracle-safe server-side: 404 unless the caller holds this
 *  grouped task in their own queue. */
export async function fetchReviewBatch(workflowId: string): Promise<ReviewBatch> {
  const { data } = await api.get<ReviewBatch>(
    `/reviews/${encodeURIComponent(workflowId)}/batch`
  );
  return data;
}

/**
 * Fetch a notice's extraction PROVENANCE — the read-side join (at DISPLAY time,
 * NOT batch payload) between review values and the document regions they came
 * from. Extraction stays the authority; the graph's lossy projection isn't
 * widened. Used to summon the evidence card for a review part.
 */
export interface NoticeProvenanceResponse {
  notice_id: string;
  page_image_url?: string | null;
  items: ProvenanceItem[];
}
export async function fetchNoticeProvenance(noticeId: string): Promise<NoticeProvenanceResponse> {
  const { data } = await api.get<NoticeProvenanceResponse>(
    `/notices/${encodeURIComponent(noticeId)}/provenance`
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
    // ADR-0017 amendment: NAME OURSELVES. The archetype decision is valid only against
    // the render menu of the client that will render it, so the backend has to know which
    // frontend is asking. Same id used for capability registration -- one identity, one
    // menu. Merged here rather than at every call site so a caller cannot forget it.
    body: JSON.stringify({ frontend_id: CORTEX_UI_FRONTEND_ID, ...request }),
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

// ── ADR-0042 live views: the invalidation signal and the recomputation trigger ──────────
/**
 * THE SEAM. Both functions below are the single place the live-view refresh loop touches the
 * network, so when the server half lands the change is here and nowhere else.
 *
 * Per ADR-0042 §3 the measure is a verb and runs where verbs run — so the client NEVER
 * recomputes and never patches rows. It reads a version, and it asks the server to
 * re-evaluate. The recomputed content comes back the way all content comes back: the writer
 * persists it, the projector projects it, Electric delivers it.  and
 * `rendered_output` and `valid_as_of` are Electric-covered fields and the client may not
 * write either.
 */

/** The plan scenario's current state version. Bumps when an op changes plan state. */
export async function fetchPlanStateVersion(): Promise<number> {
  const { data } = await api.get<{ state_version: number }>("/plan/state_version");
  return data.state_version;
}

/**
 * Ask the server to re-evaluate one live view. Returns nothing on purpose: the answer does
 * not come back through this call. It lands as an updated projection row via Electric,
 * carrying its OWN valid_as_of stamped at evaluation — which is what makes a refreshed card
 * visibly fresh rather than silently newer.
 */
export async function requestReevaluation(artifactId: string): Promise<void> {
  await api.post("/artifacts/reevaluate", { artifact_id: artifactId });
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

/** Directed 1-hop DataHub lineage edges among the given answered subjects, for
 *  canvas GRAPH mode. Proxied through the gateway → Engine D's GATED endpoint
 *  (the caller's entitlement is applied server-side; lineage they can't see is
 *  never returned). Honest-empty on failure. */
export interface LineageEdgeDTO {
  from: string;
  to: string;
  kind: string;
  directed: boolean;
}
export async function fetchLineageEdges(
  subjects: { answer_id: string; urn: string }[],
): Promise<LineageEdgeDTO[]> {
  try {
    const { data } = await api.post<{ edges: LineageEdgeDTO[] }>(
      "/canvas/lineage_edges",
      { subjects },
    );
    return data.edges ?? [];
  } catch {
    return [];
  }
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
