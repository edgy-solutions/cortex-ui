/**
 * THE REQUEST SEAL. Every function client.ts exports that touches the wire is replayed through the real
 * axios pipeline (adapter capture), the real fetchEventSource call (mocked module) or a stubbed global
 * fetch, and what it SENT is checked against the committed BFF OpenAPI snapshot:
 *
 *   - the method and URL match the expected op's path template ({p} -> [^/]+);
 *   - every query key sent is a declared query parameter, and every required one is present;
 *   - JSON body: every top-level key is a property of the requestBody schema ($ref resolved; for anyOf the
 *     keys must fit at least ONE object branch, whose `required` keys must all be present);
 *   - multipart: every FormData field name is a property of the multipart schema, required ones present.
 *
 * The POPULATION is censused from client.ts, not listed: an exported function with no entry in CALLS or
 * NOT_TRANSPORT fails this file, by name. Every CALLS op is a snapshot op: there is no escape for an
 * undeclared route. The UNDECLARED_ROUTES ledger died with its three callers (item 4, #31).
 *
 * This seals the REQUEST. The response side is pass B.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import type { AxiosAdapter, InternalAxiosRequestConfig } from "axios";

const { seen, sse, rawFetch, flag } = vi.hoisted(() => ({
  seen: [] as InternalAxiosRequestConfig[],
  sse: [] as { url: string; method?: string; body?: string }[],
  rawFetch: [] as { url: string; method?: string; body?: string }[],
  flag: { sendVersion: false },
}));

vi.mock("axios", async (importOriginal) => {
  const mod = await importOriginal<typeof import("axios")>();
  const real = mod.default;
  const realCreate = real.create.bind(real);
  const capture: AxiosAdapter = async (config) => {
    seen.push(config);
    return { data: {}, status: 200, statusText: "OK", headers: {}, config };
  };
  const wrapped = Object.assign(Object.create(real), {
    create: (cfg?: Parameters<typeof real.create>[0]) => {
      const inst = realCreate(cfg);
      inst.defaults.adapter = capture;
      return inst;
    },
  });
  return { ...mod, default: wrapped };
});

vi.mock("@microsoft/fetch-event-source", () => ({
  fetchEventSource: vi.fn(async (url: string, opts: { method?: string; body?: string }) => {
    sse.push({ url, method: opts.method, body: opts.body });
  }),
}));

vi.mock("@/lib/frontendVersion", () => ({
  isSendFrontendVersionEnabled: () => flag.sendVersion,
  loadFrontendVersion: async () => "0123456",
}));

import { config } from "@/config";
import * as client from "./client";

// ── the snapshot ───────────────────────────────────────────────────────────────────────────
type Schema = Record<string, any>;
const doc = JSON.parse(readFileSync(path.join(__dirname, "openapi/cortex-bff.openapi.json"), "utf8"));
const schemas: Record<string, Schema> = doc.components.schemas;
const METHODS = ["get", "post", "put", "delete", "patch"];

interface SnapOp {
  key: string;
  method: string;
  template: string;
  re: RegExp;
  op: Schema;
}
const templateRe = (t: string) =>
  new RegExp("^" + t.replace(/[.*+?^$()|[\]\\]/g, "\\$&").replace(/\{[^}]+\}/g, "[^/]+") + "$");
const SNAP: SnapOp[] = [];
for (const [p, item] of Object.entries<Schema>(doc.paths)) {
  for (const m of METHODS) {
    if (item[m]) SNAP.push({ key: `${m.toUpperCase()} ${p}`, method: m.toUpperCase(), template: p, re: templateRe(p), op: item[m] });
  }
}
const BY_KEY = new Map(SNAP.map((o) => [o.key, o]));

function resolve(s: Schema | undefined): Schema {
  let cur = s ?? {};
  while (cur.$ref) cur = schemas[String(cur.$ref).replace("#/components/schemas/", "")];
  return cur;
}

/** The object branches a body schema can take. null-typed branches are the "no body" arm. */
function objectBranches(s: Schema): Schema[] {
  const r = resolve(s);
  if (r.anyOf) return (r.anyOf as Schema[]).flatMap(objectBranches);
  if (r.type === "null") return [];
  return [r];
}

// ── the captures ───────────────────────────────────────────────────────────────────────────
interface Capture {
  via: "axios" | "sse" | "fetch";
  method: string;
  path: string;
  query: Record<string, unknown>;
  body: unknown;
}

const stripOrigin = (u: string) => {
  const base = String(config.VITE_API_URL ?? "").replace(/\/$/, "");
  const rel = base && u.startsWith(base) ? u.slice(base.length) : u;
  return rel.split("?")[0];
};

function parseBody(b: unknown): unknown {
  if (typeof b === "string") {
    try {
      return JSON.parse(b);
    } catch {
      return b;
    }
  }
  return b;
}

function collect(): Capture[] {
  const out: Capture[] = [];
  for (const c of seen) {
    out.push({
      via: "axios",
      method: String(c.method).toUpperCase(),
      path: String(c.url).split("?")[0],
      query: (c.params as Record<string, unknown>) ?? {},
      body: parseBody(c.data),
    });
  }
  for (const c of sse) {
    out.push({ via: "sse", method: String(c.method).toUpperCase(), path: stripOrigin(c.url), query: {}, body: parseBody(c.body) });
  }
  for (const c of rawFetch) {
    out.push({ via: "fetch", method: String(c.method ?? "GET").toUpperCase(), path: stripOrigin(c.url), query: {}, body: parseBody(c.body) });
  }
  return out;
}

beforeEach(() => {
  seen.length = 0;
  sse.length = 0;
  rawFetch.length = 0;
  flag.sendVersion = false;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: { method?: string; body?: string }) => {
      rawFetch.push({ url: String(url), method: init?.method, body: init?.body });
      return new Response("{}", { status: 200 });
    }),
  );
});

// ── the checks ─────────────────────────────────────────────────────────────────────────────
/** Returns the list of violations of one capture against one declared op ([] = sealed). */
function violations(cap: Capture, snap: SnapOp): string[] {
  const v: string[] = [];
  if (cap.method !== snap.method) v.push(`method ${cap.method} but ${snap.key} is ${snap.method}`);
  if (!snap.re.test(cap.path)) v.push(`path ${cap.path} does not match ${snap.template}`);

  const params: Schema[] = [...(doc.paths[snap.template].parameters ?? []), ...(snap.op.parameters ?? [])];
  const q = params.filter((p) => p.in === "query");
  for (const k of Object.keys(cap.query)) {
    if (!q.some((p) => p.name === k)) v.push(`query key "${k}" is not declared on ${snap.key}`);
  }
  for (const p of q) {
    if (p.required && !(p.name in cap.query)) v.push(`required query param "${p.name}" missing on ${snap.key}`);
  }

  const rb = snap.op.requestBody as Schema | undefined;
  const sent = cap.body;
  if (!rb) {
    if (sent !== undefined && sent !== null) v.push(`a body was sent but ${snap.key} declares none`);
    return v;
  }
  if (sent === undefined || sent === null) {
    if (rb.required) v.push(`${snap.key} requires a body and none was sent`);
    return v;
  }
  if (sent instanceof FormData) {
    const mp = rb.content?.["multipart/form-data"];
    if (!mp) return [...v, `FormData sent but ${snap.key} declares no multipart body`];
    const s = resolve(mp.schema);
    const names = new Set<string>();
    sent.forEach((_val, k) => names.add(k));
    for (const k of names) if (!(k in (s.properties ?? {}))) v.push(`multipart field "${k}" is not a property of ${snap.key}'s body`);
    for (const r of s.required ?? []) if (!names.has(r)) v.push(`required multipart field "${r}" missing on ${snap.key}`);
    return v;
  }
  const js = rb.content?.["application/json"];
  if (!js) return [...v, `a JSON body was sent but ${snap.key} declares none`];
  if (typeof sent !== "object" || Array.isArray(sent)) return [...v, `body is not a JSON object`];
  const keys = Object.keys(sent as object);
  const branches = objectBranches(js.schema);
  if (branches.length === 0) return [...v, `${snap.key} declares only a null body but one was sent`];
  const fits = branches.some(
    (b) => keys.every((k) => k in (b.properties ?? {})) && (b.required ?? []).every((r: string) => keys.includes(r)),
  );
  if (!fits) {
    const b = branches[0];
    const stray = keys.filter((k) => !branches.some((x) => k in (x.properties ?? {})));
    const missing = (b.required ?? []).filter((r: string) => !keys.includes(r));
    v.push(
      `body keys [${keys.join(", ")}] fit no branch of ${snap.key}'s body` +
        (stray.length ? `; undeclared: ${stray.join(", ")}` : "") +
        (missing.length ? `; missing required (first branch): ${missing.join(", ")}` : ""),
    );
  }
  return v;
}

// ── the population ─────────────────────────────────────────────────────────────────────────
interface Case {
  name: string;
  /** The op key the call must resolve to: a snapshot op. */
  op: string;
  run: () => Promise<unknown>;
}

const file = new File(["%PDF-1.4\n"], "a.pdf", { type: "application/pdf" });
const rowEdits = {
  deleted: [{ mpn: "A", reason: "r" }],
  added: [{ mpn: "B", disposition: "d", reason: "r", evidence: "e" }],
  corrected: [{ mpn: "C", corrected_mpn: "D", evidence: "e" }],
};
const ACT = "POST /human_tasks/{task_id}/act";
const noop = () => {};

const CALLS: Record<string, Case[]> = {
  fetchEntitlements: [{ name: "plain", op: "GET /me/entitlements", run: () => client.fetchEntitlements() }],
  fetchMyHumanTasks: [{ name: "plain", op: "GET /me/human_tasks", run: () => client.fetchMyHumanTasks() }],
  actOnHumanTask: [
    { name: "approved, bare", op: ACT, run: () => client.actOnHumanTask("t1", "approved") },
    { name: "approved with overrides and row_edits", op: ACT, run: () => client.actOnHumanTask("t1", "approved", "c", { M1: { disposition: "x", reason: "r" } } as never, rowEdits as never) },
    { name: "rejected with reason_code", op: ACT, run: () => client.actOnHumanTask("t1", "rejected", "c", undefined, undefined, "duplicate" as never) },
    { name: "promoted with header_edits and row_edits", op: ACT, run: () => client.actOnHumanTask("t1", "promoted", "", undefined, rowEdits as never, undefined, [{ field: "mfr", value: "v", evidence_ref: "e", reason: "r" }] as never) },
    { name: "acknowledged", op: ACT, run: () => client.actOnHumanTask("t1", "acknowledged", "ok") },
  ],
  createAccessRequest: [
    { name: "with domain and reason", op: "POST /access_requests", run: () => client.createAccessRequest({ asset: "urn:x", domain: "d", reason: "r" } as never) },
    { name: "asset only", op: "POST /access_requests", run: () => client.createAccessRequest({ asset: "urn:x" } as never) },
  ],
  fetchReviewBatch: [{ name: "plain", op: "GET /reviews/{workflow_id}/batch", run: () => client.fetchReviewBatch("w/1" as never) }],
  fetchNoticeProvenance: [{ name: "plain", op: "GET /notices/{notice_id}/provenance", run: () => client.fetchNoticeProvenance("n1" as never) }],
  streamInterviewResponse: [
    {
      name: "every field the hand InterviewRequest has",
      op: "POST /interview/stream",
      run: () =>
        client.streamInterviewResponse(
          {
            message: "m",
            session_id: "s",
            current_graph_json: "{}",
            artifact_id: "a",
            active_persona: "p",
            active_domains: ["d"],
            bound_slots: { k: "v" },
            answering_artifact_id: "a2",
            spoken_slot: "slot",
            spoken_answer: "ans",
          } as never,
          noop as never,
        ),
    },
    {
      name: "with frontend_version (VITE_SEND_FRONTEND_VERSION on)",
      op: "POST /interview/stream",
      run: async () => {
        flag.sendVersion = true;
        return client.streamInterviewResponse({ message: "m", session_id: "s" } as never, noop as never);
      },
    },
  ],
  requestTemplateCanvasSeed: [
    { name: "template only", op: "POST /canvas/seed", run: () => (client as any).requestTemplateCanvasSeed("t1") },
    { name: "bindings + cell", op: "POST /canvas/seed", run: () => (client as any).requestTemplateCanvasSeed("t1", { program: "p" }, { active_persona: "a", active_domains: ["d"] }) },
  ],
  fetchPlanStateVersion: [
    { name: "with a state_ref", op: "GET /plan/state_version", run: () => (client as any).fetchPlanStateVersion("scn-1") },
    { name: "baseline (no ref)", op: "GET /plan/state_version", run: () => (client as any).fetchPlanStateVersion() },
  ],
  forkPlanScenario: [{ name: "plain", op: "POST /plan/scenario", run: () => (client as any).forkPlanScenario("s1", "n") }],
  reschedulePlanProject: [
    { name: "plain", op: "POST /plan/scenario/{scenario_id}/reschedule", run: () => (client as any).reschedulePlanProject({ scenarioId: "s1", projectId: "p", start: "2026-01-01", end: "2026-02-01" }) },
  ],
  fetchCanvases: [{ name: "plain", op: "GET /me/canvases", run: () => (client as any).fetchCanvases() }],
  saveCanvases: [{ name: "plain", op: "PUT /me/canvases", run: () => (client as any).saveCanvases([]) }],
  saveCanvasesUrgently: [{ name: "keepalive fetch", op: "PUT /me/canvases", run: () => (client as any).saveCanvasesUrgently([]) }],
  fetchLineageEdges: [{ name: "plain", op: "POST /canvas/lineage_edges", run: () => (client as any).fetchLineageEdges([{ answer_id: "a", urn: "u" }]) }],
  getMeshConfig: [{ name: "plain", op: "GET /mesh/config", run: () => (client as any).getMeshConfig() }],
  fetchDecisionSubgraph: [
    { name: "all fields", op: "POST /decision_subgraph", run: () => (client as any).fetchDecisionSubgraph({ class_uris: ["c"], verb_iris: ["v"], subject_uri: "s" }) },
  ],
  registerFrontendCapabilities: [
    {
      name: "plain",
      op: "POST /register_frontend_capabilities",
      run: () => (client as any).registerFrontendCapabilities({ frontend_id: "f", frontend_version: "1", capabilities: [] }),
    },
  ],
  healthCheck: [{ name: "plain", op: "GET /health", run: () => (client as any).healthCheck() }],
  fetchBffVersion: [{ name: "plain", op: "GET /fleet/version", run: () => (client as any).fetchBffVersion() }],
  fetchTemplates: [{ name: "plain", op: "GET /templates", run: () => (client as any).fetchTemplates() }],
  fetchTaskKinds: [{ name: "plain", op: "GET /task_kinds", run: () => (client as any).fetchTaskKinds() }],
  fetchExportRecipients: [{ name: "plain", op: "GET /export/package/recipients", run: () => (client as any).fetchExportRecipients() }],
  offerExportRecipients: [{ name: "plain", op: "POST /export/package/recipients", run: () => (client as any).offerExportRecipients(["a", "b"]) }],
  startCanvasExport: [
    { name: "with template", op: "POST /export/package", run: () => (client as any).startCanvasExport({ answers: [{ artifact_id: "a" }], recipient_scope: "r", template_id: "t" }) },
    { name: "without template", op: "POST /export/package", run: () => (client as any).startCanvasExport({ answers: [{ artifact_id: "a" }], recipient_scope: "r" }) },
  ],
  downloadExportArtifact: [{ name: "plain", op: "GET /export/package/artifact/{filename}", run: () => (client as any).downloadExportArtifact("/export/package/artifact/x.zip") }],
  uploadIngest: [
    { name: "no leaf", op: "POST /ingest", run: () => (client as any).uploadIngest(file, "pdf", "a@b.c", "pdf") },
    { name: "with leaf", op: "POST /ingest", run: () => (client as any).uploadIngest(file, "pdf", "a@b.c", "pdf", "pcn") },
  ],
  fetchIngestStatus: [{ name: "plain", op: "GET /ingest/{ingest_id}/status", run: () => (client as any).fetchIngestStatus("i1") }],
  fetchIngestMine: [
    { name: "without before", op: "GET /ingest/mine", run: () => (client as any).fetchIngestMine(50) },
    { name: "with before", op: "GET /ingest/mine", run: () => (client as any).fetchIngestMine(50, "2026-01-01T00:00:00Z") },
  ],
  fetchAnswersPage: [
    { name: "without q", op: "GET /answers", run: () => (client as any).fetchAnswersPage({ page: 1, size: 20 }) },
    { name: "with q", op: "GET /answers", run: () => (client as any).fetchAnswersPage({ page: 1, size: 20, q: "x" }) },
  ],
  fetchAnswerBody: [{ name: "plain", op: "GET /answers/{answer_id}/body", run: () => (client as any).fetchAnswerBody("a1") }],
  retryIngest: [{ name: "plain", op: "POST /ingest/{ingest_id}/retry", run: () => (client as any).retryIngest("i1") }],
  fetchIngestExtraction: [{ name: "plain", op: "GET /ingest/{ingest_id}/extraction", run: () => (client as any).fetchIngestExtraction("i1") }],
  fetchIngestSource: [{ name: "plain", op: "GET /ingest/{ingest_id}/source", run: () => (client as any).fetchIngestSource("i1") }],
  fetchCaseResponse: [{ name: "raw fetch seam", op: "GET /cases/{case_id}", run: () => (client as any).fetchCaseResponse("c/1") }],
  correctIngestLeaf: [{ name: "plain", op: "POST /ingest/{ingest_id}/leaf", run: () => (client as any).correctIngestLeaf("i1", "pdn") }],
  fetchDataModuleFigures: [{ name: "plain", op: "GET /data_module/figures", run: () => (client as any).fetchDataModuleFigures("dm://x?y=1&z=2") }],
  fetchGraphNode: [{ name: "plain", op: "GET /graph/node/{node_id}", run: () => (client as any).fetchGraphNode("n/1") }],
  fetchFederatedImage: [{ name: "plain", op: "GET /federated_image", run: () => (client as any).fetchFederatedImage("s3://b/k") }],
};

/** Exported functions that never reach the wire on their own, each with the reason. */
const NOT_TRANSPORT: Record<string, string> = {
  parseSSE: "pure: parses one SSE block into a StreamEvent",
  buildActBody: "pure: builds the /act body (its keys are sealed through actOnHumanTask's cases)",
  buildInterviewBody: "pure: builds the /interview/stream body (sealed through streamInterviewResponse's cases)",
  opPath: "pure: fills an op's path template (URL building for the raw-fetch and SSE seams)",
  request: "the typed core: exercised by every CALLS case",
  requestFull: "the typed core, whole-response variant: exercised by fetchEntitlements / healthCheck / fetchIngestSource",
  fetchIngestExportProfiles: "CORTEX-PROPOSED, packet 2026-10-28 review-export: a route the producer does not declare (src/lib/reviewExport.ts)",
  downloadIngestExport: "CORTEX-PROPOSED, packet 2026-10-28 review-export: a route the producer does not declare (src/lib/reviewExport.ts)",
  downloadBatchExport: "CORTEX-PROPOSED, packet 2026-10-28 review-export: a route the producer does not declare (src/lib/reviewExport.ts)",
  fileAccessProposal: "POST /access/proposals: CORTEX-PROPOSED (ADR-0062 section 7, Draft; docs/specs/access-request-cards.md), not in the BFF snapshot yet; the wire is spelled once in src/lib/accessProposal.ts and sealed by accessProposal.test.ts",
  fetchIllustrationContent: "GET {content_path}: producer-chosen path from an ILLUSTRATION payload, guarded by gatewayRelativePath; not a BFF op (consumed-routes.md, 'Not BFF routes')",
};

// ── census: the population is read from client.ts ──────────────────────────────────────────
describe("the population: every exported client function is sealed or declared not-transport", () => {
  const src = readFileSync(path.join(__dirname, "client.ts"), "utf8");
  const exported = [
    ...new Set([...src.matchAll(/export async function (\w+)/g), ...src.matchAll(/export function (\w+)/g)].map((m) => m[1])),
  ];

  it("the census sees the functions (instrument)", () => {
    expect(exported.length, "the census regex found almost nothing -- it has stopped seeing client.ts").toBeGreaterThan(30);
    expect(exported).toContain("actOnHumanTask");
  });

  it("every exported function has a CALLS entry or a NOT_TRANSPORT reason, and nothing stale is listed", () => {
    const known = new Set([...Object.keys(CALLS), ...Object.keys(NOT_TRANSPORT)]);
    const unlisted = exported.filter((n) => !known.has(n));
    expect(unlisted, `client.ts exports ${unlisted.join(", ")} with no CALLS case and no NOT_TRANSPORT reason -- add one`).toEqual([]);
    const stale = [...known].filter((n) => !exported.includes(n));
    expect(stale, `${stale.join(", ")} listed here but not exported by client.ts`).toEqual([]);
  });

  it("CALLS and NOT_TRANSPORT do not overlap", () => {
    expect(Object.keys(CALLS).filter((n) => n in NOT_TRANSPORT)).toEqual([]);
  });
});

// ── the replay ─────────────────────────────────────────────────────────────────────────────
describe("every transport function's request fits the BFF snapshot", () => {
  for (const [fn, cases] of Object.entries(CALLS)) {
    for (const c of cases) {
      it(`${fn} -- ${c.name} -> ${c.op}`, async () => {
        try {
          await c.run();
        } catch {
          // a malformed {} response may throw AFTER the request left; only the request is sealed here
        }
        const caps = collect();
        expect(caps.length, `${fn} sent ${caps.length} requests, expected 1`).toBe(1);
        const cap = caps[0];
        const snap = BY_KEY.get(c.op);
        expect(snap, `${fn} expects ${c.op}, which the BFF snapshot does not declare`).toBeDefined();
        expect(violations(cap, snap!), `${fn} (${c.name})`).toEqual([]);
      });
    }
  }
});

describe("no undeclared route", () => {
  it("every CALLS op is in the snapshot", () => {
    const bad = Object.values(CALLS)
      .flat()
      .filter((c) => !BY_KEY.has(c.op))
      .map((c) => c.op);
    expect(bad).toEqual([]);
  });
});
