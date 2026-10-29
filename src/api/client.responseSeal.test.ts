/**
 * THE RESPONSE SEAL. "Cortex reads no field the producer does not declare."
 *
 * The request seal (client.requestSeal.test.ts) checks what cortex SENDS. This is the READ side. For every
 * typed read (an op whose generated `Resp<K>` is not `unknown`) it:
 *
 *   (i)   builds a response body from the op's response schema in the committed snapshot, every declared
 *         property present ($ref resolved; anyOf takes the first non-null branch; arrays get one element;
 *         enum/const take the first value). The walker below reads the JSON schema directly. It does NOT use
 *         the generator's code, so the seal cannot agree with the generator by construction;
 *   (ii)  wraps the body in a recursive RECORDING PROXY that logs every property path read (`a.b[0].c` is
 *         `a.b.[].c`);
 *   (iii) serves it through the real axios pipeline (captured adapter), calls the real client function, then
 *         passes the result through every consumer reader of that function (READERS). Nothing is mocked
 *         between the response and the reader;
 *   (iv)  asserts every recorded path is declared in the schema, or is listed under that op in
 *         AWAITING_DECLARATION (client.ts), which holds the reads cortex makes of fields the producer sends
 *         but does not declare yet.
 *
 * WHAT "DECLARED" MEANS. A path is declared when the schema names every step of it, across the UNION of an
 * anyOf's branches (the body is built from the first branch, but a reader may ask for any branch's field).
 * An array step `[]` needs an `items` schema. A free-form value (no `type`, or an object with no
 * `properties`) declares ITSELF and nothing below it: `payload` is declared, `payload.ingest_id` is not.
 *
 * THE POPULATION is computed from src/api/generated/bff.ts, never listed here: every op whose `response:` is
 * not `unknown`. A client.ts function that calls one of those ops is a TYPED READ and needs a READERS entry or
 * a NO_READER reason; a population op with no client.ts function needs a NO_READER reason keyed by the op.
 *
 * THE INSTRUMENT. Each op's test name carries the number of paths its readers read. A typed read with zero
 * recorded paths fails unless it is NO_READER, and READ_FLOOR ratchets the count so a reader that stopped
 * reading (or a Proxy that stopped recording) goes red instead of passing on less.
 *
 * Mutation hook: CORTEX_RESPONSE_SEAL_SNAPSHOT names a different snapshot file. It exists so a redproof can
 * run against a temp COPY with a field added; nothing else sets it.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import React from "react";
import { render, renderHook, cleanup, fireEvent, act as rtlAct } from "@testing-library/react";
import type { AxiosAdapter, InternalAxiosRequestConfig } from "axios";

const { seen, sink } = vi.hoisted(() => ({
  seen: [] as InternalAxiosRequestConfig[],
  // Set by the harness; the captured adapter asks it for the response body of each request.
  sink: { serve: (_method: string, _url: string): unknown => ({}) },
}));

vi.mock("axios", async (importOriginal) => {
  const mod = await importOriginal<typeof import("axios")>();
  const real = mod.default;
  const realCreate = real.create.bind(real);
  const capture: AxiosAdapter = async (config) => {
    seen.push(config);
    const url = String(config.url).split("?")[0];
    return { data: sink.serve(String(config.method).toUpperCase(), url), status: 200, statusText: "OK", headers: {}, config };
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

// UI sinks and environment seams, none of which sit between a response and its reader.
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn(), info: vi.fn(), warning: vi.fn() } }));
vi.mock("react-oidc-context", () => ({ useAuth: () => ({ isAuthenticated: true, user: null }) }));
vi.mock("@/lib/bundleFreshness", () => ({
  checkBundleFreshness: async () => ({ kind: "current", sha: "x" }),
  watchBundleFreshness: () => () => {},
}));

import * as client from "./client";
import { AWAITING_DECLARATION } from "./client";
import { usePersonaStore } from "@/store/usePersonaStore";
import { dropIdentity } from "@/lib/dropIdentity";
import { viewerAuthzIdOf } from "@/lib/dropperHold";
import { humanTaskFromRow, seedFromRest } from "@/lib/seedHumanTasks";
import { readTaskDeclaration } from "@/lib/taskDeclaration";
import { stageOutcomeSentence, useTaskAct } from "@/components/ApprovalTask/useTaskAct";
import { GroupedReviewTable } from "@/components/GroupedReview/GroupedReviewTable";
import { buildCorridorData, buildMapModel, collectCapturedDecision } from "@/lib/decisionMap";
import { useFrontendCapabilityRegistration } from "@/App";
import { BuildStamp, bffLabel } from "@/components/BuildStamp";
import {
  readIngestStatusRow,
  readIngestMinePage,
  readIngestUploadId,
} from "@/lib/ingestWire";
import { readExtraction } from "@/lib/promotionReview";
import { useIngestStatusStore } from "@/store/useIngestStatusStore";

// ── the snapshot, walked directly ──────────────────────────────────────────
type Schema = Record<string, any>;
const SNAPSHOT = process.env.CORTEX_RESPONSE_SEAL_SNAPSHOT ?? path.join(__dirname, "openapi/cortex-bff.openapi.json");
const doc = JSON.parse(readFileSync(SNAPSHOT, "utf8"));
const schemas: Record<string, Schema> = doc.components.schemas;
const METHODS = ["get", "post", "put", "delete", "patch"];

interface SnapOp {
  key: string;
  method: string;
  template: string;
  re: RegExp;
  op: Schema;
  nParams: number;
}
const templateRe = (t: string) =>
  new RegExp("^" + t.replace(/[.*+?^$()|[\]\\]/g, "\\$&").replace(/\{[^}]+\}/g, "[^/]+") + "$");
const SNAP: SnapOp[] = [];
for (const [p, item] of Object.entries<Schema>(doc.paths)) {
  for (const m of METHODS) {
    if (item[m])
      SNAP.push({
        key: `${m.toUpperCase()} ${p}`,
        method: m.toUpperCase(),
        template: p,
        re: templateRe(p),
        op: item[m],
        nParams: (p.match(/\{/g) ?? []).length,
      });
  }
}
// Most specific template first, so `/ingest/mine` is not taken for a parameterised route.
SNAP.sort((a, b) => a.nParams - b.nParams);
const BY_KEY = new Map(SNAP.map((o) => [o.key, o]));

function resolve(s: Schema | undefined): Schema {
  let cur = s ?? {};
  let hops = 0;
  while (cur.$ref) {
    cur = schemas[String(cur.$ref).replace("#/components/schemas/", "")] ?? {};
    if (++hops > 50) throw new Error("$ref loop");
  }
  return cur;
}

/** The 200 JSON response schema of a snapshot op, or undefined when it declares none (or only a non-JSON body). */
function responseSchema(op: SnapOp): Schema | undefined {
  const c = op.op.responses?.["200"]?.content;
  if (!c) return undefined;
  const js = c["application/json"];
  return js?.schema;
}

/**
 * Is `segs` (a recorded path split on ".") declared by `schema`? `atRoot` is true only for the response's own
 * schema: an open object AT THE ROOT declares no slot at all, so every read off it is undeclared.
 */
function declares(schema: Schema, segs: string[], depth = 0): boolean {
  if (depth > 40) return false;
  const r = resolve(schema);
  if (segs.length === 0) return true;
  const branches: Schema[] | undefined = r.anyOf ?? r.oneOf;
  if (branches) return branches.some((b) => declares(b, segs, depth + 1));
  if (r.allOf) return (r.allOf as Schema[]).some((b) => declares(b, segs, depth + 1));
  const [head, ...rest] = segs;
  if (head === "[]") return r.items ? declares(r.items, rest, depth + 1) : false;
  if (r.properties && Object.prototype.hasOwnProperty.call(r.properties, head)) return declares(r.properties[head], rest, depth + 1);
  if (r.additionalProperties && typeof r.additionalProperties === "object") return declares(r.additionalProperties, rest, depth + 1);
  return false;
}

// ── (i) the body, built from the schema ────────────────────────────────────
/**
 * `SEEDS` supplies a VALID value for a free-form slot (no `type`) where the default `"x"` would stop a reader
 * at its first gate (an `mpn` that is not a string is a dropped row, so the row's other fields are never read).
 * A seed must be something the schema permits; the only keys it adds sit inside open-object slots.
 */
const SEEDS: Record<string, Record<string, unknown>> = {
  // The producer declares these lists as arrays of OPEN objects, so the schema supplies empty items; a reader that
  // gets `{}` never reaches its field reads. The seeded keys sit inside a slot that declares nothing below it.
  "POST /decision_subgraph": {
    "live_nodes.[]": { uri: "urn:x:A", labels: ["Class"] },
    "live_edges.[]": { source: "urn:x:A", target: "urn:x:B", type: "REL" },
    "context_nodes.[]": { uri: "urn:x:B", labels: ["Class"] },
  },
  "GET /ingest/{ingest_id}/extraction": { "rows.[].mpn": "ABC-1", "rows.[].row_index": 0, "rows.[].part_index": 0 },
};

function build(schema: Schema, at: string, seeds: Record<string, unknown>, depth = 0): unknown {
  if (at in seeds) return seeds[at];
  if (depth > 12) return null;
  const r = resolve(schema);
  if ("const" in r) return r.const;
  if (Array.isArray(r.enum)) return r.enum[0];
  const branches: Schema[] | undefined = r.anyOf ?? r.oneOf;
  if (branches) {
    const first = branches.find((b) => resolve(b).type !== "null") ?? branches[0];
    return build(first, at, seeds, depth + 1);
  }
  if (r.properties || r.type === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries<Schema>(r.properties ?? {})) out[k] = build(v, at ? `${at}.${k}` : k, seeds, depth + 1);
    return out;
  }
  if (r.type === "array") return [build(r.items ?? {}, `${at ? at + "." : ""}[]`, seeds, depth + 1)];
  if (r.type === "string") return "x";
  if (r.type === "integer") return 1;
  if (r.type === "number") return 1.5;
  if (r.type === "boolean") return true;
  if (r.type === "null") return null;
  return "x"; // free-form (no `type`)
}

// ── (ii) the recording proxy ───────────────────────────────────────────────
/** Runtime probes that are not reads of the producer's fields: symbols, thenable and serialiser checks, React and
 *  test-runner introspection, and the Object.prototype / Array.prototype surface. */
const PROBES = new Set([
  "then", "toJSON", "constructor", "$$typeof", "asymmetricMatch", "nodeType", "tagName", "@@__IMMUTABLE_ITERABLE__@@",
  "inspect", "toString", "valueOf", "hasOwnProperty", "isPrototypeOf", "__proto__", "prototype", "_isMockFunction",
  "length",
]);

type Log = Map<string, Set<string>>;
const state = { reader: "(function)", log: new Map<string, Log>(), op: "" };

function record(op: string, path: string): void {
  let log = state.log.get(op);
  if (!log) state.log.set(op, (log = new Map()));
  let who = log.get(path);
  if (!who) log.set(path, (who = new Set()));
  who.add(state.reader);
}

const WRAP = { recursive: true };

function recording(value: unknown, op: string, at: string, root = true): unknown {
  if (value === null || typeof value !== "object") return value;
  const isArr = Array.isArray(value);
  return new Proxy(value as object, {
    get(target, key, recv) {
      const real = Reflect.get(target, key, recv);
      if (typeof key === "symbol" || PROBES.has(key)) return real;
      const seg = isArr && /^\d+$/.test(key) ? "[]" : key;
      if (isArr && seg !== "[]") return real; // array methods (map, filter, ...) are not field reads
      const p = at ? `${at}.${seg}` : seg;
      record(op, p);
      return WRAP.recursive || root ? recording(real, op, p, false) : real;
    },
    has(target, key) {
      if (typeof key !== "symbol" && !PROBES.has(key) && !isArr) record(op, at ? `${at}.${key}` : key);
      return Reflect.has(target, key);
    },
  });
}

sink.serve = (method: string, url: string) => {
  const snap = SNAP.find((o) => o.method === method && o.re.test(url));
  // An op outside the population (a consumer's own side fetch) gets an empty-but-iterable body; it is not under test.
  if (!snap || !POPULATION.includes(snap.key)) return { items: [] };
  const schema = responseSchema(snap);
  if (!schema) return { items: [] };
  const body = build(schema, "", SEEDS[snap.key] ?? {});
  return recording(body, snap.key, "");
};

// ── the population, computed from the generated file ───────────────────────
const GEN = readFileSync(path.join(__dirname, "generated/bff.ts"), "utf8");
const OPS_RE = /^ {2}"([A-Z]+ [^"]+)": \{[\s\S]*?\n {4}response: ([^;]+);/gm;
const ALL_OPS: string[] = [];
const POPULATION: string[] = [];
const BLOB_OPS: string[] = [];
for (let m = OPS_RE.exec(GEN); m; m = OPS_RE.exec(GEN)) {
  ALL_OPS.push(m[1]);
  if (m[2].trim() !== "unknown") POPULATION.push(m[1]);
  if (m[2].trim() === "Blob") BLOB_OPS.push(m[1]);
}

// ── client.ts: which exported function reads which typed op ────────────────
const CLIENT_SRC = readFileSync(path.join(__dirname, "client.ts"), "utf8");
const FN_RE = /^export (?:async )?function (\w+)/gm;
const FN_AT: { name: string; at: number }[] = [];
for (let m = FN_RE.exec(CLIENT_SRC); m; m = FN_RE.exec(CLIENT_SRC)) FN_AT.push({ name: m[1], at: m.index });
const FN_OPS = new Map<string, Set<string>>();
const CALL_RE = /\brequest(?:Full)?\(\s*"([A-Z]+ [^"]+)"/g;
for (let m = CALL_RE.exec(CLIENT_SRC); m; m = CALL_RE.exec(CLIENT_SRC)) {
  const owner = [...FN_AT].reverse().find((f) => f.at < m!.index);
  if (!owner || !POPULATION.includes(m[1])) continue;
  if (!FN_OPS.has(owner.name)) FN_OPS.set(owner.name, new Set());
  FN_OPS.get(owner.name)!.add(m[1]);
}

// ── (iii) the calls and the readers ────────────────────────────────────────
const CALLS: Record<string, () => Promise<unknown>> = {
  fetchEntitlements: () => client.fetchEntitlements(),
  fetchMyHumanTasks: () => client.fetchMyHumanTasks(),
  actOnHumanTask: () => client.actOnHumanTask("t-1", "approved"),
  requestTemplateCanvasSeed: () => client.requestTemplateCanvasSeed("tpl-1"),
  fetchDecisionSubgraph: () => client.fetchDecisionSubgraph({ class_uris: ["urn:x:A"] }),
  registerFrontendCapabilities: () =>
    client.registerFrontendCapabilities({ frontend_id: "cortex-ui", frontend_version: "0", capabilities: [] }),
  fetchBffVersion: () => client.fetchBffVersion(),
  uploadIngest: () => client.uploadIngest(new File(["x"], "a.pdf"), "pdf", "me", "pdf"),
  fetchIngestStatus: () => client.fetchIngestStatus("i-1"),
  fetchIngestMine: () => client.fetchIngestMine(20),
  retryIngest: () => client.retryIngest("i-1"),
  fetchIngestExtraction: () => client.fetchIngestExtraction("i-1"),
  correctIngestLeaf: () => client.correctIngestLeaf("i-1", "pcn"),
};

const settle = () => rtlAct(async () => { await new Promise((r) => setTimeout(r, 30)); });

const TASK = { task_id: "t-1", kind: "workflow_ack", title: "t", summary: "s", audience: "a", requested_by: "r", subject_ref: null };
const BATCH = {
  batch_id: "t-1", notice_id: "PCN-1", notice_type: "PCN", notice_fingerprint: "fp", approver: "me",
  items: [{ mpn: "AAA-1", proposed_disposition: "dispatchLTB", needs_review: false }],
};

const ROUTING = {
  about: { label: "A", uri: "urn:x:A", confidence: 0.9, instance_resolved: false },
  action: { label: "L", iri: "mesh:l", confidence: 0.8, classify_called: true, candidate_count: 1 },
  handled_by: { engine_name: "E", provider: "p" },
  candidates: [{ uri: "urn:x:A", label: "A", score: 0.9 }],
};

type Reader = (result: any) => unknown;
/** Each reader is a NAMED function: its name is what a failure reports. */
const READERS: Record<string, Reader[]> = {
  fetchEntitlements: [
    async function personaStoreLoadEntitlements(e) {
      usePersonaStore.setState({ entitlements: null, ownerSub: null, selectedPersona: null, selectedDomains: [] });
      await usePersonaStore.getState().loadEntitlements(async () => e);
      const st = usePersonaStore.getState();
      st.hasEntitlements();
      for (const p of st.personas()) st.domainsFor(p);
    },
    function dropIdentityOf(e) { return dropIdentity(e, null); },
    function viewerAuthzIdOfEntitlements(e) { return viewerAuthzIdOf(e); },
  ],
  fetchMyHumanTasks: [
    function humanTaskFromRowAndDeclaration(r) {
      for (const t of r.tasks) {
        const task = humanTaskFromRow(t);
        if (task) readTaskDeclaration(task.declaration);
      }
    },
    async function seedFromRestLive() { seedFromRest(); await settle(); },
  ],
  actOnHumanTask: [
    function stageOutcomeSentenceOf(res) { return stageOutcomeSentence("approved", res); },
    async function useTaskActApprove() {
      const { result } = renderHook(() => useTaskAct(TASK as any));
      await rtlAct(async () => { await result.current.act("approved"); });
    },
    async function groupedReviewTableResolve() {
      const { container } = render(React.createElement(GroupedReviewTable, { batch: BATCH as any }));
      const btn = Array.from(container.querySelectorAll("button")).find((b) => /^Resolve/.test(b.textContent ?? ""));
      if (!btn) throw new Error("no Resolve button");
      await rtlAct(async () => { fireEvent.click(btn); await new Promise((r) => setTimeout(r, 30)); });
    },
  ],
  fetchDecisionSubgraph: [
    function buildCorridorDataOf(live) {
      return buildCorridorData(ROUTING as any, [], [], live);
    },
    function buildMapModelOf(live) {
      return buildMapModel(collectCapturedDecision(ROUTING as any, [], []), live);
    },
  ],
  registerFrontendCapabilities: [
    async function frontendCapabilityRegistration() {
      renderHook(() => useFrontendCapabilityRegistration());
      await settle();
    },
  ],
  fetchBffVersion: [
    function bffLabelOf(r) { return bffLabel(r); },
    async function buildStampRenders() { render(React.createElement(BuildStamp)); await settle(); },
  ],
  uploadIngest: [function readIngestUploadIdOf(raw) { return readIngestUploadId(raw); }],
  fetchIngestStatus: [function readIngestStatusRowOf(raw) { return readIngestStatusRow(raw); }],
  fetchIngestMine: [function readIngestMinePageOf(raw) { return readIngestMinePage(raw); }],
  retryIngest: [
    async function ingestStatusStoreRetry() { await useIngestStatusStore.getState().retry("i-1"); },
  ],
  fetchIngestExtraction: [function readExtractionOf(raw) { return readExtraction(raw); }],
  correctIngestLeaf: [function readIngestStatusRowOfLeaf(raw) { return readIngestStatusRow(raw); }],
};

/** A typed read nobody reads field by field, with the reason. Keyed by client function, or by op when no
 *  client function calls it. */
const NO_READER: Record<string, string> = {
  requestTemplateCanvasSeed: "the client function is the only reader: it maps the body to {artifactIds}; useTemplateSeed receives that derived object",
  fetchIngestSource: "binary body (Blob): bytes, no fields",
  "GET /artifacts/{artifact_id}": "no client.ts function calls this op",
  "GET /ingest/retries": "no client.ts function calls this op",
  "GET /version": "no client.ts function calls this op",
  "POST /ingest/{ingest_id}/empty": "no client.ts function calls this op",
  "POST /ingest/{ingest_id}/title_leaf": "no client.ts function calls this op",
};

/** Ratchet: paths read per typed read. Falls only when a reader stops reading; see the failure message. */
const READ_FLOOR: Record<string, number> = {
  fetchEntitlements: 9,
  fetchMyHumanTasks: 24,
  actOnHumanTask: 6,
  requestTemplateCanvasSeed: 2,
  fetchDecisionSubgraph: 9,
  registerFrontendCapabilities: 3,
  fetchBffVersion: 1,
  uploadIngest: 1,
  fetchIngestStatus: 3,
  fetchIngestMine: 6,
  retryIngest: 1,
  fetchIngestExtraction: 24,
  correctIngestLeaf: 3,
};

// ── run everything once, so the test names can carry the counts ────────────
interface Outcome {
  fn: string;
  op: string;
  paths: Map<string, Set<string>>;
  errors: string[];
}
const OUTCOMES: Outcome[] = [];

async function runOne(fn: string, op: string): Promise<Outcome> {
  state.log.delete(op);
  seen.length = 0;
  const errors: string[] = [];
  state.reader = `${fn} (the client function itself)`;
  let result: unknown;
  try {
    result = await CALLS[fn]();
  } catch (e) {
    errors.push(`${fn} threw: ${e instanceof Error ? e.message : String(e)}`);
  }
  for (const reader of READERS[fn] ?? []) {
    state.reader = reader.name;
    try {
      await reader(result);
    } catch (e) {
      const where = e instanceof Error ? (e.stack ?? "").split(String.fromCharCode(10))[1]?.trim() ?? "" : "";
      errors.push(`reader ${reader.name} threw: ${e instanceof Error ? e.message : String(e)} @ ${where}`);
    }
    cleanup();
  }
  return { fn, op, paths: new Map(state.log.get(op) ?? []), errors };
}

const ACTIVE_FNS = [...FN_OPS.entries()].filter(([fn]) => !(fn in NO_READER) || fn === "requestTemplateCanvasSeed");
const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
const info = vi.spyOn(console, "info").mockImplementation(() => {});
for (const [fn, ops] of ACTIVE_FNS) {
  if (!(fn in CALLS)) continue;
  for (const op of ops) OUTCOMES.push(await runOne(fn, op));
}
warn.mockRestore();
info.mockRestore();

const undeclared = (o: Outcome): string[] => {
  const snap = BY_KEY.get(o.op);
  const schema = snap ? responseSchema(snap) : undefined;
  const awaiting = AWAITING_DECLARATION[o.op] ?? {};
  const out: string[] = [];
  for (const [p, who] of o.paths) {
    if (schema && declares(schema, p.split("."))) continue;
    if (p in awaiting) continue;
    out.push(`${o.op}: "${p}" is read by ${[...who].join(", ")} and the producer does not declare it (add it to AWAITING_DECLARATION with its evidence, or delete the read)`);
  }
  return out;
};

beforeEach(() => { seen.length = 0; });
afterEach(() => cleanup());

// ── the census ─────────────────────────────────────────────────────────────
describe("the population is computed, and every member is accounted for", () => {
  it(`${POPULATION.length} typed ops (of ${ALL_OPS.length}); ${ALL_OPS.length - POPULATION.length} untyped keep their hand shapes`, () => {
    expect(POPULATION.length, "the generated file lists no typed op: the regex read nothing").toBeGreaterThan(0);
    expect(ALL_OPS.length).toBe(SNAP.length);
  });

  it("the snapshot's declared JSON 200s are exactly the population, bar binary bodies", () => {
    const declared = SNAP.filter((o) => responseSchema(o) !== undefined && Object.keys(responseSchema(o)!).length > 0).map((o) => o.key).sort();
    const typedJson = POPULATION.filter((o) => !BLOB_OPS.includes(o)).sort();
    expect(typedJson, "an op is typed in bff.ts but declares no JSON 200 in the snapshot, or the reverse: regenerate").toEqual(declared);
  });

  it("every typed read has READERS or a NO_READER reason, and nothing stale is listed", () => {
    const units = new Set<string>([...FN_OPS.keys(), ...POPULATION.filter((op) => ![...FN_OPS.values()].some((s) => s.has(op)))]);
    const problems: string[] = [];
    for (const u of units) {
      const hasReaders = (READERS[u]?.length ?? 0) > 0;
      const hasReason = u in NO_READER;
      if (!hasReaders && !hasReason) problems.push(`${u}: a typed read with no READERS entry and no NO_READER reason`);
      if (hasReaders && hasReason && u !== "requestTemplateCanvasSeed") problems.push(`${u}: both READERS and NO_READER`);
    }
    for (const k of Object.keys(READERS)) if (!units.has(k)) problems.push(`READERS lists "${k}", which is not a typed read`);
    for (const k of Object.keys(NO_READER)) if (!units.has(k)) problems.push(`NO_READER lists "${k}", which is not a typed read`);
    for (const k of Object.keys(CALLS)) if (!FN_OPS.has(k)) problems.push(`CALLS lists "${k}", which calls no typed op`);
    for (const fn of FN_OPS.keys()) if (!(fn in CALLS) && !(fn in NO_READER)) problems.push(`${fn}: no CALLS entry`);
    for (const k of Object.keys(READ_FLOOR)) if (!units.has(k)) problems.push(`READ_FLOOR lists "${k}", which is not a typed read`);
    expect(problems).toEqual([]);
  });
});

// ── no double-cast on a typed read ──────────────────────────────────────────
describe("a typed read carries no `as unknown as` cast", () => {
  // ArrayBuffer: fetchIngestSource's binary body.
  const ALLOWED = new Set(["ArrayBuffer"]);
  it("every `as unknown as X` in client.ts is on the allow-list, and no pass-B marker remains", () => {
    const casts = [...CLIENT_SRC.matchAll(/as unknown as (\w+)/g)].map((m) => m[1]);
    expect(casts.filter((c) => !ALLOWED.has(c)), "a cast on a typed read: type it, or ledger the field").toEqual([]);
    expect(CLIENT_SRC.match(/\/\/ pass B:/g) ?? [], "a '// pass B:' marker is back").toEqual([]);
  });
});

// ── (iv) the seal ──────────────────────────────────────────────────────────
describe("cortex reads no field the producer does not declare", () => {
  for (const o of OUTCOMES) {
    it(`${o.op} (${o.fn}): ${o.paths.size} paths read, all declared or awaiting`, () => {
      expect(o.errors, "a reader or the client function threw").toEqual([]);
      if (!(o.fn in NO_READER) || o.fn === "requestTemplateCanvasSeed") {
        expect(o.paths.size, `${o.op}: zero paths recorded: nothing read this response`).toBeGreaterThan(0);
      }
      const floor = READ_FLOOR[o.fn];
      if (floor !== undefined) {
        expect(
          o.paths.size,
          `${o.op}: paths read fell below ${floor}. Either a reader stopped reading or the Proxy stopped recording; lower READ_FLOOR only after checking which.`,
        ).toBeGreaterThanOrEqual(floor);
      }
      expect(undeclared(o)).toEqual([]);
    });
  }

  it("every typed read that has a client function was exercised", () => {
    const ran = new Set(OUTCOMES.map((o) => o.fn));
    const missing = [...FN_OPS.keys()].filter((fn) => fn in CALLS && !ran.has(fn));
    expect(missing).toEqual([]);
  });
});

describe("AWAITING_DECLARATION expires by computation", () => {
  const entries = Object.entries(AWAITING_DECLARATION).flatMap(([op, paths]) => Object.entries(paths).map(([p, why]) => ({ op, p, why })));

  it(`${entries.length} entries; each names a typed op and carries a reason`, () => {
    for (const e of entries) {
      expect(POPULATION, `${e.op} is not a typed op`).toContain(e.op);
      expect(e.why.trim().length, `${e.op} ${e.p}: no reason`).toBeGreaterThan(10);
    }
  });

  it("an entry the schema now declares goes red", () => {
    const stale = entries
      .filter((e) => {
        const snap = BY_KEY.get(e.op);
        const schema = snap ? responseSchema(snap) : undefined;
        return schema ? declares(schema, e.p.split(".")) : false;
      })
      .map((e) => `${e.op} "${e.p}": declared now: drop it from AWAITING_DECLARATION`);
    expect(stale).toEqual([]);
  });

  it("an entry nothing reads goes red", () => {
    const unread = entries
      .filter((e) => !OUTCOMES.some((o) => o.op === e.op && o.paths.has(e.p)))
      .map((e) => `${e.op} "${e.p}": nothing reads it: drop it from AWAITING_DECLARATION`);
    expect(unread).toEqual([]);
  });
});
