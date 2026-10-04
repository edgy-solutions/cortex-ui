/**
 * ingestWire — the ONE adapter for the ADR-0041 ingest routes.
 *
 * SOURCES:
 *   - invincible-agent, producer `0f48fe2feb863e2d65b56efc6a4a0528a81f4fb3`, live on helm rev
 *     162 — `src/iagent/gateway.py`'s `POST /ingest` and `GET /ingest/{id}/status`, and
 *     `src/iagent/ingest_status.py` (`STAGES`, `DUPLICATE`, `ALL_STATUSES`, `KINDS`, the
 *     `ingest_status_route`'s renamed-on-the-wire row shape) are the REAL wire this file types.
 *     This replaces the 12d3ca6f wire (`STATUSES`'s seven-value received/classified/extracting/
 *     extracted/review/promoted/rejected ladder, bare `id`/`status`/`object_prefix` field names)
 *     — see git history on this file for that shape.
 *   - invincible-agent, same producer sha — `src/iagent/promotion.py` (the `sha256:<64 lowercase
 *     hex>` ingest_id spelling `promotionIngestId` below used to synthesize, and now reads
 *     verbatim off the row — see "THE BRIDGE IS GONE" below) and
 *     `policy/task_kinds/document_promotion.yaml` (`accepts: [promoted, rejected]`,
 *     `reason_required: [rejected]` — the fallback this file uses when no served declaration
 *     has reached the app yet).
 *   - iagent-mesh-sdk, branch lane/ca-0.9.7, commit 012a24fb — `iagent_mesh/ingest.py`'s
 *     `INGEST_STAGES` closed vocabulary (received/extracting/review/promoted/rejected/failed)
 *     mirrors `ingest_status.py.STAGES` at producer `4c3b61a6` (renamed in `1c10e28c`), same six
 *     values, same order. It was `awaiting_disposition` until `1c10e28c`.
 *   - the 2026-09-30 dispatch — renamed the component-level label field to `provenance_floor`
 *     (unrelated to the ingest row above; a component-level field read off rendered capability
 *     components, not off an ingest status row). Unchanged by this revision.
 *   - Lane 1's live capture, `sessions/2026-10-01-payload-ingest-drop-roll-11.json` (four
 *     exchanges against the deployed gateway) — THE SEAL INPUT for this revision. It broke two
 *     coincidence defects that every earlier fixture, hand-built to the sha256 shape, could not
 *     reach: `ingest_id` is a UUID on a duplicate row (exchanges [2]/[3]), not always
 *     `sha256:<64 hex>`; and `created_at`/`updated_at` are epoch-ms NUMBERS on the wire, not
 *     strings. See the two readers below for what changed and why.
 *
 * `provenance_floor`'s shape is RULED (2026-09-30) as `{obtained_via, ingest_ids[], unidentified}`,
 * built at invincible-agent lane/74-provenance-floor `ead2f80d` (`src/iagent/provenance_floor.py`,
 * not yet on master, and with no production caller). `unidentified` is a COUNT of unpromoted
 * user-drop sources whose block carries no ingest_id — they cannot be named, so they are counted,
 * and "a reader deciding 'is anything here unverified' must read `ingest_ids` AND `unidentified`".
 * `provenanceFloorIsUnverified` below is that reader. This adapter is still the one place to change.
 *
 * Every reader here returns `null` on malformed input rather than throwing, on the same
 * discipline as the rest of this repo's wire readers: a producer that sends something this UI
 * cannot parse is a refusal to render, never a crash.
 *
 * ── ONE ROW, ONE FETCH ──────────────────────────────────────────────────────────────────────
 * `GET /ingest/{id}/status` returns the full `ingest_status_projection` row — stage, duplicate
 * info, everything — in one shot. There is no second envelope layer, and no extraction-progress
 * counts on this wire at all (`extracted_count`/`extracted_total` are gone — see the field
 * deletion list on `IngestStatusRow` below): review is an ordinary `document_promotion` HumanTask
 * found by `promotionIngestId`, not carried on this row.
 *
 * ── WHY THIS DOES NOT ADAPT INTO StepLadder OR IntervalTimeline ────────────────────────────
 * (Unchanged from the first two builds — re-read again for this revision and still unsuited;
 * see `IngestStatusCard`'s header for the full reasoning.) `ingestStageLadder` stays a bespoke
 * list, now drawn from the REAL `STAGES` tuple rather than the old `STATUSES`.
 */
import { readIngestOrigin, type IngestOrigin } from "./ingestOrigin";

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
  /** Unpromoted user-drop sources with no ingest_id — counted because they cannot be named. */
  unidentified: number;
}

/** The banner text — used only when `provenanceFloorIsUnverified`; never inferred otherwise. */
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
 * `"unstamped"` (the producer's `null` — "drew on nothing" — is not a rung, so it draws nothing),
 * `unidentified` is a non-negative integer, AND `ingest_ids` is an array of strings (possibly empty — an empty array is a
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
  // REQUIRED, never defaulted: an absent count read as 0 is exactly how unidentified drops vanish.
  if (typeof pf.unidentified !== "number" || !Number.isInteger(pf.unidentified) || pf.unidentified < 0) {
    return null;
  }
  return {
    obtained_via: pf.obtained_via as ProvenanceFloorRung,
    ingest_ids: pf.ingest_ids,
    unidentified: pf.unidentified,
  };
}

/**
 * The ONE "is anything here unverified" decision, as the producer's docstring rules it: BOTH
 * fields. `ingest_ids == []` alone does not mean every drop was promoted.
 */
export function provenanceFloorIsUnverified(floor: ProvenanceFloor): boolean {
  return floor.ingest_ids.length > 0 || floor.unidentified > 0;
}

// ── The ingest row — ingest_status.py / GET /ingest/{id}/status ───────────────────────────

/** `ingest_status.py.KINDS` — closed, deterministic, declared-at-the-door, never LLM-classified
 *  (ADR-0021's precedence). There is no `GET /ingest/kinds` route; this is the whole menu. */
export const INGEST_KINDS = ["pdf", "cad"] as const;
export type IngestKind = (typeof INGEST_KINDS)[number];

/** `ingest_status.py.STAGES` — closed, ordered nearest-to-arrival first. Mirrors producer
 *  `4c3b61a6` (renamed in `1c10e28c`) and SDK `iagent_mesh.ingest.INGEST_STAGES` at `012a24fb`
 *  (lane/ca-0.9.7). It was `awaiting_disposition` until `1c10e28c`. */
export const INGEST_STAGES = [
  "received",
  "extracting",
  "review",
  "promoted",
  "rejected",
  "failed",
] as const;
export type IngestStage = (typeof INGEST_STAGES)[number];

/** `ingest_status.py.DUPLICATE` — OUT-OF-BAND, never in the ladder. A repeat arrival is
 *  recorded once and done; it never extracts, never awaits disposition. */
export const INGEST_DUPLICATE_STATUS = "duplicate" as const;

/** `ingest_status_route`'s row — `GET /ingest/{id}/status`'s whole response. `stage` is `null`
 *  ONLY on a duplicate whose original is not visible to this caller (existence-oracle safe — see
 *  `readIngestStatusRow`'s rule below and the route's own comment on `gateway.py`). */
export interface IngestStatusRow {
  ingest_id: string;
  sha256: string;
  kind: IngestKind;
  stage: IngestStage | null;
  detail: string | null;
  duplicate: { of_ingest_id: string; message: string } | null;
  /** Epoch milliseconds — a NUMBER on the live wire (roll-11 capture exchanges [1]/[3]), never a
   *  string. See `readIngestStatusRow` below. */
  created_at: number;
  updated_at: number;
  /**
   * CORTEX-PROPOSED (`src/lib/ingestOrigin.ts`) — the real route (invincible-agent origin/master
   * `41647787`) serves no `origin` field today. `null` means "the server reports no origin",
   * read via `readIngestOrigin`, which is a THIRD state, distinct from `{status:"unresolved"}` —
   * never conflate a server that has not been asked with a resolver that tried and missed.
   */
  origin: IngestOrigin | null;
}

const DETAIL_REQUIRED_STAGES: ReadonlySet<IngestStage> = new Set(["rejected", "failed"]);

/**
 * `GET /ingest/{id}/status` → the row, or `null` on anything malformed — including an
 * unrecognised `stage` value, which this client has no ladder position for.
 */
export function readIngestStatusRow(raw: unknown): IngestStatusRow | null {
  if (!isRecord(raw)) return null;
  // `ingest_id` has TWO forms on the live wire, not one: a new arrival's is `sha256:<64 hex>`,
  // but a duplicate's is a UUID — its own row id, never the original's hash
  // (sessions/2026-10-01-payload-ingest-drop-roll-11.json exchanges [2]/[3]). The old
  // `/^sha256:[0-9a-f]{64}$/` test refused EVERY duplicate; nothing caught it because every
  // fixture this reader was built against used the sha form. `ingest_id` is opaque to this
  // client — used only as an encoded path segment and an equality key — so this is deliberately
  // not replaced with a uuid regex either.
  if (!isNonEmptyString(raw.ingest_id)) return null;
  if (!isNonEmptyString(raw.sha256)) return null;
  if (typeof raw.kind !== "string" || !(INGEST_KINDS as readonly string[]).includes(raw.kind)) {
    return null;
  }

  let stage: IngestStage | null;
  if (raw.stage === null) {
    stage = null;
  } else if (typeof raw.stage === "string" && (INGEST_STAGES as readonly string[]).includes(raw.stage)) {
    stage = raw.stage as IngestStage;
  } else {
    // An unknown stage string — including a non-string, non-null value — has no ladder position.
    return null;
  }

  // If stage is null, this row is a duplicate whose original this caller cannot see — duplicate
  // must be non-null, or a null stage is unaccounted for.
  if (stage === null && !isRecord(raw.duplicate)) return null;

  if (stage !== null && DETAIL_REQUIRED_STAGES.has(stage) && !isNonEmptyString(raw.detail)) {
    return null;
  }

  let duplicate: IngestStatusRow["duplicate"] = null;
  if (raw.duplicate !== null) {
    if (!isRecord(raw.duplicate)) return null;
    if (!isNonEmptyString(raw.duplicate.of_ingest_id) || !isNonEmptyString(raw.duplicate.message)) {
      return null;
    }
    duplicate = { of_ingest_id: raw.duplicate.of_ingest_id, message: raw.duplicate.message };
  }

  // The old rule (`isNonEmptyString`) refused EVERY live status row — the wire sends epoch-ms
  // NUMBERS (roll-11 capture exchanges [1]/[3]), never a string. A string is now itself refused:
  // accepting both would hide the drift rather than name it.
  if (typeof raw.created_at !== "number" || !Number.isFinite(raw.created_at)) return null;
  if (typeof raw.updated_at !== "number" || !Number.isFinite(raw.updated_at)) return null;

  return {
    ingest_id: raw.ingest_id,
    sha256: raw.sha256,
    kind: raw.kind as IngestKind,
    stage,
    detail: typeof raw.detail === "string" ? raw.detail : null,
    duplicate,
    created_at: raw.created_at,
    updated_at: raw.updated_at,
    // Absent on today's real wire — `readIngestOrigin` returns null for exactly that, never a
    // fabricated unresolved/resolved state. See `IngestStatusRow.origin`'s own doc comment.
    origin: readIngestOrigin(raw.origin),
  };
}

/** `POST /ingest`'s two response shapes (`{ingest_id, stage, detail, object_prefix,
 *  duplicate: null}` new, or `{ingest_id, stage, detail, duplicate: {of_ingest_id, message}}`
 *  duplicate) share `ingest_id` — everything else this client needs comes from the immediate
 *  follow-up `GET /ingest/{id}/status` fetch, so this is deliberately the only field read here. */
export function readIngestUploadId(raw: unknown): string | null {
  if (!isRecord(raw)) return null;
  // Same opaque-string rule as `readIngestStatusRow` above, for the same reason: a duplicate
  // arrival's `ingest_id` is a UUID, not a sha256 digest (roll-11 capture exchange [2]).
  return isNonEmptyString(raw.ingest_id) ? raw.ingest_id : null;
}

/**
 * Pure path builder for `GET /ingest/{id}/status`, shared with `src/api/client.ts`'s
 * `fetchIngestStatus` so the encoding is asserted in one place and is importable from a test
 * without pulling in the axios instance. `encodeURIComponent` turns a sha-form id's `:` into
 * `%3A`. The capture (sessions/2026-10-01-payload-ingest-drop-roll-11.json exchange [1]) shows
 * the colon UNencoded, as devtools displays it; that the gateway also answers 200 for `%3A` is
 * Lane 1's measurement in its roll-11 packet to cortex, not something the capture shows.
 */
export function ingestStatusPath(id: string): string {
  return `/ingest/${encodeURIComponent(id)}/status`;
}

// ── Errors — 400/403/413/422 on upload, 409/503 on act, 404 on status ──────────────────────

/**
 * The server's own message, off an axios error. Three shapes:
 *   - a plain string `detail` (upload route's `HTTPException(status_code=400/403/413,
 *     detail="...")`);
 *   - a `{message: "..."}` object nested under `detail` (the act route's `PromotionRefused` →
 *     `HTTPException(detail={"error", "task_id", "message"})`);
 *   - a FastAPI 422 validation array, `detail: [{loc, msg, type}, ...]` — each item's `msg`,
 *     prefixed with the last `loc` element when present, joined with "; " (e.g.
 *     "kind: field required").
 * `null` when none of these is present, so a caller can fall back to a generic message rather
 * than render `undefined`.
 */
export function readIngestErrorMessage(err: unknown): string | null {
  if (!isRecord(err)) return null;
  const response = err.response;
  if (!isRecord(response)) return null;
  const data = response.data;
  if (!isRecord(data)) return null;
  const detail = data.detail;
  if (typeof detail === "string") return detail;
  if (isRecord(detail) && typeof detail.message === "string") return detail.message;
  if (Array.isArray(detail) && detail.length > 0) {
    const parts = detail
      .filter((item): item is Record<string, unknown> => isRecord(item) && typeof item.msg === "string")
      .map((item) => {
        const loc = item.loc;
        const last = Array.isArray(loc) && loc.length > 0 ? loc[loc.length - 1] : null;
        return typeof last === "string" || typeof last === "number"
          ? `${last}: ${item.msg as string}`
          : (item.msg as string);
      });
    return parts.length > 0 ? parts.join("; ") : null;
  }
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

/**
 * The act route's refusal — `POST /human_tasks/{task_id}/act` on a `document_promotion` task
 * raises `HTTPException(status, detail={"error", "task_id", "message"})` (`promotion.py`'s
 * `PromotionRefused`, e.g. `ingest_node_absent` → 409, `promotion_store_unavailable` → 503, both
 * messages ending "Nothing was written"). `null` unless both `error` and `message` are strings —
 * this is a STRICTER read than `readIngestErrorMessage` (which accepts a bare `{message}`
 * without an `error`), because a caller drawing `data-ingest-act-refusal="<error>"` needs the
 * error code, not just the message.
 */
export function readActRefusal(err: unknown): { status: number; error: string; message: string } | null {
  if (!isRecord(err)) return null;
  const response = err.response;
  if (!isRecord(response) || typeof response.status !== "number") return null;
  const data = response.data;
  if (!isRecord(data)) return null;
  const detail = data.detail;
  if (!isRecord(detail)) return null;
  if (typeof detail.error !== "string" || typeof detail.message !== "string") return null;
  return { status: response.status, error: detail.error, message: detail.message };
}

// ── The promotion id ─────────────────────────────────────────────────────────────────────────

/**
 * THE BRIDGE IS GONE. The 12d3ca6f wire's row carried bare-hex `sha256` while
 * `promotion.py`'s `INGEST_ID_RE` required the task payload's `ingest_id` to be spelled
 * `sha256:<64 hex>` — this function used to be the one place that spelled the prefix onto a bare
 * value. The 0f48fe2f wire's row already carries `ingest_id` in that exact spelling (the route's
 * own "ONE NAME PER FIELD" renaming), so there is no bridging left to do: this is now an
 * identity, kept as a named function so every caller still reads the row's ingest_id through the
 * one place that would change if that ever stopped being true.
 */
export function promotionIngestId(row: Pick<IngestStatusRow, "ingest_id">): string {
  return row.ingest_id;
}

/** Whether a HumanTask's `payload.ingest_id` names this row, via the bridge above. Malformed or
 *  missing `payload` never matches (never throws). */
export function payloadMatchesIngestId(payload: unknown, wanted: string): boolean {
  return isRecord(payload) && payload.ingest_id === wanted;
}

// ── Stage ladder ─────────────────────────────────────────────────────────────────────────

const MAIN_STAGES: readonly IngestStage[] = ["received", "extracting", "review", "promoted"];

export interface StageRung {
  stage: IngestStage;
  state: "done" | "current" | "pending";
}

/**
 * The closed `STAGES` vocabulary laid out as a ladder for one row's current `stage`. Callers
 * must not pass `null` here — a duplicate (or a duplicate whose original is invisible) draws no
 * ladder at all (see `IngestStatusCard`).
 *
 * `rejected` is drawn as a TERMINAL BRANCH off `review`: the main-track stages up
 * to and including `review` are marked `done` (they did happen before the branch),
 * `promoted` stays `pending` (a rejected ingest did not get promoted), and `rejected` itself is
 * the current rung.
 *
 * `failed` is a DIFFERENT kind of terminal branch: the row carries no "failed at" field, so this
 * client cannot say HOW FAR the ingest got before failing — only `received` is known to have
 * happened. Marking `extracting`/`review` done would be a claim this row does not
 * support, so they stay `pending` and `failed` is the current rung on its own.
 */
export function ingestStageLadder(stage: IngestStage): StageRung[] {
  if (stage === "failed") {
    const rungs: StageRung[] = MAIN_STAGES.map((s) => ({
      stage: s,
      state: s === "received" ? "done" : "pending",
    }));
    rungs.push({ stage: "failed", state: "current" });
    return rungs;
  }

  const isTerminalBranch = stage === "rejected";
  const branchPoint = MAIN_STAGES.indexOf("review");
  const currentIndex = isTerminalBranch ? branchPoint : MAIN_STAGES.indexOf(stage);

  const rungs: StageRung[] = MAIN_STAGES.map((s, i) => {
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

  if (isTerminalBranch) rungs.push({ stage, state: "current" });
  return rungs;
}

// ── Polling ──────────────────────────────────────────────────────────────────────────────

/** Whether a card polling this row should stop: a duplicate (any row whose `duplicate` is
 *  non-null, including one whose original is invisible — `stage === null`), or a row that has
 *  reached `promoted`, `rejected` or `failed`. `review` keeps polling — a viewer
 *  may still be about to act. */
export function ingestPollingDone(row: Pick<IngestStatusRow, "stage" | "duplicate">): boolean {
  if (row.duplicate !== null) return true;
  return row.stage === "promoted" || row.stage === "rejected" || row.stage === "failed";
}
