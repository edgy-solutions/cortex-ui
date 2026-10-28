import axios, { type AxiosRequestConfig, type AxiosResponse } from "axios";
import { fetchEventSource } from "@microsoft/fetch-event-source";
import { config } from "@/config";
import { CORTEX_UI_FRONTEND_ID } from "@/registry/frontendCapabilities";
import { isSendFrontendVersionEnabled, loadFrontendVersion } from "@/lib/frontendVersion";
import type { Disposition } from "@/lib/dispositions";
import type { ReviewBatch } from "@/components/GroupedReview/types";
import type { ProvenanceItem } from "@/components/Evidence/EvidenceCard";
import { readExportRecipients, type ExportRecipient } from "@/lib/canvasExport";
import { readProvenanceFloor, type IngestLeaf } from "@/lib/ingestWire";
import { gatewayRelativePath } from "@/lib/illustrationPath";
import { readTaskKindsResponse } from "@/lib/taskDeclaration";
import { readSeedConflict, type AskBearingRefusal } from "@/lib/askBearingRefusal";
import {
  type StreamEvent,
  type InterviewRequest,
  type Entitlements,
  type DecisionSubgraphRequest,
} from "./types";
import type { Operations as BffOperations } from "./generated/bff";
import type { HeaderEdit_field, HumanTaskActRequest_reason_code } from "./generated/bff";
import type { Operations as V1Operations } from "./generated/ingestV1";

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

// ── The typed core ────────────────────────────────────────
// Every BFF call goes through request(): the op key names the route, and the argument types come
// from the generated OpenAPI types (src/api/generated/*, snapshot pinned in src/api/openapi/SOURCES.json).
// client.requestSeal.test.ts replays every exported function against the snapshot, so a path, a query
// key or a body key the BFF does not declare goes red here instead of being silently dropped by the server.
type BffOps = BffOperations;
export type OpKey = keyof BffOps;

/**
 * Operations whose RESPONSE type comes from the ingest-v1 document, because the BFF snapshot declares no
 * 200 schema for them yet (Lane 1: use v1 for response types until v1 merges to master).
 * openapi.seal.test.ts goes red the day the BFF snapshot declares one of these.
 *
 * EMPTY IS THE HEALTHY STATE. v1 merged, and the BFF snapshot at b59e4a0f declares a 200 schema for
 * all nine ops that were listed here (the expiry arm went red on every one), so each is typed from
 * bff.ts now. Add an op only when ingest-v1 declares its response and the pinned BFF does not.
 */
export const V1_SOURCED = [] as const satisfies readonly (keyof V1Operations & OpKey)[];
type V1Key = (typeof V1_SOURCED)[number];

export type Resp<K extends OpKey> = K extends V1Key ? V1Operations[K]["response"] : BffOps[K]["response"];

type Slot<N extends string, T> = [T] extends [never]
  ? { [P in N]?: undefined }
  : undefined extends T
    ? { [P in N]?: T }
    : Record<never, never> extends T
      ? { [P in N]?: T }
      : { [P in N]: T };
export type OpArgs<K extends OpKey> = Slot<"path", BffOps[K]["path"]> &
  Slot<"query", BffOps[K]["query"]> &
  Slot<"body", BffOps[K]["body"]>;

type LooseArgs = { path?: Record<string, string>; query?: Record<string, unknown>; body?: unknown };

function splitOp(op: string): [string, string] {
  const i = op.indexOf(" ");
  return [op.slice(0, i), op.slice(i + 1)];
}

function fillPath(template: string, path: Record<string, string> | undefined): string {
  return template.replace(/\{([^}]+)\}/g, (_m, name: string) => encodeURIComponent(String(path?.[name])));
}

/** The path (no origin) an op resolves to. */
export function opPath<K extends OpKey>(op: K, args: Slot<"path", BffOps[K]["path"]>): string {
  return fillPath(splitOp(op)[1], (args as LooseArgs).path);
}

async function send(
  method: string,
  url: string,
  a: LooseArgs,
  cfg?: AxiosRequestConfig,
): Promise<AxiosResponse<unknown>> {
  const config: AxiosRequestConfig | undefined =
    a.query !== undefined ? { ...cfg, params: a.query } : cfg;
  switch (method) {
    case "GET":
      return config ? api.get(url, config) : api.get(url);
    case "POST":
      return config ? api.post(url, a.body, config) : a.body !== undefined ? api.post(url, a.body) : api.post(url);
    case "PUT":
      return config ? api.put(url, a.body, config) : api.put(url, a.body);
    case "DELETE":
      return config ? api.delete(url, config) : api.delete(url);
    default:
      throw new Error(`request: unsupported method ${method}`);
  }
}

/** The whole axios response (status, headers) for a declared op. `request` returns only `.data`. */
export async function requestFull<K extends OpKey>(
  op: K,
  args: OpArgs<K>,
  cfg?: AxiosRequestConfig,
): Promise<AxiosResponse<Resp<K>>> {
  const [method, template] = splitOp(op);
  const a = args as LooseArgs;
  return (await send(method, fillPath(template, a.path), a, cfg)) as AxiosResponse<Resp<K>>;
}

export async function request<K extends OpKey>(
  op: K,
  args: OpArgs<K>,
  cfg?: AxiosRequestConfig,
): Promise<Resp<K>> {
  return (await requestFull(op, args, cfg)).data;
}

/** axios throws on non-2xx where fetch did not; callers that showed `${status} ${statusText}` keep that line. */
function throwStatusLine(e: unknown): never {
  const r = (e as { response?: { status?: number; statusText?: string } })?.response;
  if (r && typeof r.status === "number") throw new Error(`${r.status} ${r.statusText ?? ""}`.trimEnd());
  throw e;
}

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
  // The api instance's interceptor attaches the same Bearer token this call used to set by hand.
  const resp = await requestFull("GET /me/entitlements", {}, {
    // 15s, not 5s. DEFENCE, not the fix: under HTTP/1.1 the browser caps ~6 connections per
    // origin, Electric holds two live shapes, and a bootstrap request can sit unsent past a 5s
    // deadline without the server ever seeing it. The ordering change (fetch on auth-ready,
    // ahead of shape subscriptions) is the actual repair; this only stops a queued request from
    // being abandoned before it is dispatched.
    timeout: 15000,
  });
  return resp.data;
}

// ── HITL HumanTask queue (Slice 2 — workflow-ack) ───────────
/**
 * REST initial-load of the caller's pending queue. cortex-bff filters by
 * recipient_id = the caller's authz_id (the SAME key the Electric proxy
 * injects), so this and the live subscription agree by construction. The live
 * path is the Electric subscription; this is the on-open snapshot.
 */
export type MyHumanTasksResponse = Resp<"GET /me/human_tasks">;
export async function fetchMyHumanTasks(): Promise<MyHumanTasksResponse> {
  return request("GET /me/human_tasks", {});
}

/**
 * Approve/reject a task. cortex-bff RE-CHECKS Topaz can_act (deny-by-default)
 * before acting; on approve of a workflow_ack task it resolves the Restate
 * promise so the suspended workflow resumes. `workflow_resumed` reflects that.
 */
/**
 * `/act` answers one of seven declared shapes (ActGeneric | ActPromotion | Empty* | ActGrouped*), told apart
 * by which fields are present. Every field below IS declared, on at least one member; this view lays the
 * union's keys out as optional so a consumer can ask `res.stage` without a narrowing it does not need
 * (a missing key reads `undefined`, which every reader already treats as "not this shape"). The response
 * seal checks reads against the union of all seven.
 */
type AllKeys<U> = U extends unknown ? keyof U : never;
type Loosened<U> = { [K in AllKeys<U>]?: U extends unknown ? (K extends keyof U ? U[K] : never) : never };
export type ActOnTaskResult = Loosened<Resp<"POST /human_tasks/{task_id}/act">>;
/** The verbs a task may be acted on with. PER SPECIES, not universal: a triage task ("this
 *  notice could not be prepared for review") takes acknowledged/redriven, and the API REFUSES
 *  approved/rejected on it with 422 — storing "approved" on an extraction failure writes a
 *  decision the data cannot represent, which ADR-0034's records would then archive immutably
 *  as promotion evidence. The server is the authority; this union only stops the wrong verb
 *  being spelled here. */
/**
 * A DECIDED VERB, AND THE DECLARATION IS THE AUTHORITY ON WHICH ONES EXIST.
 *
 * This was a closed union of four — approved, rejected, acknowledged, redriven — and the
 * deployment accepts verbs it cannot express: `accepted`, `returned_for_rework`, `concurred`,
 * `not_concurred`, `linked`, `new_hazard`, `dismissed`. A High risk acceptance takes
 * `accepted` and the gate REFUSES `approved`, so the union could not even spell the right
 * answer for a species already in the fleet.
 *
 * WIDENED RATHER THAN EXTENDED. A union here is a second source of truth that has to be edited
 * every time an overlay declares a species — by someone who does not know this file exists, and
 * until they do the verb cannot be sent. That is the same argument as the extra-columns
 * denylist: the served declaration names the vocabulary, so the client's job is to carry it,
 * not to re-state it.
 *
 * The four originals are kept as documentation of what the structural seed declares; they are
 * no longer a constraint.
 */
export type TaskDecision = string;
/** What the structural seed declares. A HINT for readers — the declaration is the authority. */
export const SEED_TASK_DECISIONS = ["approved", "rejected", "acknowledged", "redriven"] as const;

/**
 * grouped_review row edits — the platform's `RowEdits` (invincible-agent src/iagent/gateway.py
 * DeletedRow / AddedRow / CorrectedRow, `extra="forbid"`, every string non-blank). Accepted by the
 * live fleet since 49aa5e28 (Lane 1 packet 2026-10-12). Sealed key-for-key by rowEditsWireParity.test.ts.
 */
/** A steward correction of one header field of a promotion (gateway.py HeaderEdit, extra="forbid", every string non-blank). Sent top-level as `header_edits`, promote only. */
export interface HeaderEdit {
  /** The `HeaderEdit.field` enum of the BFF snapshot (generated `HeaderEdit_field`); not a hand union. */
  field: (typeof HeaderEdit_field)[number];
  value: string;
  evidence_ref: string;
  reason: string;
}

export interface RowEdits {
  deleted: { mpn: string; reason: string }[];
  added: { mpn: string; disposition: string; reason: string; evidence: string }[];
  /** `mpn` is the EXTRACTED value (identity never moves); `corrected_mpn` is the approver's text. */
  corrected: { mpn: string; corrected_mpn: string; evidence: string }[];
}

/** The four `reason_code` values a grouped-review REJECT may carry: gateway.py _GROUPED_REJECT_CODES, which the
 *  architect ruled equal to promotion.py's PROMOTION_REJECT_CODES (every reject surface takes the same four). */
export type GroupedRejectCode = (typeof HumanTaskActRequest_reason_code)[number];

/**
 * The /act request body. `HumanTaskActRequest` refuses `reason_code` on anything but `rejected` and
 * `row_edits` on anything but `approved`/`promoted` (its `_verb_fields` validator), so each is emitted ONLY for
 * its own verb, whatever the caller passes. NOTE the request model itself is plain `_BaseModel` and
 * DROPS an undeclared key silently; only the row models are `extra="forbid"`. So a misspelt
 * top-level key is not a 422, it is lost: rowEditsWireParity.test.ts checks each key is declared. Empty `row_edits` is omitted (the platform defaults it).
 */
export function buildActBody(
  decision: TaskDecision,
  comment = "",
  overrides?: Record<string, { disposition: string; reason: string }>,
  rowEdits?: RowEdits,
  reasonCode?: GroupedRejectCode,
  headerEdits?: HeaderEdit[],
  // document review card only. // PROPOSED (unratified): see src/lib/documentReview.ts
  sectionVerdicts?: unknown[],
  // document_empty_confirm has_parts only (spec 208).
  page?: number
): Record<string, unknown> {
  const body: Record<string, unknown> = { decision, comment };
  if (overrides && Object.keys(overrides).length > 0) body.overrides = overrides;
  if ((decision === "approved" || decision === "promoted") && rowEdits && (rowEdits.deleted.length || rowEdits.added.length || rowEdits.corrected.length)) {
    body.row_edits = rowEdits;
  }
  if (decision === "rejected" && reasonCode) body.reason_code = reasonCode;
  if (decision === "promoted" && headerEdits && headerEdits.length > 0) body.header_edits = headerEdits;
  if (sectionVerdicts && sectionVerdicts.length > 0) body.section_verdicts = sectionVerdicts; // PROPOSED (unratified)
  // `HumanTaskActRequest.page` is refused (422 page_not_for_decision) on anything but `has_parts`, and
  // `_StrictInt` refuses a non-integer: send it ONLY there, and only a whole page number >= 1.
  if (decision === "has_parts" && typeof page === "number" && Number.isInteger(page) && page >= 1) body.page = page;
  return body;
}

export async function actOnHumanTask(
  taskId: string,
  decision: TaskDecision,
  comment = "",
  // grouped_review only: per-part exceptions {mpn: {disposition, reason}}. Absent/empty = accept-all.
  overrides?: Record<string, { disposition: string; reason: string }>,
  // grouped_review approve or document_promotion promote: steward row edits, sent as `row_edits` only when non-empty.
  rowEdits?: RowEdits,
  // grouped_review reject only: REQUIRED by the platform (422 reason_code_required without it).
  reasonCode?: GroupedRejectCode,
  // document_promotion promote only: steward corrections of mfr / notice_id / notice_date.
  headerEdits?: HeaderEdit[],
  // document review card only: the per-section verdicts, sent only when provided.
  sectionVerdicts?: unknown[],
  // document_empty_confirm has_parts only: the 1-based page the steward saw a part on.
  page?: number
): Promise<ActOnTaskResult> {
  const body = buildActBody(decision, comment, overrides, rowEdits, reasonCode, headerEdits, sectionVerdicts, page);
  return request("POST /human_tasks/{task_id}/act", {
    path: { task_id: taskId },
    body: body as BffOps["POST /human_tasks/{task_id}/act"]["body"],
  });
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
  const data = await request("POST /access_requests", { body });
  return data as CreateAccessRequestResult;
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
  const data = await request("GET /reviews/{workflow_id}/batch", { path: { workflow_id: workflowId } });
  return data as ReviewBatch;
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
  const data = await request("GET /notices/{notice_id}/provenance", { path: { notice_id: noticeId } });
  return data as NoticeProvenanceResponse;
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
/** Exported for tests: the pure SSE event parse. */
export function parseSSE(eventType: string, dataStr: string): StreamEvent | null {
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
        return {
          type: "sources",
          sources: parsed.sources ?? parsed,
          provenance_floor: Array.isArray(parsed) ? null : readProvenanceFloor(parsed),
        };
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
 * The /interview/stream body. `frontend_version` is present ONLY when VITE_SEND_FRONTEND_VERSION
 * is on (key absent otherwise, never undefined/null). The platform DISCARDS this field until
 * `InterviewRequest` declares it (gateway.py:3798 as of IA 520755bb); the flag stays OFF until
 * Lane 1's packet names it. The value is the memoised, already-resolved load-time promise.
 */
export async function buildInterviewBody(request: InterviewRequest): Promise<string> {
  const version = isSendFrontendVersionEnabled()
    ? { frontend_version: await loadFrontendVersion() }
    : {};
  return JSON.stringify({ frontend_id: CORTEX_UI_FRONTEND_ID, ...version, ...request });
}

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
  const body = await buildInterviewBody(request);

  const ctrl = new AbortController();
  if (signal) {
    signal.addEventListener("abort", () => ctrl.abort());
  }

  await fetchEventSource(`${API_URL}${opPath("POST /interview/stream", {})}`, {
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
    body,
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

// ── Canvas seeding ─────────────────────────────────────────────────────────────────────
/**
 * Seed a canvas for ONE TEMPLATE, by id -- the route is the one declaration of whether it can.
 *
 * Sends only fields `CanvasSeedRequest` declares: `template_id`, `bindings`, and the cell
 * (`active_persona` / `active_domains`) when the caller has one. A required shared slot left
 * unbound answers 409 with the ask that would unblock it; that is returned as a `conflict`,
 * not thrown, because it is a question and not a failure. Anything else is `error`, untouched.
 *
 * The seed is sequential server-side and takes minutes; the caller owns the pending state.
 */
export type TemplateSeedResult =
  | { ok: true; artifactIds: string[] }
  | { ok: false; conflict: AskBearingRefusal }
  | { ok: false; error: unknown };

export async function requestTemplateCanvasSeed(
  templateId: string,
  bindings?: Record<string, string>,
  cell?: { active_persona?: string; active_domains?: string[] },
): Promise<TemplateSeedResult> {
  const body: BffOps["POST /canvas/seed"]["body"] = { template_id: templateId };
  if (bindings && Object.keys(bindings).length > 0) body.bindings = bindings;
  if (cell?.active_persona) body.active_persona = cell.active_persona;
  if (cell?.active_domains) body.active_domains = cell.active_domains;
  try {
    const data = await request("POST /canvas/seed", { body });
    const raw = Array.isArray(data?.artifact_ids) ? data.artifact_ids : [];
    return {
      ok: true,
      artifactIds: raw.filter((v): v is string => typeof v === "string" && v.length > 0),
    };
  } catch (err) {
    const conflict = readSeedConflict(err);
    return conflict ? { ok: false, conflict } : { ok: false, error: err };
  }
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

/**
 * A plan ref's current state version. Bumps when an op changes that ref's state.
 *
 * `stateRef` IS NOT OPTIONAL DECORATION. Ops apply to SCENARIOS; baseline's version moves only
 * through the commit ceremony. Polling without a ref reads baseline — which, during a drag
 * session, never moves. That poll succeeds, reports no change, and the refresh loop stays
 * silent while the plan it is supposed to be watching changes underneath it: a loop that looks
 * like it works and never fires.
 *
 * The server echoes `state_ref` back so a caller can see which plan it was answered about.
 */
export async function fetchPlanStateVersion(stateRef?: string): Promise<number> {
  const data = (await request(
    "GET /plan/state_version",
    stateRef ? { query: { state_ref: stateRef } } : {},
  )) as { state_ref: string; state_version: number };
  return data.state_version;
}

/**
 * Fork a scenario — the sandbox a drag happens in.
 *
 * Resolves on 409 rather than throwing. A duplicate id means the scenario this client wanted
 * ALREADY EXISTS, which is the state the caller was trying to reach; treating "it is already
 * there" as a failure would make the second drag of a session fail for having succeeded the
 * first time.
 */
export async function forkPlanScenario(
  scenarioId: string,
  name: string,
): Promise<void> {
  try {
    await request("POST /plan/scenario", { body: { scenario_id: scenarioId, name } });
  } catch (err: unknown) {
    const status = (err as { response?: { status?: number } })?.response?.status;
    if (status !== 409) throw err;
  }
}

/**
 * THE DRAG. One call, TWO ops — and the second one is derived server-side.
 *
 * `MoveProject` alone moves the bar and not the load, because site-impact windows are
 * deliberately independent of project windows. This client cannot derive the impact op: it
 * holds no site-impact data at all, so a UI that sent one would be inventing it. The policy
 * runs where the state is and appends both, offset-preserved.
 *
 * Returns the scenario's NEW VERSION, which is what makes the refresh immediate rather than
 * poll-latent.
 */
export async function reschedulePlanProject(args: {
  scenarioId: string;
  projectId: string;
  start: string;
  end: string;
}): Promise<{ scenario_id: string; version: number; ops: string[] }> {
  const data = await request("POST /plan/scenario/{scenario_id}/reschedule", {
    path: { scenario_id: args.scenarioId },
    body: { project_id: args.projectId, start: args.start, end: args.end },
  });
  return data as { scenario_id: string; version: number; ops: string[] };
}

// ── Reads that used to be raw fetches inside components ───
/** GET /data_module/figures?uri= -- shared by InlineFigures and FiguresSlideIn. A non-2xx throws `<status> <statusText>`, as the fetch sites did. */
export async function fetchDataModuleFigures(uri: string): Promise<unknown> {
  try {
    return await request("GET /data_module/figures", { query: { uri } });
  } catch (e) {
    return throwStatusLine(e);
  }
}

/** GET /graph/node/{node_id} (NodeInspector's raw-JSON debug pane). A non-2xx throws `<status> <statusText>`. */
export async function fetchGraphNode(nodeId: string): Promise<unknown> {
  try {
    return await request("GET /graph/node/{node_id}", { path: { node_id: nodeId } });
  } catch (e) {
    return throwStatusLine(e);
  }
}

/** GET /federated_image?src= -- a binary body. A non-2xx rejects with the axios error (`response.status` is the caller's signal). */
export async function fetchFederatedImage(src: string): Promise<Blob> {
  const data = await request("GET /federated_image", { query: { src } }, { responseType: "blob" });
  return data as Blob;
}

// ── Canvas persistence (ADR-0028) ────────────────────────
/** The caller's durable custom canvases (server-side, cross-device). Shape is
 *  the client's CustomCanvas[] stored verbatim. */
export async function fetchCanvases(): Promise<unknown[]> {
  const data = (await request("GET /me/canvases", {})) as { canvases: unknown[] };
  return data.canvases ?? [];
}
export async function saveCanvases(canvases: unknown[]): Promise<void> {
  await request("PUT /me/canvases", { body: { canvases } });
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
    const data = (await request("POST /canvas/lineage_edges", { body: { subjects } })) as {
      edges: LineageEdgeDTO[];
    };
    return data.edges ?? [];
  } catch {
    return [];
  }
}

// ── Mesh Config ──────────────────────────────────────────
export async function getMeshConfig(): Promise<any> {
  return request("GET /mesh/config", {});
}

// ── Decision-path MAP base layer ─────────────────────────
/**
 * Fetch the bounded live-graph neighborhood for the decision map. The
 * frontend holds the captured decision and diffs it against this. Network
 * failure surfaces as the COULDN'T-CHECK state — the caller renders
 * "captured-only, cannot verify", never an empty map.
 */
export type SubgraphNode = {
  uri: string;
  labels?: string[];
};
export type SubgraphEdge = {
  source: string;
  target: string;
  type: string;
};
/**
 * The producer declares the three node/edge lists as arrays of open objects, so the fields cortex reads
 * off them (`uri`, `labels`, `source`, `target`, `type`) are not declared: AWAITING_DECLARATION below,
 * typed here and only here.
 */
export type DecisionSubgraphResponse = Omit<
  Resp<"POST /decision_subgraph">,
  "live_nodes" | "live_edges" | "context_nodes"
> & {
  live_nodes?: SubgraphNode[];
  live_edges?: SubgraphEdge[];
  context_nodes?: SubgraphNode[];
};
export async function fetchDecisionSubgraph(
  req: DecisionSubgraphRequest,
): Promise<DecisionSubgraphResponse> {
  try {
    // The one assertion left on a typed read: the ledgered reads (AWAITING_DECLARATION) narrow the producer's open
    // objects to the fields cortex reads off them. A widening to `unknown` is not needed, only the narrowing.
    return (await request("POST /decision_subgraph", { body: req })) as DecisionSubgraphResponse;
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

export type RegisterFrontendCapabilitiesResult = Resp<"POST /register_frontend_capabilities">;
export async function registerFrontendCapabilities(payload: {
  frontend_id: string;
  frontend_version: string;
  capabilities: FrontendCapabilityPayload[];
}): Promise<RegisterFrontendCapabilitiesResult> {
  return request("POST /register_frontend_capabilities", { body: payload });
}

// ── Health Check ─────────────────────────────────────────
export async function healthCheck(): Promise<boolean> {
  try {
    const { status } = await requestFull("GET /health", {});
    return status === 200;
  } catch {
    return false;
  }
}

// ── Fleet version (what is actually serving) ──────────────
/**
 * The BFF's own build, from `GET /fleet/version`'s `self`.
 *
 * ONLY `self` IS READ HERE. That endpoint also fans out across the mesh and returns
 * `services`, `distinct_shas`, `asked` and `unreachable` — a fleet census, which is a
 * different surface with a different audience. The header answers one question ("what is
 * serving me"), and pulling the whole census to render one field would put a fan-out behind a
 * status line.
 *
 * ── WHY THIS RETURNS A REASON AND NOT NULL ────────────────────────────────────────────────
 *
 * It caught everything and returned null, so the header said UNREACHABLE for a BFF that was up
 * and serving picks and had simply 404'd an endpoint it does not have yet. Two states, opposite
 * repairs — roll the backend, versus go and find out why the service is down — and one word
 * covering both. Reported by the person who was looking at it, in the same week this codebase
 * separated absent from refused twice and could-not-reach from reached-and-empty once.
 *
 * A RESPONSE IS AN ANSWER, whatever its status. The discriminator is whether the service spoke
 * at all: axios attaches `response` when it did, and does not when the request never landed.
 */
export interface ServiceVersion {
  component?: string;
  repo?: string;
  git_sha?: string | null;
  built_at?: string | null;
  image_tag?: string | null;
}

export type BffVersionResult =
  /** It answered and reported its build. */
  | { kind: "ok"; version: ServiceVersion }
  /** It answered, with no such endpoint. The repair is a roll, not a rescue. */
  | { kind: "no_endpoint" }
  /** It answered, and the call failed for some other reason. The status is carried because
   *  401 and 500 are different problems and neither is "no endpoint". */
  | { kind: "error"; status: number }
  /** Nothing came back at all — DNS, connection refused, timeout, offline. */
  | { kind: "unreachable" };

/** The producer declares /fleet/version as an open object, so `self` is undeclared: AWAITING_DECLARATION. */
type FleetVersionResponse = Resp<"GET /fleet/version"> & { self?: ServiceVersion };
export async function fetchBffVersion(): Promise<BffVersionResult> {
  try {
    const data = (await request("GET /fleet/version", {})) as FleetVersionResponse;
    return { kind: "ok", version: data?.self ?? {} };
  } catch (err: unknown) {
    const status = (err as { response?: { status?: number } })?.response?.status;
    // NO `response` MEANS NOTHING ANSWERED. With one, the service replied — it is up, and the
    // reply is the finding.
    if (typeof status !== "number") return { kind: "unreachable" };
    if (status === 404) return { kind: "no_endpoint" };
    return { kind: "error", status };
  }
}

/**
 * Save the canvases when the page is about to go away.
 *
 * `keepalive` is the whole point: a normal fetch is CANCELLED when the document unloads, so a
 * flush-on-unload written with the ordinary client would have looked implemented and changed
 * nothing — the request would be created and then killed microseconds later. This is the one
 * place in this client that bypasses the axios wrapper, and the reason is that axios has no
 * way to set it.
 *
 * transport-exception: `keepalive` is a fetch-only option with no axios equivalent, and it is
 * required for a request that must outlive its document. Same bearer, same cortex-bff route as
 * `saveCanvases`; nothing about the authorisation path changes.
 */
export async function saveCanvasesUrgently(canvases: unknown[]): Promise<void> {
  const url = `${API_URL}${opPath("PUT /me/canvases", {})}`;
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  const auth = api.defaults.headers.common?.Authorization;
  if (typeof auth === "string" && auth) headers.Authorization = auth;
  try {
    await fetch(url, {
      method: "PUT",
      headers,
      body: JSON.stringify({ canvases }),
      keepalive: true,
    });
  } catch {
    // The page is leaving. There is no retry to schedule and nobody to tell — the durable
    // fallback is the store's own localStorage copy, which has already been written.
  }
}

// ── Task-kind declarations (the served menu) ──────────────
/**
 * THE RATIFIED TEMPLATE MENU — R-039's read path, the companion to `/task_kinds`.
 *
 * Before this, the only way to learn what boards exist was to SEED one and see whether the id
 * was recognised. A picker cannot be built out of guesses.
 *
 * ⛔ RETURNS THE ENVELOPE, NOT A BARE LIST, because the producer distinguishes three states and
 * flattening them here would destroy the distinction at the first seam:
 *
 *   composed true,  templates non-empty  the menu
 *   composed true,  templates empty      genuinely nothing is ratified
 *   composed FALSE                       the directory could not be READ — NOT an empty menu
 *
 * The third is a deployment accident that would otherwise render as a complete menu with nothing
 * in it, which is the same None-is-not-empty rule `/task_kinds` turns on.
 *
 * `null` is a FOURTH state and distinct again: the endpoint was unreachable, so cortex knows
 * nothing rather than knowing there is nothing.
 */
export async function fetchTemplates(): Promise<unknown | null> {
  try {
    const data = await request("GET /templates", {});
    return data ?? null;
  } catch {
    return null;
  }
}

/**
 * Every declared task species, from `GET /task_kinds`.
 *
 * THE WHOLE MENU, FETCHED ONCE, rather than a declaration threaded onto each row. The
 * declaration is a property of the KIND and not of the task, and carrying it per row would mean
 * plumbing it through BOTH task producers — the REST seed and the Electric projection — and
 * then defending it against the projection replacing a seeded row with one that has no such
 * column. That is the shape the `answered_with` comment in the canvas store already describes,
 * and the `payload` comment in the Electric mapper describes again: two producers, one field,
 * and a card whose content vanishes when the live path overwrites the seeded one.
 *
 * It also answers for an EMPTY queue, which a per-row field cannot: a filter or a legend needs
 * the species that exist, not the ones that happen to have tasks.
 *
 * Returns null rather than throwing. An unreachable menu is not an empty menu — the card falls
 * back to its interim table, which is the honest behaviour while the two are still both present.
 *
 * THE RESPONSE IS AN ENVELOPE (`{composed, kinds}`), `kinds` keyed by kind — not a bare array and
 * not `{kinds: [...]}`. This used to accept only those two array forms, so on the live wire it
 * always returned null: `readTaskKindsResponse` (`src/lib/taskDeclaration.ts`) is the one reader
 * that actually matches what `/task_kinds` sends, including the `composed: false` ("could not be
 * composed", not "no species exist") case. See that file for why.
 */
export async function fetchTaskKinds(): Promise<unknown[] | null> {
  try {
    const data = await request("GET /task_kinds", {});
    return readTaskKindsResponse(data);
  } catch {
    return null;
  }
}

// ── Canvas export (THE REAL WIRE — invincible-agent origin/master, 3f27c7cb) ──
/**
 * `POST /export/package` and friends, against the gateway routes as they actually shipped
 * (`feat(export): the gateway serves canvas export -- POST /export/package and the artifact
 * proxy`, rides roll #10) — not this repo's own proposed packet
 * (`sessions/2026-09-30-packet-to-lane-1-proposed-wire-for-canvas-export-and-the-ingest-routes.md`
 * section A, which proposed `/canvas/export/*`; the built wire is `/export/package`). Callers
 * must still gate behind `isCanvasExportEnabled()` (`src/lib/canvasExport.ts`) — the flag stays
 * until a live capture against this route seals it.
 */
export async function fetchExportRecipients(): Promise<ExportRecipient[]> {
  const data = await request("GET /export/package/recipients", {});
  const recipients = readExportRecipients(
    isRecord(data) ? data.recipients : undefined,
  );
  if (!recipients) {
    throw new Error("malformed /export/package/recipients response");
  }
  return recipients;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

export async function startCanvasExport(body: {
  answers: { artifact_id: string }[];
  recipient_scope: string;
  template_id?: string;
}): Promise<unknown> {
  return request("POST /export/package", { body });
}

/**
 * The download proxy needs the caller's own bearer — a bare `<a href>` would hit nginx with no
 * Authorization header and never reach the gateway (3f27c7cb's `/export/package/artifact/{filename}`
 * is itself gated). Refuses any uri outside the gateway's own download-proxy prefix so this
 * client never fetches an arbitrary path handed back in a response.
 */
export async function downloadExportArtifact(uri: string): Promise<Blob> {
  if (!uri.startsWith("/export/package/artifact/")) {
    throw new Error(`refusing to download outside /export/package/artifact/: ${uri}`);
  }
  const filename = uri.slice("/export/package/artifact/".length);
  const data = await request("GET /export/package/artifact/{filename}", { path: { filename } }, { responseType: "blob" });
  return data as Blob;
}

// ── Ingest (THE REAL WIRE — invincible-agent origin/master, 0f48fe2f, live on helm rev 162) ──
/**
 * ADR-0041's first client, against the gateway routes as they actually shipped. Sources:
 *   - invincible-agent origin/master, commit 0f48fe2feb863e2d65b56efc6a4a0528a81f4fb3 —
 *     `src/iagent/gateway.py`'s `POST /ingest` and `GET /ingest/{id}/status`, and
 *     `src/iagent/ingest_status.py` (the `STAGES`/`DUPLICATE`/`KINDS` closed sets
 *     `src/lib/ingestWire.ts` mirrors).
 *   - invincible-agent commit f5e15a3b (origin/lane/74-promotion, merged to local master at
 *     9fdbcc18, not yet pushed to origin/master) — `src/iagent/promotion.py`, the
 *     `document_promotion` HumanTask species acted through `actOnHumanTask` below, never a new
 *     route.
 *   - iagent-mesh-sdk branch lane/ca-0.9.7, commit 012a24fb — `INGEST_STAGES`' six-value
 *     vocabulary (received/extracting/review/promoted/rejected/failed) mirrors
 *     `ingest_status.py.STAGES` at producer `4c3b61a6` (renamed in `1c10e28c`). It was
 *     `awaiting_disposition` until `1c10e28c`.
 *
 * Callers still gate behind `isIngestUiEnabled()` (`src/lib/ingestFlag.ts`), and
 * `src/lib/ingestTransport.ts` still picks this real transport or the in-memory mock by
 * `isIngestMockEnabled()`. `src/lib/ingestWire.ts` is the one place that parses the response;
 * this file only sends the request and hands back whatever came back raw (or throws on
 * transport failure) for the wire module's readers to validate.
 *
 * Promote/reject are DELIBERATELY NOT HERE — the ingest row carries no task; a `document_promotion`
 * HumanTask is found by `promotionIngestId` (`src/lib/ingestWire.ts`) among the tasks this app
 * already tracks, and acted on through the EXISTING `actOnHumanTask` above, never a new route.
 */
/**
 * Multipart upload — `file`, `kind` and `on_behalf_of` are all REQUIRED fields on the real
 * route (`kind` is validated against `ingest_status.py.KINDS`; `on_behalf_of` must equal the
 * caller's own `authz_id` or the gateway answers 403).
 *
 * The `multipart/form-data` header is LOAD-BEARING (P0 2026-10-08). The instance default is
 * `application/json`, and axios 1.x's default `transformRequest` (`defaults/index.js`) answers a
 * FormData body under a JSON content type with `JSON.stringify(formDataToJSON(data))`: the File
 * serialises to `{}`, so every upload from this app sent NO FILE. The comment that stood here
 * said axios strips the JSON default for FormData. It does, but in the adapter, which runs AFTER
 * transformRequest has already stringified the body. Naming multipart keeps the body a FormData
 * through transformRequest; the adapter then drops the header and the browser writes it with its
 * `boundary=`. Sealed by `uploadIngest.multipart.test.ts` and `e2e/ingestDrop.spec.ts`.
 *
 * `content_kind` is REQUIRED from this app (P0 2026-10-12, architect via Chris). The gateway takes
 * it as optional (`Form(None)`, gateway.py `ingest_document` at fleet `49aa5e28`), but a drop
 * that omits it HALTs downstream: doc-tools refuses "no registered content_kind" and the drop goes
 * `failed`. It is the REGISTERED kind, a separate channel from `kind` (the file format and path
 * segment): the format (`pdf` is registered, `policy/overlays/openddil-lab/content_kinds/pdf.yaml`)
 * unless a human confirmed a leaf kind (`pcn`, `pdn`). The composer still sends the format as
 * `content_kind`.
 *
 * `leaf` (architect 2026-10-23, overriding the 10-21 "no picker before the drop"): the composer now
 * asks a PDF its leaf at the drop. It is sent ONLY for PCN/PDN; "Not sure" sends none and takes the
 * title-read path (awaiting_kind -> pick -> relaunch). `POST /ingest/{id}/leaf` (`correctIngestLeaf`)
 * remains the correction path (the chip on the card). The door (`gateway.py` `ingest_document`)
 * declares `leaf` from invincible-agent `0843efed` (lane/01-207, Monday's roll); a door without
 * it drops the field silently — the door-fields seal (`uploadIngest.doorFields.test.ts`) says
 * which. A blank `leaf` is refused (422 `leaf_unknown`), so "Not sure" sends NO field, never "".
 * `leaf_requires_pdf` / `leaf_conflicts_with_content_kind` are 422s too, read by `readIngestRefusal`.
 */
export type IngestUploadResult = Resp<"POST /ingest">;
export async function uploadIngest(
  file: File,
  kind: string,
  onBehalfOf: string,
  contentKind: string,
  leaf: IngestLeaf | null = null,
): Promise<IngestUploadResult> {
  const formData = new FormData();
  formData.append("file", file);
  formData.append("kind", kind);
  formData.append("on_behalf_of", onBehalfOf);
  formData.append("content_kind", contentKind);
  if (leaf !== null) formData.append("leaf", leaf);
  return request("POST /ingest", { body: formData }, { headers: { "Content-Type": "multipart/form-data" } });
}

/**
 * NOTE THE `/status` SUFFIX — `GET /ingest/{id}` (no suffix) is not a route on this gateway.
 * A 404 means "not found, or not yours" — the server makes these indistinguishable on purpose
 * (`ingest_status.get_status_for`'s own scoping), and `isIngestNotFoundError` /
 * `readIngestStatusRow` in `src/lib/ingestWire.ts` are how a caller reads that without guessing
 * at a reason the server deliberately did not give.
 */
export type IngestStatus = Resp<"GET /ingest/{ingest_id}/status">;
export async function fetchIngestStatus(ingestId: string): Promise<IngestStatus> {
  return request("GET /ingest/{ingest_id}/status", { path: { ingest_id: ingestId } });
}

/**
 * `GET /ingest/mine?limit=&before=` — the caller's own drops, newest first (191). Parsed by
 * `readIngestMinePage` in `src/lib/ingestWire.ts`. Keyset paging: `before` is the previous page's
 * `next`, passed back verbatim (opaque; never built here), and left off for the first page. A failure
 * is read by the caller as "no server list".
 */
export type IngestMineListing = Resp<"GET /ingest/mine">;
export async function fetchIngestMine(limit: number, before: string | null = null): Promise<IngestMineListing> {
  return request("GET /ingest/mine", { query: before === null ? { limit } : { limit, before } });
}

/**
 * `GET /answers?page&size&q` — paged answer SUMMARIES (no body columns), read by `readAnswersPage`
 * in `src/lib/answersWire.ts`. Only with the `answerSummaries` flag on.
 */
export async function fetchAnswersPage(args: { page: number; size: number; q?: string }): Promise<unknown> {
  const query: { page: number; size: number; q?: string } = { page: args.page, size: args.size };
  if (args.q) query.q = args.q;
  return request("GET /answers", { query });
}

/** `GET /answers/{id}/body` — the body of ONE opened answer, read by `readAnswerBody`. The id is URL-encoded. */
export async function fetchAnswerBody(id: string): Promise<unknown> {
  return request("GET /answers/{answer_id}/body", { path: { answer_id: id } });
}

/**
 * `POST /ingest/{id}/retry` (Lane 1 packet `sessions/2026-10-12-packet-to-cortex-the-failure-field-is-failure-on-ingest-status-a-failed-drop-is-retryable.md` §2,
 * invincible-agent 33b80988): re-opens the person's own `failed` drop. NO BODY — no data argument, not `{}`.
 * 200 `{ingest_id, stage:"received", attempt}`; 409 `not_failed` and 403 `retry_is_pin_driven` throw
 * (FastAPI wraps them under `detail`; read with `readIngestRetryRefusal`).
 */
export type IngestRetryResult = Resp<"POST /ingest/{ingest_id}/retry">;
export async function retryIngest(ingestId: string): Promise<IngestRetryResult> {
  return request("POST /ingest/{ingest_id}/retry", { path: { ingest_id: ingestId } });
}

/**
 * `GET /ingest/{id}/extraction` (`ingestExtractionPath`; Lane 1, 193): the review card's rows
 * and header. Returned RAW; `readExtraction` reads it.
 */
export type IngestExtraction = Resp<"GET /ingest/{ingest_id}/extraction">;
export async function fetchIngestExtraction(ingestId: string): Promise<IngestExtraction> {
  return request("GET /ingest/{ingest_id}/extraction", { path: { ingest_id: ingestId } });
}

/**
 * `GET /ingest/{id}/source` (`ingestSourcePath`; Lane 1, 193): the dropped document's bytes, for
 * the review card's PDF pane. Raw bytes, never parsed here: `src/lib/pdfSource.ts` hands them to
 * pdf.js. Until 193 rolls this 404s, and the pane says so while the rows still draw.
 */
/**
 * What `/source` answered, kept whole so a pane that cannot draw it can say WHAT it got: the
 * status and content-type travel with the bytes (P0 2026-10-18: a generic sentence hid a refused
 * pdf.js worker behind "could not be read as a PDF").
 */
export interface IngestSource {
  bytes: ArrayBuffer;
  status: number;
  contentType: string | null;
}

export async function fetchIngestSource(ingestId: string): Promise<IngestSource> {
  const res = await requestFull("GET /ingest/{ingest_id}/source", { path: { ingest_id: ingestId } }, { responseType: "arraybuffer" });
  const ct = res.headers?.["content-type"];
  // b59e4a0f declares /source binary, so the generated body type is `Blob`; `responseType: "arraybuffer"`
  // is what axios honours, and it hands back an ArrayBuffer.
  return { bytes: res.data as unknown as ArrayBuffer, status: res.status, contentType: typeof ct === "string" && ct ? ct : null };
}

/**
 * `GET /cases/{case_id}` — the producer's own `WorkflowCasePayload` for one case (invincible-agent
 * `3e6d9e9f`, gateway.py `get_case`). Returns the RAW `Response` and decides nothing: the status
 * mapping (200 / 404 / 503 / other) and the body check live in `src/lib/cases.ts`, so this file
 * stays a transport and `cases.ts` stays testable against a stubbed `globalThis.fetch`.
 *
 * A 404 here means "absent OR not entitled" — identical BY DESIGN (an existence oracle); callers
 * must never try to tell them apart.
 *
 * transport-exception: raw fetch so the HTTP exchange itself is the seam a test stubs
 * (`globalThis.fetch`), carrying the caller's OIDC bearer plus the same X-Trace-Id / X-Session-Id
 * the axios wrapper attaches — nothing about the authorisation path differs from
 * `fetchIngestStatus`'s, and axios would resolve a 404/503 into a thrown error this caller would
 * only have to unpick again.
 */
export async function fetchCaseResponse(caseId: string): Promise<Response> {
  const headers: Record<string, string> = {
    "X-Trace-Id": crypto.randomUUID(),
    "X-Session-Id": getSessionId(),
  };
  const token = getOidcToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  return fetch(`${API_URL}${opPath("GET /cases/{case_id}", { path: { case_id: caseId } })}`, { method: "GET", headers });
}

/**
 * RULED (architect 2026-10-21, "Leaf, final shape" §3; Lane 1 builds it in 202/203) —
 * `POST /ingest/{ingest_id}/leaf` with `{"leaf": "pcn" | "pdn"}`: the dropper OR the steward (one route)
 * corrects, or at `awaiting_kind` supplies, the row's leaf. The row's `leaf_source` becomes `corrected` with
 * `corrected_by`. As built by Lane 1 (`invincible-agent lane/01-202 c095be48 / 5e1fc230`): at `review`,
 * `awaiting_origin` or `awaiting_kind` the row goes back to stage `received` with `attempt` + 1; the same leaf as
 * the row's own answers 200 and writes nothing; at `promoted` / `rejected` / `review_rejected` it answers 409
 * `leaf_not_changeable`. Every refusal carries a `message`: 422 `unknown_leaf`, 409 `no_leaf_for_kind`, 409
 * `leaf_not_changeable` (`leaf_fixed_at_review` no longer exists). Answers the status body. Same `api` instance as every call above, so it needs no `check:transport` declaration.
 */
export type IngestLeafCorrection = Resp<"POST /ingest/{ingest_id}/leaf">;
export async function correctIngestLeaf(ingestId: string, leaf: IngestLeaf): Promise<IngestLeafCorrection> {
  return request("POST /ingest/{ingest_id}/leaf", { path: { ingest_id: ingestId }, body: { leaf } });
}

/**
 * CORTEX-PROPOSED — `src/archetypes/illustration/contract.ts`'s header: no producer route
 * serves an ICN's bytes today (`GET /artifacts/{id}` returns JSON, not bytes). This fetches
 * through the same minted `api` instance as every other call here (the bearer attaches via the
 * request interceptor above), so it needs no `check:transport` exception of its own.
 *
 * `gatewayRelativePath` is called FIRST and must pass before axios ever sees `path` — a
 * producer-supplied `content_path` that is an absolute URL would otherwise get this caller's
 * bearer sent to whatever host that string names. See `src/lib/illustrationPath.ts`'s header.
 */
export async function fetchIllustrationContent(path: string): Promise<string> {
  if (gatewayRelativePath(path) === null) {
    throw new Error(`fetchIllustrationContent: refused a non-gateway-relative path: ${path}`);
  }
  const { data } = await api.get<string>(path, {
    responseType: "text",
    transformResponse: (r) => r,
  });
  return data;
}

// 51 of the 70 ops are UNTYPED (the producer declares no response); their hand shapes stay in pass B.
/**
 * Reads cortex makes of fields the producer sends but does not declare. The read-side twin of AWAITING_DOOR.
 * Shape: { "<METHOD /path>": { "<dotted.path>": "<reason, evidence file>" } }. `[]` is an array step.
 * client.responseSeal.test.ts fails an entry the schema now declares, and one nothing reads.
 */
export const AWAITING_DECLARATION: Record<string, Record<string, string>> = {
  "POST /decision_subgraph": {
    "live_nodes.[].uri": "(b) the producer declares list[dict] but builds {uri, labels} per node; evidence: producer src/iagent/gateway.py:10573 at 4a5ff6b6 (and src/lib/decisionMap.test.ts fixtures)",
    "context_nodes.[].uri": "(b) same open dict, {uri, labels}; evidence: producer src/iagent/gateway.py:10525-10575 at 4a5ff6b6",
  },
  "GET /ingest/{ingest_id}/extraction": {
    "rows.[].evidence_ref.page_dims": "retired after the 0.4.71 roll (architect 10-28), reader branch still live for pre-roll rows",
  },
  "GET /fleet/version": {
    self: "(b) the producer sends {self: {...}} but declares the body as an open object; evidence: producer src/iagent/gateway.py:971 at 4a5ff6b6 and src/api/bffVersion.test.ts",
  },
};
