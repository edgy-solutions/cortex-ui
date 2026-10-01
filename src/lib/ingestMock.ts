/**
 * ingestMock — an in-memory mock transport for the REAL ADR-0041 ingest routes.
 *
 * Same function signatures as the real transport in `src/api/client.ts`, selected by
 * `isIngestMockEnabled()` via `ingestTransport.ts`. NO fetch/axios/EventSource/WebSocket of any
 * kind — this module must stay outside `check:transport`'s reach entirely; it is dev fixture
 * data, not the wrapper.
 *
 * Lifecycle, per `ingest_status.py.STAGES` (producer 0f48fe2f):
 *   upload                   → `received`
 *   poll (successive calls)  → `received` → `extracting` → `awaiting_disposition` — at
 *                               `awaiting_disposition`, a synthetic `document_promotion` HumanTask
 *                               is upserted into `useHumanTaskStore`, `payload.ingest_id` set to
 *                               the row's own `ingest_id` (no bridging needed — see
 *                               `promotionIngestId`'s doc comment), so the card's real lookup
 *                               logic is exercised end to end against the mock too.
 *   act (promoted/rejected)  → NOT intercepted here. `actOnHumanTask` (the real, already-served
 *                               route) resolves the mock task the same way it resolves a real one;
 *                               this module only seeds the task, never answers the act.
 *   a filename containing "dup" → the upload responds `{ingest_id, stage, detail,
 *                               duplicate: {of_ingest_id, message}}`, and a row IS persisted
 *                               (mirrors `record_duplicate_arrival` actually writing a row
 *                               server-side — see `ingest_status.py` — so `fetchIngestStatus`
 *                               stays consistent for a duplicate id too).
 */
import { useHumanTaskStore, type HumanTask } from "@/store/useHumanTaskStore";
import { promotionIngestId, type IngestStage } from "./ingestWire";

const ADVANCE: Partial<Record<IngestStage, IngestStage>> = {
  received: "extracting",
  extracting: "awaiting_disposition",
};

interface MockRow {
  ingest_id: string;
  sha256: string;
  kind: string;
  stage: IngestStage | null;
  detail: string | null;
  duplicate: { of_ingest_id: string; message: string } | null;
  created_at: number;
  updated_at: number;
}

const STORE = new Map<string, MockRow>();
let counter = 0;

function sha256For(n: number): string {
  // Not a real digest — a deterministic, fixed-length hex string is enough for the mock's own
  // bridge test (promotionIngestId only cares that ingest_id is a string in the right shape).
  return n.toString(16).padStart(8, "0").repeat(8).slice(0, 64);
}

/** A duplicate's `ingest_id` is its OWN row id on the live wire, never the sha256 form
 *  (roll-11 capture exchanges [2]/[3]) — a real uuid where available, else a deterministic
 *  fallback so the mock stays usable in an environment with no `crypto.randomUUID`. */
function uuidFor(n: number): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `00000000-0000-4000-8000-${n.toString(16).padStart(12, "0")}`;
}

export function uploadIngest(file: File, kind: string, onBehalfOf: string): Promise<unknown> {
  void onBehalfOf;
  counter += 1;
  const sha256 = sha256For(counter);
  const isDuplicate = /dup/i.test(file.name);
  const now = Date.now();

  if (isDuplicate) {
    // Mirrors `record_duplicate_arrival`: the ORIGINAL (first upload) is always row #1 here, a
    // fixed stand-in since the mock has no real find_primary_by_sha dedupe index.
    const original = STORE.get(`sha256:${sha256For(1)}`) ?? null;
    const ingestId = uuidFor(counter);
    const detail = `already processed on ${new Date(now).toISOString().slice(0, 10)} from ${file.name}`;
    const row: MockRow = {
      ingest_id: ingestId,
      sha256,
      kind,
      // The duplicate's own row does NOT advance — it is the ORIGINAL's stage as observed at
      // upload time, frozen (see `fetchIngestStatus` below, which never ticks a duplicate row).
      stage: original?.stage ?? "received",
      detail,
      duplicate: { of_ingest_id: original?.ingest_id ?? `sha256:${sha256For(1)}`, message: detail },
      created_at: now,
      updated_at: now,
    };
    STORE.set(ingestId, row);
    return Promise.resolve({
      ingest_id: ingestId,
      stage: row.stage,
      detail: row.detail,
      duplicate: row.duplicate,
    });
  }

  const ingestId = `sha256:${sha256}`;
  const row: MockRow = {
    ingest_id: ingestId,
    sha256,
    kind,
    stage: "received",
    detail: null,
    duplicate: null,
    created_at: now,
    updated_at: now,
  };
  STORE.set(ingestId, row);
  return Promise.resolve({ ingest_id: ingestId, stage: row.stage, detail: null, object_prefix: `ingest/${ingestId}/`, duplicate: null });
}

/** Advances the record's lifecycle by one tick (once it has settled past `received`, so the
 *  immediate post-upload fetch is not skipped a step), seeding a review task at
 *  `awaiting_disposition`. */
export function fetchIngestStatus(ingestId: string): Promise<unknown> {
  const row = STORE.get(ingestId);
  if (!row) {
    const err = new Error(`mock: unknown ingest id ${ingestId}`) as Error & {
      response?: { status: number; data: { detail: string } };
    };
    err.response = { status: 404, data: { detail: "ingest not found" } };
    return Promise.reject(err);
  }

  // A duplicate row never advances — it is out-of-band on the real wire too (DUPLICATE is never
  // in the STAGES ladder), and returning it as-is on every fetch mirrors that.
  if (row.duplicate === null && row.stage !== null) {
    const next = ADVANCE[row.stage];
    if (next) {
      row.stage = next;
      row.updated_at = Date.now();
      if (next === "awaiting_disposition") {
        seedReviewTask(row);
      }
    }
  }

  return Promise.resolve({ ...row });
}

function seedReviewTask(row: MockRow): void {
  const task: HumanTask = {
    id: `mock-task-${row.ingest_id}`,
    taskId: `mock-task-${row.ingest_id}`,
    workflowId: null,
    audience: "promotion:DATA_ENGINEERING",
    kind: "document_promotion",
    status: "pending",
    title: "Promote or reject this document",
    summary: row.ingest_id,
    requestedBy: "mock-caller",
    subjectRef: row.ingest_id,
    payload: { ingest_id: promotionIngestId(row) },
    createdAt: Date.now(),
  };
  useHumanTaskStore.getState().upsertTask(task);
}

/** Test/dev-only reset — the module is a singleton store across the session otherwise. */
export function __resetIngestMock(): void {
  STORE.clear();
  counter = 0;
}
