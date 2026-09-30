/**
 * ingestWire — the ONE adapter for the ADR-0041 ingest routes.
 *
 * SOURCES:
 *   - invincible-agent, origin/master, commit 12d3ca6f — `src/iagent/gateway.py`'s
 *     `POST /ingest` and `GET /ingest/{id}/status`, and `src/iagent/ingest_status.py`
 *     (STATUSES, DUPLICATE, KINDS, `get_status_for`'s row shape) are the REAL wire this file
 *     types. This replaces the proposed packet/SDK wire the first two builds of this file were
 *     written against in full — no `ContentKindRegistration`, no classifier suggestion, no
 *     `steps`/`review`/`produced` envelope nesting; see git history on this file for that shape.
 *   - invincible-agent, commit f5e15a3b (on origin/lane/74-promotion, merged to local master at
 *     9fdbcc18, not yet pushed to origin/master) — `src/iagent/promotion.py` (the
 *     `sha256:<64 lowercase hex>` ingest_id spelling `promotionIngestId` below mirrors) and
 *     `policy/task_kinds/document_promotion.yaml` (`accepts: [promoted, rejected]`,
 *     `reason_required: [rejected]` — the fallback this file uses when no served declaration
 *     has reached the app yet).
 *   - iagent-mesh-sdk, branch lane/ca, commit b68926a — `iagent_mesh/ingest.py`'s
 *     `INGEST_STAGES` closed vocabulary (received/extracting/awaiting_disposition/promoted/
 *     rejected/failed) is NOT what the gateway actually serves: the real
 *     `ingest_status.py.STATUSES` is a DIFFERENT seven-value ladder (received/classified/
 *     extracting/extracted/review/promoted/rejected, no "failed", "duplicate" out-of-band
 *     rather than terminal-in-ladder). Reported to Lane 1 as a divergence between the SDK and
 *     what shipped; this adapter follows the gateway, the wire this UI actually talks to.
 *   - the 2026-09-30 dispatch — renamed the component-level label field to `provenance_floor`
 *     (unrelated to the ingest row above; a component-level field read off rendered capability
 *     components, not off an ingest status row). Unchanged by this revision.
 *
 * `provenance_floor`'s shape is provisional: invincible-agent lane/74, commit 0c957741's
 * `envelope_label()` emits `weakest_obtained_via`/`contributing_ingest_ids`, not
 * `obtained_via`/`ingest_ids`, and has NO PRODUCERS YET. This adapter (`readProvenanceFloor`
 * below) is the one place to change when the names on the two sides settle.
 *
 * Every reader here returns `null` on malformed input rather than throwing, on the same
 * discipline as the rest of this repo's wire readers: a producer that sends something this UI
 * cannot parse is a refusal to render, never a crash.
 *
 * ── ONE ROW, ONE FETCH ──────────────────────────────────────────────────────────────────────
 * `GET /ingest/{id}/status` returns the full `ingest_status_projection` row — status, counts,
 * duplicate info, everything — in one shot. There is no second envelope layer (packet §B's
 * `request`/`provenance` nesting is gone), and no `steps`/`review`/`produced` on the wire at
 * all: extraction progress is `extracted_count`/`extracted_total`, and review is an ordinary
 * `document_promotion` HumanTask found by `promotionIngestId`, not carried on this row.
 *
 * ── WHY THIS DOES NOT ADAPT INTO StepLadder OR IntervalTimeline ────────────────────────────
 * (Unchanged from the first two builds — re-read again for this revision and still unsuited;
 * see `IngestStatusCard`'s header for the full reasoning.) `ingestStageLadder` stays a bespoke
 * list, now drawn from the REAL `STATUSES` tuple rather than the SDK's.
 */

// ── Provenance floor (component-level label) — unchanged by this revision ─────────────────

/** `iagent_mesh.provenance.OBTAINED_VIA` — closed, ordered nearest-to-truth first. */
export const OBTAINED_VIA = ["direct", "etl", "warehouse", "manual-export", "user-drop"] as const;
export type ObtainedVia = (typeof OBTAINED_VIA)[number];

/**
 * `provenance_floor.obtained_via`'s legal set: the five SDK rungs PLUS `"unstamped"` — a
 * component can carry material with no provenance stamp at all, which is not one of the SDK's
 * five rungs. `"unstamped"` is scoped to this field only.
 */
export const PROVENANCE_FLOOR_RUNGS = [...OBTAINED_VIA, "unstamped"] as const;
export type ProvenanceFloorRung = (typeof PROVENANCE_FLOOR_RUNGS)[number];

export interface ProvenanceFloor {
  obtained_via: ProvenanceFloorRung;
  ingest_ids: string[];
}

/** The banner text — used only when `ingest_ids` is non-empty; never inferred otherwise. */
export const PROVENANCE_FLOOR_WARNING_LABEL = "Includes unverified user-contributed material";

// ── Helpers ──────────────────────────────────────────────────────────────────────────────

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function isNonEmptyString(v: unknown): v is string {
  return typeof v === "string" && v.trim().length > 0;
}

function isStringArray(v: unknown): v is string[] {
  return Array.isArray(v) && v.every((x) => typeof x === "string");
}

/**
 * The §7 label, read off a COMPONENT (never the ingest row) — `provenance_floor`. `{obtained_via,
 * ingest_ids}`: no `label` field — the warning text is fixed (`PROVENANCE_FLOOR_WARNING_LABEL`),
 * never carried on the wire, never inferred from anything else.
 *
 * `null` unless `provenance_floor` is present, `obtained_via` is one of the five SDK rungs or
 * `"unstamped"`, AND `ingest_ids` is an array of strings (possibly empty — an empty array is a
 * valid, non-null floor with nothing to warn about; see `ProvenanceFloorLabel`, which is the
 * caller that decides whether emptiness draws a banner or a quiet chip).
 */
export function readProvenanceFloor(component: unknown): ProvenanceFloor | null {
  if (!isRecord(component)) return null;
  const pf = component.provenance_floor;
  if (!isRecord(pf)) return null;
  if (
    typeof pf.obtained_via !== "string" ||
    !(PROVENANCE_FLOOR_RUNGS as readonly string[]).includes(pf.obtained_via)
  ) {
    return null;
  }
  if (!isStringArray(pf.ingest_ids)) return null;
  return { obtained_via: pf.obtained_via as ProvenanceFloorRung, ingest_ids: pf.ingest_ids };
}

// ── The ingest row — ingest_status.py / GET /ingest/{id}/status ───────────────────────────

/** `ingest_status.py.KINDS` — closed, deterministic, declared-at-the-door, never LLM-classified
 *  (ADR-0021's precedence). There is no `GET /ingest/kinds` route; this is the whole menu. */
export const INGEST_KINDS = ["pdf", "cad"] as const;
export type IngestKind = (typeof INGEST_KINDS)[number];

/** `ingest_status.py.STATUSES` — closed, ordered nearest-to-arrival first. NOTE this is NOT
 *  `iagent_mesh.ingest.INGEST_STAGES` (no "failed" here; see this file's header). */
export const INGEST_STATUSES = [
  "received",
  "classified",
  "extracting",
  "extracted",
  "review",
  "promoted",
  "rejected",
] as const;
export type IngestStatusValue = (typeof INGEST_STATUSES)[number];

/** `ingest_status.py.DUPLICATE` — OUT-OF-BAND, never in the ladder. A repeat arrival is
 *  recorded once and done; it never extracts, never reviews. */
export const INGEST_DUPLICATE_STATUS = "duplicate" as const;
export type IngestRowStatus = IngestStatusValue | typeof INGEST_DUPLICATE_STATUS;

const INGEST_ROW_STATUSES: readonly string[] = [...INGEST_STATUSES, INGEST_DUPLICATE_STATUS];

/** `ingest_status.get_status_for`'s row — `GET /ingest/{id}/status`'s whole response. */
export interface IngestStatusRow {
  id: string;
  sha256: string;
  kind: IngestKind;
  object_prefix: string;
  submitted_by: string;
  on_behalf_of: string;
  source: string | null;
  status: IngestRowStatus;
  extracted_count: number | null;
  extracted_total: number | null;
  duplicate_of: string | null;
  detail: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * `GET /ingest/{id}/status` → the row, or `null` on anything malformed — including an
 * unrecognised `status` value, which this client has no ladder position for.
 */
export function readIngestStatusRow(raw: unknown): IngestStatusRow | null {
  if (!isRecord(raw)) return null;
  if (!isNonEmptyString(raw.id)) return null;
  if (!isNonEmptyString(raw.sha256)) return null;
  if (typeof raw.kind !== "string" || !(INGEST_KINDS as readonly string[]).includes(raw.kind)) {
    return null;
  }
  if (!isNonEmptyString(raw.object_prefix)) return null;
  if (!isNonEmptyString(raw.submitted_by)) return null;
  if (!isNonEmptyString(raw.on_behalf_of)) return null;
  if (typeof raw.status !== "string" || !INGEST_ROW_STATUSES.includes(raw.status)) return null;
  if (!isNonEmptyString(raw.created_at)) return null;
  if (!isNonEmptyString(raw.updated_at)) return null;

  return {
    id: raw.id,
    sha256: raw.sha256,
    kind: raw.kind as IngestKind,
    object_prefix: raw.object_prefix,
    submitted_by: raw.submitted_by,
    on_behalf_of: raw.on_behalf_of,
    source: typeof raw.source === "string" ? raw.source : null,
    status: raw.status as IngestRowStatus,
    extracted_count: typeof raw.extracted_count === "number" ? raw.extracted_count : null,
    extracted_total: typeof raw.extracted_total === "number" ? raw.extracted_total : null,
    duplicate_of: typeof raw.duplicate_of === "string" ? raw.duplicate_of : null,
    detail: typeof raw.detail === "string" ? raw.detail : null,
    created_at: raw.created_at,
    updated_at: raw.updated_at,
  };
}

/** `POST /ingest`'s two response shapes (`{id, status, object_prefix}` new, or
 *  `{id, status:"duplicate", detail, duplicate_of}`) share only `id` — everything else this
 *  client needs comes from the immediate follow-up `GET /ingest/{id}/status` fetch, so this is
 *  deliberately the only field read here. */
export function readIngestUploadId(raw: unknown): string | null {
  if (!isRecord(raw)) return null;
  return isNonEmptyString(raw.id) ? raw.id : null;
}

// ── Errors — 400/403/413 on upload, 503 (etc.) on act, 404 on status ──────────────────────

/**
 * The server's own message, off an axios error — either a plain string `detail` (upload route's
 * `HTTPException(status_code=400/403/413, detail="...")`) or a `{message: "..."}` object nested
 * under `detail` (the act route's `PromotionRefused` → `HTTPException(detail={"error", "task_id",
 * "message"})`). `null` when neither shape is present, so a caller can fall back to a generic
 * message rather than render `undefined`.
 */
export function readIngestErrorMessage(err: unknown): string | null {
  if (!isRecord(err)) return null;
  const response = err.response;
  if (!isRecord(response)) return null;
  const data = response.data;
  if (!isRecord(data)) return null;
  if (typeof data.detail === "string") return data.detail;
  if (isRecord(data.detail) && typeof data.detail.message === "string") return data.detail.message;
  return null;
}

/**
 * `GET /ingest/{id}/status` answers a caller who is neither the submitter nor the `on_behalf_of`
 * principal with a plain 404 — ON PURPOSE indistinguishable from "no such ingest"
 * (`get_status_for`'s own doc comment). This only detects the status code, so the caller shows
 * exactly that ambiguity rather than inventing a reason.
 */
export function isIngestNotFoundError(err: unknown): boolean {
  return isRecord(err) && isRecord(err.response) && err.response.status === 404;
}

// ── The promotion id bridge ─────────────────────────────────────────────────────────────────

/**
 * THE ID BRIDGE. `ingest_status_projection.sha256` is bare hex; `promotion.py`'s
 * `INGEST_ID_RE` requires the task payload's `ingest_id` to be spelled `sha256:<64 hex>`
 * (`promotion.py` lines 52-56). The two are never compared directly — a bare-vs-prefixed
 * comparison always fails to match, silently, which is worse than a thrown error because it
 * reads as "no review task for you" rather than "the bridge is missing". This is the ONE place
 * that spells the prefix.
 */
export function promotionIngestId(row: Pick<IngestStatusRow, "sha256">): string {
  return `sha256:${row.sha256}`;
}

/** Whether a HumanTask's `payload.ingest_id` names this row, via the bridge above. Malformed or
 *  missing `payload` never matches (never throws). */
export function payloadMatchesIngestId(payload: unknown, wanted: string): boolean {
  return isRecord(payload) && payload.ingest_id === wanted;
}

// ── Stage ladder ─────────────────────────────────────────────────────────────────────────

const MAIN_STATUSES: readonly IngestStatusValue[] = [
  "received",
  "classified",
  "extracting",
  "extracted",
  "review",
  "promoted",
];

export interface StageRung {
  stage: IngestStatusValue;
  state: "done" | "current" | "pending";
}

/**
 * The closed `STATUSES` vocabulary laid out as a ladder for one row's current `status`. Callers
 * must not pass `"duplicate"` here — a duplicate is out-of-band and draws no ladder at all (see
 * `IngestStatusCard`).
 *
 * `rejected` is drawn as a TERMINAL BRANCH off `review`, never as progress past `promoted` — a
 * rejected ingest did not get promoted, so `promoted` stays `pending` rather than being marked
 * `done`/`current` just because the row reached a later-numbered status in the tuple. The
 * main-track statuses up to and including `review` ARE marked `done`, because they did happen
 * before the branch.
 */
export function ingestStageLadder(status: IngestStatusValue): StageRung[] {
  const isTerminalBranch = status === "rejected";
  const branchPoint = MAIN_STATUSES.indexOf("review");
  const currentIndex = isTerminalBranch ? branchPoint : MAIN_STATUSES.indexOf(status);

  const rungs: StageRung[] = MAIN_STATUSES.map((s, i) => {
    let state: StageRung["state"];
    if (isTerminalBranch) {
      state = i <= currentIndex ? "done" : "pending";
    } else if (i < currentIndex) {
      state = "done";
    } else if (i === currentIndex) {
      state = "current";
    } else {
      state = "pending";
    }
    return { stage: s, state };
  });

  if (isTerminalBranch) rungs.push({ stage: status, state: "current" });
  return rungs;
}

// ── Polling ──────────────────────────────────────────────────────────────────────────────

/** Whether a card polling this row should stop: `promoted`, `rejected` or `duplicate`. Every
 *  other status (including `review` — a viewer may still be about to act) keeps polling. */
export function ingestPollingDone(row: Pick<IngestStatusRow, "status">): boolean {
  return row.status === "promoted" || row.status === "rejected" || row.status === "duplicate";
}
