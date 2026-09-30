/**
 * ingestMock — an in-memory mock transport for the REAL ADR-0041 ingest routes.
 *
 * Same function signatures as the real transport in `src/api/client.ts`, selected by
 * `isIngestMockEnabled()` via `ingestTransport.ts`. NO fetch/axios/EventSource/WebSocket of any
 * kind — this module must stay outside `check:transport`'s reach entirely; it is dev fixture
 * data, not the wrapper.
 *
 * Lifecycle, per `ingest_status.py.STATUSES`:
 *   upload                   → `received`
 *   poll (successive calls)  → `received` → `classified` → `extracting` → `extracted` →
 *                               `review` — at `review`, a synthetic `document_promotion`
 *                               HumanTask is upserted into `useHumanTaskStore`, `payload.ingest_id`
 *                               bridged via `promotionIngestId` (`sha256:<sha256>`), so the card's
 *                               real lookup logic is exercised end to end against the mock too.
 *   act (promoted/rejected)  → NOT intercepted here. `actOnHumanTask` (the real, already-served
 *                               route) resolves the mock task the same way it resolves a real one;
 *                               this module only seeds the task, never answers the act.
 *   a filename containing "dup" → the upload responds `{id, status:"duplicate", detail,
 *                               duplicate_of}`, and a row IS persisted (mirrors
 *                               `record_duplicate_arrival` actually writing a row server-side —
 *                               see `ingest_status.py` — so `fetchIngestStatus` stays consistent
 *                               for a duplicate id too).
 */
import { useHumanTaskStore, type HumanTask } from "@/store/useHumanTaskStore";
import { promotionIngestId } from "./ingestWire";

const ADVANCE: Record<string, string> = {
  received: "classified",
  classified: "extracting",
  extracting: "extracted",
  extracted: "review",
};

interface MockRow {
  id: string;
  sha256: string;
  kind: string;
  object_prefix: string;
  submitted_by: string;
  on_behalf_of: string;
  source: string;
  status: string;
  extracted_count: number | null;
  extracted_total: number | null;
  duplicate_of: string | null;
  detail: string | null;
  created_at: string;
  updated_at: string;
}

const STORE = new Map<string, MockRow>();
let counter = 0;

function nowIso(): string {
  return new Date().toISOString();
}

function sha256For(n: number): string {
  // Not a real digest — a deterministic, fixed-length hex string is enough for the mock's own
  // bridge test (promotionIngestId only cares that it is a string).
  return n.toString(16).padStart(8, "0").repeat(8).slice(0, 64);
}

export function uploadIngest(file: File, kind: string, onBehalfOf: string): Promise<unknown> {
  counter += 1;
  const sha256 = sha256For(counter);
  const id = sha256;
  const isDuplicate = /dup/i.test(file.name);
  const now = nowIso();

  if (isDuplicate) {
    const row: MockRow = {
      id,
      sha256,
      kind,
      object_prefix: `ingest/${id}/`,
      submitted_by: onBehalfOf,
      on_behalf_of: onBehalfOf,
      source: file.name,
      status: "duplicate",
      extracted_count: null,
      extracted_total: null,
      duplicate_of: sha256For(1),
      detail: `already processed on ${now.slice(0, 10)} from ${file.name}`,
      created_at: now,
      updated_at: now,
    };
    STORE.set(id, row);
    return Promise.resolve({
      id,
      status: "duplicate",
      detail: row.detail,
      duplicate_of: row.duplicate_of,
    });
  }

  const row: MockRow = {
    id,
    sha256,
    kind,
    object_prefix: `ingest/${id}/`,
    submitted_by: onBehalfOf,
    on_behalf_of: onBehalfOf,
    source: file.name,
    status: "received",
    extracted_count: null,
    extracted_total: null,
    duplicate_of: null,
    detail: null,
    created_at: now,
    updated_at: now,
  };
  STORE.set(id, row);
  return Promise.resolve({ id, status: row.status, object_prefix: row.object_prefix });
}

/** Advances the record's lifecycle by one tick (once it has settled past `received`, so the
 *  immediate post-upload fetch is not skipped a step), seeding a review task at `review`. */
export function fetchIngestStatus(ingestId: string): Promise<unknown> {
  const row = STORE.get(ingestId);
  if (!row) {
    const err = new Error(`mock: unknown ingest id ${ingestId}`) as Error & {
      response?: { status: number; data: { detail: string } };
    };
    err.response = { status: 404, data: { detail: "not found" } };
    return Promise.reject(err);
  }

  const next = ADVANCE[row.status];
  if (next) {
    row.status = next;
    row.updated_at = nowIso();
    if (next === "extracting") {
      row.extracted_count = 0;
      row.extracted_total = 12;
    } else if (next === "extracted") {
      row.extracted_count = 12;
    } else if (next === "review") {
      seedReviewTask(row);
    }
  }

  return Promise.resolve({ ...row });
}

function seedReviewTask(row: MockRow): void {
  const task: HumanTask = {
    id: `mock-task-${row.id}`,
    taskId: `mock-task-${row.id}`,
    workflowId: null,
    audience: "promotion:DATA_ENGINEERING",
    kind: "document_promotion",
    status: "pending",
    title: "Promote or reject this document",
    summary: row.source,
    requestedBy: row.submitted_by,
    subjectRef: row.id,
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
