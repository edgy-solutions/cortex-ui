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
 *                               The task carries 193's payload header and title (the notice id),
 *                               and `fetchIngestExtraction` / `fetchIngestSource` answer with the
 *                               fixture notice's rows and the PDF they were extracted from
 *                               (`promotionReviewFixture.ts`). Every drop gets the same notice,
 *                               so the review card can be walked before 193 rolls.
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
import {
  INGEST_AWAITING_KIND_STATUS,
  promotionIngestId,
  type IngestFailure,
  type IngestLeaf,
  type IngestLeafCandidate,
  type IngestLeafSource,
  type IngestOobDocumentStatus,
  type IngestStage,
} from "./ingestWire";
import type { IngestOrigin } from "./ingestOrigin";
import type { IngestSource } from "@/api/client";
import { fixtureExtractionBody, fixturePdfBytes, fixturePromotionPayload, FIXTURE_NOTICE_ID } from "./promotionReviewFixture";

const ADVANCE: Partial<Record<IngestStage, IngestStage>> = {
  received: "extracting",
  extracting: "review",
};

interface MockRow {
  ingest_id: string;
  sha256: string;
  kind: string;
  stage: IngestStage | IngestOobDocumentStatus | null;
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
  /** PROPOSED wire pair (see `IngestStatusRow.leaf`): both null while `received`, unless the drop
   *  DECLARED a leaf (`contentKind` "pcn"/"pdn" → that leaf, source "declared", from `received` on; such a row
   *  never reads its title and never parks). Otherwise the title read is extraction's first step (architect,
   *  10-21), so entering `extracting` reads the filename — /pcn/i → "pcn", /pdn/i → "pdn" (source "title");
   *  neither parks the row at `awaiting_kind` before parts extraction. A correction sets source "corrected"
   *  with `corrected_by` "mock-caller". Absent on a duplicate's row. */
  leaf?: IngestLeaf | null;
  leaf_source?: IngestLeafSource | null;
  corrected_by?: string | null;
  /** PROPOSED `leaf_candidates`: set only when a parked row's filename contains "notice" (PCN 0.55, then PDN 0.4,
   *  both on the same title crop, in page fractions); no such key otherwise. A correction removes the key. */
  leaf_candidates?: IngestLeafCandidate[];
  /** Mirrors the wire's `failure`/`attempt` (33b80988). Set only by `__seedMockFailedFixture` — the mock never fails a drop on its own. */
  failure?: IngestFailure | null;
  attempt?: number;
}

const STORE = new Map<string, MockRow>();
/** Filenames of non-duplicate drops, kept OFF the row so the row's shape is unchanged. */
const FILE_NAMES = new Map<string, string>();
let counter = 0;
/** The first non-duplicate drop: the stand-in "original" a later duplicate points at. */
let FIRST_ORIGINAL: string | null = null;

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

export function uploadIngest(file: File, kind: string, onBehalfOf: string, contentKind: string): Promise<unknown> {
  void onBehalfOf;
  counter += 1;
  const sha256 = sha256For(counter);
  const isDuplicate = /dup/i.test(file.name);
  const now = Date.now();

  if (isDuplicate) {
    // Mirrors TODAY'S server (IA 3976a9e0, gateway.py:9381-9397): a duplicate WRITES a new row
    // (fresh uuid, status=duplicate) and answers { ingest_id: <that uuid>, stage: <the original's
    // stage at that moment>, detail, duplicate: { of_ingest_id: <original id>, message } }.
    // Cortex must never draw the uuid or that stage; the architect has ruled the server shall not
    // mint the row at all. The ORIGINAL is the first non-duplicate drop here, a stand-in since the
    // mock has no real find_primary_by_sha dedupe index.
    const original = (FIRST_ORIGINAL ? STORE.get(FIRST_ORIGINAL) : undefined) ?? null;
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
  const declared: IngestLeaf | null = contentKind === "pcn" || contentKind === "pdn" ? contentKind : null;
  const row: MockRow = {
    ingest_id: ingestId,
    sha256,
    kind,
    stage: "received",
    detail: null,
    duplicate: null,
    created_at: now,
    updated_at: now,
    leaf: declared ?? null,
    leaf_source: declared ? "declared" : null,
    corrected_by: null,
  };
  STORE.set(ingestId, row);
  FILE_NAMES.set(ingestId, file.name);
  FIRST_ORIGINAL ??= ingestId;
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
    const next = (ADVANCE as Record<string, IngestStage | undefined>)[row.stage];
    if (next) {
      row.stage = next;
      row.updated_at = Date.now();
      if (next === "extracting") {
        // The title read is extraction's first step: a leaf from it carries on into parts extraction;
        // none parks the row before parts extraction until someone picks (it does not advance).
        // A declared leaf (or one already corrected) is never re-read.
        const name = FILE_NAMES.get(row.ingest_id) ?? "";
        const leaf: IngestLeaf | null = row.leaf ?? (/pcn/i.test(name) ? "pcn" : /pdn/i.test(name) ? "pdn" : null);
        if (leaf) {
          if (!row.leaf) {
            row.leaf = leaf;
            row.leaf_source = "title";
          }
        } else {
          row.stage = INGEST_AWAITING_KIND_STATUS;
          if (/notice/i.test(name)) {
            const evidence_ref = { page: 1, bbox: [0.07, 0.03, 0.92, 0.07] as [number, number, number, number] };
            row.leaf_candidates = [
              { leaf: "pcn", score: 0.55, evidence_ref },
              { leaf: "pdn", score: 0.4, evidence_ref: { ...evidence_ref, bbox: [...evidence_ref.bbox] } },
            ];
          }
        }
      }
      if (row.stage === "review") seedReviewTask(row);
    }
  }

  return Promise.resolve({ ...row });
}

/** `GET /ingest/mine`'s mock: every row this tab uploaded, newest first, unadvanced. Its cursor is
 *  the offset as a string — the real one is opaque, and the store never reads it, only passes it back. */
export function fetchIngestMine(limit: number, before: string | null = null): Promise<unknown> {
  const all = [...STORE.values()].sort((a, b) => b.created_at - a.created_at);
  const from = before === null ? 0 : Number(before);
  const items = all.slice(from, from + limit).map((r) => ({ ...r }));
  return Promise.resolve({ items, next: from + limit < all.length ? String(from + limit) : null });
}

/**
 * `POST /ingest/{id}/retry`'s mock: a `failed` row goes back to `received`, attempt + 1, failure null;
 * anything else rejects with the wrapped 409 `not_failed` the real route answers.
 */
export function mockRetryIngest(ingestId: string): Promise<unknown> {
  const row = STORE.get(ingestId);
  if (row && row.stage === "failed") {
    row.stage = "received";
    row.attempt = (row.attempt ?? 1) + 1;
    row.failure = null;
    row.updated_at = Date.now();
    return Promise.resolve({ ingest_id: ingestId, stage: "received", attempt: row.attempt });
  }
  const err = new Error(`mock: ingest ${ingestId} is not failed`) as Error & {
    response?: { status: number; data: { detail: { error: string } } };
  };
  err.response = { status: 409, data: { detail: { error: "not_failed" } } };
  return Promise.reject(err);
}

function seedReviewTask(row: MockRow): void {
  const task: HumanTask = {
    id: `mock-task-${row.ingest_id}`,
    taskId: `mock-task-${row.ingest_id}`,
    workflowId: null,
    audience: "promotion:DATA_ENGINEERING",
    kind: "document_promotion",
    status: "pending",
    title: FIXTURE_NOTICE_ID,
    summary: `PDN ${FIXTURE_NOTICE_ID} — Example Discretes Ltd, 2 parts, attempt 1.`,
    requestedBy: "mock-caller",
    subjectRef: row.ingest_id,
    payload: {
      ...fixturePromotionPayload(promotionIngestId(row)),
      dropped_by: { authz_id: "mock-caller", on_behalf_of: null },
    },
    createdAt: Date.now(),
  };
  useHumanTaskStore.getState().upsertTask(task);
}

function ingestNotFound(): Promise<never> {
  const err = new Error("not found") as Error & { response?: unknown };
  err.response = { status: 404, data: { detail: { error: "ingest_not_found" } } };
  return Promise.reject(err);
}

/**
 * `GET /ingest/{id}/extraction`'s mock: the fixture notice's rows for any row this tab dropped,
 * whatever was dropped. An id it never saw is 404 `ingest_not_found`, as the route answers.
 */
export function fetchIngestExtraction(ingestId: string): Promise<unknown> {
  if (!STORE.has(ingestId)) return ingestNotFound();
  return Promise.resolve(fixtureExtractionBody(ingestId));
}

/**
 * `GET /ingest/{id}/source`'s mock: the PDF the fixture rows above were extracted from, not the
 * file that was dropped. An id it never saw is a 404.
 */
export function fetchIngestSource(ingestId: string): Promise<IngestSource> {
  if (!STORE.has(ingestId)) return ingestNotFound();
  return Promise.resolve({ bytes: fixturePdfBytes(), status: 200, contentType: "application/pdf" });
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

const LEAF_LOCKED_STAGES: ReadonlySet<string> = new Set(["promoted", "rejected", "failed", "review_rejected"]);

/**
 * PROPOSED — `POST /ingest/{id}/leaf`'s mock (10-21 packet §3b). Unknown id → 404; a terminal row →
 * the wrapped 409 `leaf_not_changeable` (`readActRefusal`'s shape); else sets the leaf with source "corrected" and `corrected_by` "mock-caller", clears
 * `leaf_candidates`, and at `awaiting_kind` / `review` / `awaiting_origin` sends the row back to `received` (Lane 1's 203; the
 * `attempt` counter is bumped when the row has one, and the next polls walk it to `review` and re-seed the review task);
 * at `received` / `extracting` the stage is unchanged. The same leaf as the row's own is a no-op: the row is returned
 * unchanged, no write (no source change).
 * Resolves with the status body.
 */
export function correctIngestLeaf(ingestId: string, leaf: IngestLeaf): Promise<unknown> {
  const row = STORE.get(ingestId);
  if (!row) {
    const err = new Error(`mock: unknown ingest id ${ingestId}`) as Error & {
      response?: { status: number; data: { detail: string } };
    };
    err.response = { status: 404, data: { detail: "ingest not found" } };
    return Promise.reject(err);
  }
  if (row.stage !== null && LEAF_LOCKED_STAGES.has(row.stage)) {
    const err = new Error(`mock: leaf locked at ${row.stage}`) as Error & {
      response?: { status: number; data: { detail: { error: string; stage: string; message: string } } };
    };
    err.response = {
      status: 409,
      data: {
        detail: { error: "leaf_not_changeable", stage: row.stage, message: `The kind can no longer be changed at ${row.stage}.` },
      },
    };
    return Promise.reject(err);
  }
  if (row.leaf === leaf) return Promise.resolve({ ...row });
  row.leaf = leaf;
  row.leaf_source = "corrected";
  row.corrected_by = "mock-caller";
  delete row.leaf_candidates;
  row.updated_at = Date.now();
  if (row.stage === INGEST_AWAITING_KIND_STATUS || row.stage === "review" || row.stage === "awaiting_origin") {
    row.stage = "received";
    if (row.attempt !== undefined) row.attempt += 1;
  }
  return Promise.resolve({ ...row });
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

/** Test/dev-only: marks an existing mock row `failed` with a `failure` object (the mock never fails one itself). */
export function __seedMockFailedFixture(ingestId: string, failure: IngestFailure): void {
  const row = STORE.get(ingestId);
  if (!row) throw new Error(`__seedMockFailedFixture: no mock row for ${ingestId}`);
  row.stage = "failed";
  row.failure = failure;
  row.attempt ??= 1;
}

/** Test/dev-only reset — the module is a singleton store across the session otherwise. */
export function __resetIngestMock(): void {
  STORE.clear();
  FILE_NAMES.clear();
  counter = 0;
  FIRST_ORIGINAL = null;
}
