/**
 * ingestMock — an in-memory mock transport for the REAL ADR-0041 ingest routes.
 *
 * Same function signatures as the real transport in `src/api/client.ts`, selected by
 * `isIngestMockEnabled()` via `ingestTransport.ts`. NO fetch/axios/EventSource/WebSocket of any
 * kind — this module must stay outside `check:transport`'s reach entirely; it is dev fixture
 * data, not the wrapper.
 *
 * Lifecycle, per `ingest_status.py.STAGES` (producer 4c3b61a6; `review`, renamed from
 * `awaiting_disposition` in 1c10e28c):
 *   upload                   → `received`
 *   poll (successive calls)  → `received` → `extracting` → `review` — at
 *                               `review`, a synthetic `document_promotion` HumanTask
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
 *
 * CORTEX-PROPOSED ORIGIN (`src/lib/ingestOrigin.ts`) — no row here ever gets an `origin` from
 * upload; `MockRow.origin` is undefined by default, which `fetchIngestStatus` returns as the
 * row's own absence of the key, read by `readIngestOrigin` as `null` — the same "absent" state
 * the real, unbuilt producer route is in today. The ONLY way a mock row carries one is
 * `__seedMockOriginFixture`, a named, hand-built test fixture — never sniffed from the filename.
 * `disputeIngestOrigin` is mocked alongside it, resolving with a fake steward task id and
 * mutating nothing.
 */
import { useHumanTaskStore, type HumanTask } from "@/store/useHumanTaskStore";
import { promotionIngestId, type IngestStage } from "./ingestWire";
import type { IngestOrigin } from "./ingestOrigin";

const ADVANCE: Partial<Record<IngestStage, IngestStage>> = {
  received: "extracting",
  extracting: "review",
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
  /**
   * CORTEX-PROPOSED, and absent by default — the real producer serves no origin, and
   * `uploadIngest` below never sets this. It is populated ONLY through
   * `__seedMockOriginFixture` below, a named, hand-built test fixture, never derived from the
   * filename the way `duplicate` is — origin is not something a dropper's filename could ever
   * carry, so it would be dishonest to sniff it the same way.
   */
  origin?: IngestOrigin | null;
  /** PROPOSED wire field (see `IngestStatusRow.suggested_content_kind`): set only when a drop reaches
   *  `review`, from the filename — /pcn/i → "pcn", /pdn/i → "pdn". Absent otherwise. */
  suggested_content_kind?: string;
}

const STORE = new Map<string, MockRow>();
/** Filenames of non-duplicate drops, kept OFF the row so the row's shape is unchanged. */
const FILE_NAMES = new Map<string, string>();
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
  FILE_NAMES.set(ingestId, file.name);
  return Promise.resolve({ ingest_id: ingestId, stage: row.stage, detail: null, object_prefix: `ingest/${ingestId}/`, duplicate: null });
}

/** Advances the record's lifecycle by one tick (once it has settled past `received`, so the
 *  immediate post-upload fetch is not skipped a step), seeding a review task at
 *  `review`. */
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
      if (next === "review") {
        const name = FILE_NAMES.get(row.ingest_id) ?? "";
        if (/pcn/i.test(name)) row.suggested_content_kind = "pcn";
        else if (/pdn/i.test(name)) row.suggested_content_kind = "pdn";
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

/**
 * CORTEX-PROPOSED — `POST /ingest/{ingest_id}/origin/dispute`'s mock. Resolves with a fake
 * steward task id; does not mutate the row at all (the "Sent to the steward" state the card
 * draws afterward is the card's own local state, not a re-fetch of this row — see
 * `IngestStatusCard`'s dispute handling).
 */
export function disputeIngestOrigin(ingestId: string, onBehalfOf: string): Promise<{ steward_task_id: string }> {
  void onBehalfOf;
  return Promise.resolve({ steward_task_id: `mock-steward-task-${ingestId}` });
}

/** PROPOSED — `POST /ingest/{id}/content_kind`'s mock: accepts the confirm for a known row, 404 otherwise. */
export function confirmIngestContentKind(ingestId: string, contentKind: string): Promise<unknown> {
  if (!STORE.has(ingestId)) {
    const err = new Error(`mock: unknown ingest id ${ingestId}`) as Error & {
      response?: { status: number; data: { detail: string } };
    };
    err.response = { status: 404, data: { detail: "ingest not found" } };
    return Promise.reject(err);
  }
  return Promise.resolve({ ingest_id: ingestId, content_kind: contentKind });
}

/**
 * THE NAMED, HAND-BUILT FIXTURE for origin — see `MockRow.origin`'s doc comment. Sets a row's
 * `origin` directly for a test to exercise `IngestStatusCard`'s origin section against the mock
 * transport end to end; nothing else in this module ever populates it. Throws if the row does
 * not exist, rather than silently creating one, since the fixture is meant to decorate an
 * upload that already happened.
 */
export function __seedMockOriginFixture(ingestId: string, origin: IngestOrigin | null): void {
  const row = STORE.get(ingestId);
  if (!row) throw new Error(`__seedMockOriginFixture: no mock row for ${ingestId}`);
  row.origin = origin;
}

/** Test/dev-only reset — the module is a singleton store across the session otherwise. */
export function __resetIngestMock(): void {
  STORE.clear();
  FILE_NAMES.clear();
  counter = 0;
}
