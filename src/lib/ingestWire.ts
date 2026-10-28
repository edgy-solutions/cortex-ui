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
import { LEAF as V1_LEAF, LEAF_SOURCE as V1_LEAF_SOURCE } from "../api/generated/ingestV1";
import { readFractionEvidenceRef, type FractionEvidenceRef } from "./evidenceRef";

// ── Provenance floor (component-level label) — unchanged by this revision ─────────────────

/** `iagent_mesh.provenance.OBTAINED_VIA` — closed, ordered nearest-to-truth first. */
export const OBTAINED_VIA = ["direct", "etl", "warehouse", "manual-export", "user-drop", "steward-corrected"] as const;
export type ObtainedVia = (typeof OBTAINED_VIA)[number];

/**
 * `provenance_floor.obtained_via`'s legal set: the six SDK rungs PLUS `"unstamped"` — a
 * component can carry material with no provenance stamp at all, which is not one of the SDK's
 * six rungs. `"unstamped"` is scoped to this field only.
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
 * `null` unless `provenance_floor` is present, `obtained_via` is one of the six SDK rungs or
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
export const INGEST_KINDS = ["pdf", "cad", "xml", "event"] as const;
export type IngestKind = (typeof INGEST_KINDS)[number];

/** `ingest_status.py.FILE_KINDS`: the kinds a person can DROP A FILE as (`POST /ingest`,
 *  multipart). `event` is in `INGEST_KINDS` so its status rows parse, but it is never uploaded:
 *  `POST /ingest/events` carries no bytes and is not a UI door. The picker draws this list, never
 *  `INGEST_KINDS`. `xml` (producer `086a9cf0`) is the third file kind; S1000D data modules arrive
 *  as `kind=xml` with `content_kind=s1000d-data-module`. */
export const INGEST_UPLOAD_KINDS = ["pdf", "cad", "xml"] as const satisfies readonly IngestKind[];
export type IngestUploadKind = (typeof INGEST_UPLOAD_KINDS)[number];

/** Upload kinds the picker draws but does not accept yet, each with its own reason (shown as the
 *  option's `title`):
 *  - `cad`: no content_kind registry row (row "7f"); from pin 188 the door refuses it with 400
 *    `kind_unregistered`. Delete "cad" when 7f's registry row is live in BOTH doc-tools
 *    KIND_MAPPING and the overlay (Lane 1 says when).
 *  `xml` was greyed here (registered, but no sensor took an xml drop, so it failed `timeout`). The
 *  architect lifted it 2026-10-17: 7f's processable-kinds pin (`5846f877`) and the instance-write pin
 *  (`2bf85719`) are both rolled, and the door has been ON since 190. pdf and xml are enabled. */
export const INGEST_KIND_NOT_YET_ACCEPTED_REASON = {
  cad: "no registered content kind, so the door would refuse it (kind_unregistered).",
} as const satisfies Partial<Record<IngestUploadKind, string>>;
export const INGEST_KINDS_NOT_YET_ACCEPTED = Object.keys(
  INGEST_KIND_NOT_YET_ACCEPTED_REASON,
) as (keyof typeof INGEST_KIND_NOT_YET_ACCEPTED_REASON)[];
export function ingestKindNotYetAccepted(k: string): boolean {
  return (INGEST_KINDS_NOT_YET_ACCEPTED as readonly string[]).includes(k);
}
export function ingestKindNotYetAcceptedReason(k: string): string | null {
  return ingestKindNotYetAccepted(k)
    ? INGEST_KIND_NOT_YET_ACCEPTED_REASON[k as keyof typeof INGEST_KIND_NOT_YET_ACCEPTED_REASON]
    : null;
}

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

/** `ingest_status.py.CASE_OPENED` (invincible-agent `a0c2ba18`, pinned at `3e6d9e9f`) — OUT-OF-BAND
 *  like `duplicate`: in the producer's `ALL_STATUSES`, NOT in `STAGES`, so it is never in
 *  `INGEST_STAGES` and never a rung of the document ladder. It is the EVENT branch's own next
 *  step after `received` (`POST /ingest/events` opens a case directly; it never extracts, reviews
 *  or promotes). Only an `event` row can be at it. */
export const INGEST_CASE_OPENED_STATUS = "case_opened" as const;

/** `ingest_status.py.AWAITING_ORIGIN` — OUT-OF-BAND like `case_opened`: in the producer's
 *  `ALL_STATUSES`, NOT in `STAGES`. A deliberately domainless drop (every cortex `.pdf` drop)
 *  parks here after extraction until a steward accepts its origin; it then moves to `review`.
 *  Document rows only. */
export const INGEST_AWAITING_ORIGIN_STATUS = "awaiting_origin" as const;

/** `ingest_status.py.REVIEW_REJECTED` — OUT-OF-BAND, terminal: a steward's narrow reject of a
 *  review. In `ALL_STATUSES`, NOT in `STAGES`. `detail` is REQUIRED, like `rejected`/`failed`.
 *  Document rows only. */
export const INGEST_REVIEW_REJECTED_STATUS = "review_rejected" as const;

/** PROPOSED in the 10-21 packet (`sessions/2026-10-21-packet-to-architect-and-lane-01-no-leaf-is-settable-today-a-pdf-drop-parks-at-awaiting-origin-the-chip-needs-three-wire-items.md`),
 *  NOT emitted by the producer yet: a drop whose leaf (pcn/pdn) could not be read parks here
 *  until the dropper picks one. Out-of-band like the two above. Document rows only. */
export const INGEST_AWAITING_KIND_STATUS = "awaiting_kind" as const;

/** `ingest_status.py.NO_PARTS` — OUT-OF-BAND, TERMINAL and NOT A FAILURE (spec 208): a steward
 *  confirmed through the `document_empty_confirm` card that the document really has no parts.
 *  The row's `detail` reads `no parts (confirmed by <actor>)`. In `ALL_STATUSES`, NOT in
 *  `STAGES`; nothing moves it on, so polling stops. Document rows only. */
export const INGEST_NO_PARTS_STATUS = "no_parts" as const;

/** What a row's `stage` field can carry: the ladder's stages, plus the out-of-band statuses
 *  that arrive in that same field. (`duplicate` does not — a duplicate row carries `stage` of
 *  its ORIGINAL, or null, and the fact itself is in `duplicate`.) */
export type IngestRowStage =
  | IngestStage
  | typeof INGEST_CASE_OPENED_STATUS
  | typeof INGEST_AWAITING_ORIGIN_STATUS
  | typeof INGEST_REVIEW_REJECTED_STATUS
  | typeof INGEST_AWAITING_KIND_STATUS
  | typeof INGEST_NO_PARTS_STATUS;

/** A `stage` token this client has no position for. ingest-v1 §7: the stage is a STRING by design and
 *  "unknown means not finished". The reader KEEPS the row and its raw token (never refuses it: a refused row
 *  plus the poller's keep-last froze every .pdf drop at "extracting" for two weeks, over `awaiting_origin`).
 *  Plain `string` is the honest type: it is every token the closed lists above do not name. */
export type IngestUnknownStage = string;

/** The out-of-band DOCUMENT statuses (everything in `IngestRowStage` that is neither a ladder
 *  stage nor the event-only `case_opened`). */
export const INGEST_OOB_DOCUMENT_STATUSES = [
  INGEST_AWAITING_ORIGIN_STATUS,
  INGEST_REVIEW_REJECTED_STATUS,
  INGEST_AWAITING_KIND_STATUS,
  INGEST_NO_PARTS_STATUS,
] as const;
export type IngestOobDocumentStatus = (typeof INGEST_OOB_DOCUMENT_STATUSES)[number];

/** The leaf content kinds the chip can name: DERIVED from the ingest-v1 snapshot's `StatusBody.leaf` enum
 *  (generated `LEAF`; the generator throws if the four copies of it ever split). Not hand-kept. */
export const INGEST_LEAVES = V1_LEAF;
export type IngestLeaf = (typeof INGEST_LEAVES)[number];
/** Where a leaf came from (architect ruling 10-21, one enum on the status row, the review route and
 *  the decision record): the drop carried it, the document's title was read, or a person changed it.
 *  WRITTEN with the leaf and stored on the row, never computed from the stored kind. */
export const INGEST_LEAF_SOURCES = V1_LEAF_SOURCE;
export type IngestLeafSource = (typeof INGEST_LEAF_SOURCES)[number];

/** A leaf's source is known iff it is in `INGEST_LEAF_SOURCES`; the retired names (`ingest`,
 *  `extraction-title`) are unknown. Shared by the status-row and review readers so they cannot drift. */
export function readLeafSource(v: unknown): IngestLeafSource | null {
  return typeof v === "string" && (INGEST_LEAF_SOURCES as readonly string[]).includes(v) ? (v as IngestLeafSource) : null;
}

/** `corrected_by` is kept only for source "corrected" and only as a non-blank string; else null. */
export function readCorrectedBy(source: IngestLeafSource | null, v: unknown): string | null {
  return source === "corrected" && typeof v === "string" && v.trim() !== "" ? v : null;
}

/** The title crop a candidate's read used (the evidence_ref ruling, 10-21: `{page, bbox, note?}`, bbox in page fractions). */
export type IngestLeafEvidenceRef = FractionEvidenceRef;
/** One candidate when the read was not confident. */
export interface IngestLeafCandidate {
  leaf: IngestLeaf;
  score: number;
  evidence_ref: IngestLeafEvidenceRef;
}

/**
 * `leaf_candidates`: the name is CONFIRMED by Lane 1 (203, `c095be48`). 1..3 items `[{leaf, score, evidence_ref}]`,
 * score in [0, 1], best first. Absent key, `null` (a leaf-capable row not at awaiting_kind) and `[]` (Lane 1's
 * "the read offered no candidate", e.g. a title element with no box) are all undefined: no claim, so the plain
 * PCN/PDN picker shows. ANY invalid item (including a bbox that is not page fractions, architect 10-21), or a length
 * over 3, makes the WHOLE field undefined: deliberately no partial lists, because order is the claim. The server's
 * order is kept; nothing is sorted.
 */
export function readLeafCandidates(raw: Record<string, unknown>): IngestLeafCandidate[] | undefined {
  if (!("leaf_candidates" in raw)) return undefined;
  const v = raw.leaf_candidates;
  if (!Array.isArray(v) || v.length < 1 || v.length > 3) return undefined;
  const out: IngestLeafCandidate[] = [];
  for (const item of v) {
    if (typeof item !== "object" || item === null || Array.isArray(item)) return undefined;
    const c = item as Record<string, unknown>;
    if (typeof c.leaf !== "string" || !(INGEST_LEAVES as readonly string[]).includes(c.leaf)) return undefined;
    if (typeof c.score !== "number" || !Number.isFinite(c.score) || c.score < 0 || c.score > 1) return undefined;
    const evidence_ref = readFractionEvidenceRef(c.evidence_ref);
    if (!evidence_ref) return undefined;
    out.push({ leaf: c.leaf as IngestLeaf, score: c.score, evidence_ref });
  }
  return out;
}

/** The EVENT branch's whole ladder, exactly as `gateway.py`'s `POST /ingest/events` walks it at
 *  `3e6d9e9f`: `record_received` (status `received`), then `update_status(CASE_OPENED, case_id=…)`
 *  once the case is opened. No other event stage is written by that route, so none is drawn. */
export const INGEST_EVENT_LADDER = ["received", INGEST_CASE_OPENED_STATUS] as const;
export type IngestEventRung = (typeof INGEST_EVENT_LADDER)[number];
/** `ingest_status_route`'s row — `GET /ingest/{id}/status`'s whole response. `stage` is `null`
 *  ONLY on a duplicate whose original is not visible to this caller (existence-oracle safe — see
 *  `readIngestStatusRow`'s rule below and the route's own comment on `gateway.py`). */
export interface IngestStatusRow {
  ingest_id: string;
  sha256: string;
  kind: IngestKind;
  stage: IngestRowStage | IngestUnknownStage | null;
  detail: string | null;
  duplicate: { of_ingest_id: string; message: string } | null;
  /** Epoch milliseconds — a NUMBER on the live wire (roll-11 capture exchanges [1]/[3]), never a
   *  string. See `readIngestStatusRow` below. */
  created_at: number;
  updated_at: number;
  /**
   * `GET /ingest/{id}/status`'s `case_id` (roll #20): the id of the case an EVENT ingest opened,
   * for `GET /cases/{case_id}`. `null` on document rows (Lane 1: null on document rows) and on an
   * event row not yet at `case_opened`. Older producers omit the field entirely — absent reads
   * as `null`, never as a refusal.
   */
  case_id: string | null;
  /**
   * PROPOSED (10-21 packet §3a; not emitted yet): the same pair as the producer's `_review_leaf`
   * (gateway.py:11921) gives the review body. THREE states: key ABSENT = no claim (the chip is not
   * drawn; today's wire), `null` = not identified, string = the leaf. `leaf_source` says who named
   * it. `readIngestStatusRow` OMITS both keys unless the wire carried a valid pair.
   */
  leaf?: IngestLeaf | null;
  leaf_source?: IngestLeafSource | null;
  /** Present with the pair; the person who changed it, only when `leaf_source` is "corrected". */
  corrected_by?: string | null;
  /** Lane 1's confirmed name (203, `c095be48`): best first, 0..3, bbox in page fractions. Absent, `null` and `[]`
   *  all read as no claim (the plain picker shows). */
  leaf_candidates?: IngestLeafCandidate[];
  /**
   * `GET /ingest/{id}/status`'s `extraction_defect` (Lane 1 packet
   * `sessions/2026-10-11-packet-to-cortex-my-drops-extraction-incomplete-has-no-producer-yet.md`):
   * THREE states, kept apart on purpose. ABSENT (the key is not on the row, today's wire until
   * rev 188) means NO CLAIM: nothing is drawn, and it is never read as "complete". `null` means
   * the route can tell and no defect is on record. An object means a steward corrected this
   * drop's extraction. A malformed value is NO CLAIM too, never "complete". Optional on the type;
   * `readIngestStatusRow` OMITS the key unless the wire carried a valid null or object.
   */
  extraction_defect?: ExtractionDefect | null;
  /**
   * Lane 1 204 (`d0f80092`), on the status row and `/ingest/mine`: the current review task's id at `review`, else
   * null. Use it, never build `document_promotion:<id>` (wrong from `:g1` on). Nothing in cortex reads it yet.
   * Non-blank string, `null`, or ABSENT (anything else reads as absent).
   */
  review_task_id?: string | null;
  /** On the `/leaf` answer only (204): the new open review task's id, or null when the row went back to extraction. */
  task_id?: string | null;
  /** On the `/leaf` answer only (204): the review task this change replaced. */
  superseded_task_id?: string | null;
  /**
   * `GET /ingest/{id}/status`'s `notice_id` (Lane 1 packet
   * `sessions/2026-10-12-packet-to-cortex-f3617a9-is-live-notice-id-named-row-edits-accepted-flip-it.md` §2):
   * THREE states, kept apart. A non-blank string is the notice's own identifier (e.g. `PCN26-184`).
   * `null` is a claim that no notice is known. ABSENT (the live fleet never sends it today) is NO
   * CLAIM. Anything else (blank, number, object) is no claim too. Optional on the type;
   * `readIngestStatusRow` OMITS the key unless the wire carried a non-blank string or null.
   */
  notice_id?: string | null;
  /**
   * `GET /ingest/{id}/status`'s `content_kind` (Lane 1 packet
   * `sessions/2026-10-16-packet-to-cortex-ingest-mine-is-live-in-191-and-the-status-body-carries-content-kind.md`,
   * live in 191): the row's LEAF kind, which a confirmation or a reclassification can correct after the
   * drop (a `pdf` drop whose content_kind is `pcn`). Open vocabulary, kept verbatim. Three states, as
   * `notice_id`: a non-blank string is the kind; `null` is "not known" (never an error); ABSENT (a
   * fleet before 191) and anything else is no claim. `readIngestStatusRow` OMITS the key unless the
   * wire carried a non-blank string or null.
   */
  content_kind?: string | null;
  /**
   * `GET /ingest/{id}/status`'s `failure` (Lane 1 packet
   * `sessions/2026-10-12-packet-to-cortex-the-failure-field-is-failure-on-ingest-status-a-failed-drop-is-retryable.md` §1,
   * invincible-agent 33b80988): THREE states. An object is the producer's account of why the drop
   * failed (non-null exactly when stage is `failed`). `null` is a claim of no failure. ABSENT
   * (every fleet before 33b80988 is live) is NO CLAIM, never "no failure". Anything malformed
   * (no non-blank `reason`) is no claim too. Optional on the type; `readIngestStatusRow` OMITS
   * the key unless the wire carried a valid null or object.
   */
  failure?: IngestFailure | null;
  /**
   * `GET /ingest/{id}/status`'s `attempt` (same packet §1/§2, 33b80988): 1 on arrival, +1 per
   * retry. ABSENT on older fleets (no claim). Optional on the type; `readIngestStatusRow` OMITS the
   * key unless the wire carried a positive integer.
   */
  attempt?: number;
}

/** The fixed reason codes (the vocabulary is OPEN — doc-tools owns it; never a closed enum). */
export const INGEST_FAILURE_TIMEOUT = "timeout";
export const INGEST_FAILURE_KIND_UNREGISTERED = "kind_unregistered";

export interface IngestFailure {
  /** Open vocabulary, verbatim; null = the producer did not classify the failure. */
  reason_code: string | null;
  /** Human-readable, always present, verbatim. */
  reason: string;
  step: string | null;
  run_id: string | null;
  pin_digest: string | null;
  failed_at: number | null;
}

function nonBlankOrNull(v: unknown): string | null {
  return typeof v === "string" && v.trim() !== "" ? v : null;
}

/** The three-state reader for `failure`: `undefined` is no claim (not a record, or no non-blank `reason`). */
export function readIngestFailure(raw: unknown): IngestFailure | null | undefined {
  if (raw === null) return null;
  if (!isRecord(raw)) return undefined;
  if (typeof raw.reason !== "string" || raw.reason.trim() === "") return undefined;
  return {
    reason_code: nonBlankOrNull(raw.reason_code),
    reason: raw.reason,
    step: nonBlankOrNull(raw.step),
    run_id: nonBlankOrNull(raw.run_id),
    pin_digest: nonBlankOrNull(raw.pin_digest),
    failed_at: typeof raw.failed_at === "number" && Number.isFinite(raw.failed_at) ? raw.failed_at : null,
  };
}

export interface ExtractionDefect {
  task_id: string;
  /** Rows deleted, added or corrected by the steward. */
  edits: number;
}

/** The three-state reader for `extraction_defect`: `undefined` is no claim (absent or malformed). */
function readExtractionDefect(raw: unknown): ExtractionDefect | null | undefined {
  if (raw === null) return null;
  if (!isRecord(raw)) return undefined;
  if (!isNonEmptyString(raw.task_id)) return undefined;
  if (typeof raw.edits !== "number" || !Number.isInteger(raw.edits) || raw.edits < 0) return undefined;
  return { task_id: raw.task_id, edits: raw.edits };
}

/** The three-state reader for `notice_id`: `undefined` is no claim (absent, blank, or any non-string). */
export function readNoticeId(raw: unknown): string | null | undefined {
  if (raw === null) return null;
  if (typeof raw === "string" && raw.trim() !== "") return raw;
  return undefined;
}

const DETAIL_REQUIRED_STAGES: ReadonlySet<string> = new Set(["rejected", "failed", INGEST_REVIEW_REJECTED_STATUS]);

/**
 * The PROPOSED leaf pair (see `IngestStatusRow.leaf`). `undefined` = NO CLAIM: the `leaf_source` key
 * is absent, or the pair is not one of the valid shapes — (a leaf in `INGEST_LEAVES`, a source in
 * {declared, title, corrected}) or (null, null). Never refuses the row.
 */
function readLeafPair(
  raw: Record<string, unknown>,
): { leaf: IngestLeaf | null; leaf_source: IngestLeafSource | null; corrected_by: string | null } | undefined {
  if (!("leaf_source" in raw)) return undefined;
  const { leaf, leaf_source } = raw;
  if (leaf === null && leaf_source === null) return { leaf: null, leaf_source: null, corrected_by: null };
  const source = readLeafSource(leaf_source);
  if (typeof leaf === "string" && (INGEST_LEAVES as readonly string[]).includes(leaf) && source !== null) {
    // A missing or invalid corrected_by never invalidates the pair.
    return { leaf: leaf as IngestLeaf, leaf_source: source, corrected_by: readCorrectedBy(source, raw.corrected_by) };
  }
  return undefined;
}

/**
 * `GET /ingest/{id}/status` → the row, or `null` on anything malformed. An unrecognised `stage`
 * STRING is not malformed: it is read and carried verbatim (see `IngestUnknownStage`).
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

  let stage: IngestRowStage | IngestUnknownStage | null;
  if (raw.stage === null) {
    stage = null;
  } else if (typeof raw.stage === "string" && (INGEST_STAGES as readonly string[]).includes(raw.stage)) {
    stage = raw.stage as IngestStage;
  } else if (
    raw.kind !== "event" &&
    (INGEST_OOB_DOCUMENT_STATUSES as readonly unknown[]).includes(raw.stage)
  ) {
    // Out-of-band, document-only: an event row at any of these is not a state the producer writes.
    stage = raw.stage as IngestOobDocumentStatus;
  } else if (raw.stage === INGEST_CASE_OPENED_STATUS && raw.kind === "event") {
    // Out-of-band, event-only: a document row at `case_opened` is not a state the producer writes.
    stage = INGEST_CASE_OPENED_STATUS;
  } else if (
    typeof raw.stage === "string" &&
    raw.stage !== "" &&
    // A KNOWN out-of-band token on the wrong kind (an event at awaiting_origin, a document at case_opened) is
    // not a state the producer writes: that stays a refusal. Only a token NO list names is "unknown".
    !(INGEST_OOB_DOCUMENT_STATUSES as readonly string[]).includes(raw.stage) &&
    raw.stage !== INGEST_CASE_OPENED_STATUS
  ) {
    // An unknown stage string has no ladder position, but it is READ, carrying the raw token: the card
    // draws it as not finished and polling continues (ingestPollingDone is false for it).
    stage = raw.stage;
  } else {
    // A non-string, non-null (or blank) stage is malformed, not unknown.
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

  // `case_id`: a non-empty string is the case; null or ABSENT is null (older producers omit the
  // field — roll #20 added it); any other type, including an empty string, refuses the row.
  let case_id: string | null;
  if (raw.case_id === undefined || raw.case_id === null) {
    case_id = null;
  } else if (isNonEmptyString(raw.case_id)) {
    case_id = raw.case_id;
  } else {
    return null;
  }

  const leafPair = readLeafPair(raw);
  const leafCandidates = readLeafCandidates(raw);
  const extraction_defect = readExtractionDefect(raw.extraction_defect);
  const review_task_id = readNoticeId(raw.review_task_id);
  const task_id = readNoticeId(raw.task_id);
  const superseded_task_id = readNoticeId(raw.superseded_task_id);
  const notice_id = readNoticeId(raw.notice_id);
  const content_kind = readNoticeId(raw.content_kind); // same three states as notice_id
  const failure = readIngestFailure(raw.failure);
  const attempt = typeof raw.attempt === "number" && Number.isInteger(raw.attempt) && raw.attempt > 0 ? raw.attempt : undefined;

  return {
    ingest_id: raw.ingest_id,
    sha256: raw.sha256,
    kind: raw.kind as IngestKind,
    stage,
    detail: typeof raw.detail === "string" ? raw.detail : null,
    duplicate,
    created_at: raw.created_at,
    updated_at: raw.updated_at,
    case_id,
    ...(leafPair ?? {}),
    ...(leafCandidates !== undefined ? { leaf_candidates: leafCandidates } : {}),
    ...(extraction_defect !== undefined ? { extraction_defect } : {}),
    ...(review_task_id !== undefined ? { review_task_id } : {}),
    ...(task_id !== undefined ? { task_id } : {}),
    ...(superseded_task_id !== undefined ? { superseded_task_id } : {}),
    ...(notice_id !== undefined ? { notice_id } : {}),
    ...(content_kind !== undefined ? { content_kind } : {}),
    ...(failure !== undefined ? { failure } : {}),
    ...(attempt !== undefined ? { attempt } : {}),
  };
}

/** The fixed label for a duplicate. Drawn only when the producer's message does not already say it. */
export const DUPLICATE_LABEL = "Already processed";

/**
 * The ONE place a duplicate's phrase is chosen, so "already processed" is on screen exactly once.
 * The producer's message is drawn verbatim; it usually carries the phrase itself ("already
 * processed on 2026-09-29 from …"), in which case the label would say it twice. The label leads
 * only when the message is absent/blank or does not contain the phrase (e.g. "same bytes as …").
 */
export function duplicatePhrase(message: string | null | undefined): string {
  if (typeof message !== "string" || message.trim() === "") return DUPLICATE_LABEL;
  return /already processed/i.test(message) ? message : `${DUPLICATE_LABEL} — ${message}`;
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

/**
 * `GET /ingest/mine` (Lane 1 packet
 * `sessions/2026-10-16-packet-to-cortex-ingest-mine-is-live-in-191-and-the-status-body-carries-content-kind.md`,
 * live in 191): the caller's own drops, newest first, as status-route bodies. The architect's ruling:
 * "the rail reads it on load and merges with live entries; browser storage is a cache, never the record."
 */
export const INGEST_MINE_PATH = "/ingest/mine";

/** One page of `GET /ingest/mine`. */
export interface IngestMinePage {
  /** Each item read by `readIngestStatusRow`, in the server's order; an unreadable item is left out. */
  items: IngestStatusRow[];
  /** How many items the page carried that could not be read (so a short list is not silent). */
  unreadable: number;
  /** The opaque cursor for the next page; null on the last. */
  next: string | null;
}

/** `{items: [...], next}` → the page; null when `items` is not an array (not this route's body). */
export function readIngestMinePage(raw: unknown): IngestMinePage | null {
  if (!isRecord(raw) || !Array.isArray(raw.items)) return null;
  const items: IngestStatusRow[] = [];
  let unreadable = 0;
  for (const it of raw.items) {
    const row = readIngestStatusRow(it);
    if (row) items.push(row);
    else unreadable++;
  }
  return { items, unreadable, next: isNonEmptyString(raw.next) ? raw.next : null };
}

/** `POST /ingest/{id}/retry` — encoded exactly like `ingestStatusPath`. */
export function ingestRetryPath(id: string): string {
  return `/ingest/${encodeURIComponent(id)}/retry`;
}

/** PROPOSED `POST /ingest/{id}/leaf` (10-21 packet §3b) — encoded exactly like `ingestRetryPath`. */
export function ingestLeafPath(id: string): string {
  return `/ingest/${encodeURIComponent(id)}/leaf`;
}

/**
 * The review card's two routes. Built on 193 by Lane 1 (`lane/01-193` at 71cdc40b); 193 has rolled, so
 * both are served. A BARE 404 (no error code) now means a server that does not carry them.
 *
 * Both are built HERE from the task's `ingest_id`, never read off a payload: the fetch carries the
 * caller's bearer, and a payload path could point it anywhere (see `promotionReview.ts`).
 *
 * Both have one gate:
 *   - allowed: the dropper, or a caller who can act on the audience of the OPEN
 *     `document_promotion:<ingest_id>` task. A steward's access closes when the task resolves, and
 *     the dropper's does not;
 *   - 404 `ingest_not_found`, 403 `not_entitled` otherwise.
 *
 * `GET /ingest/{id}/extraction`: the extracted rows and the notice header (`readExtraction`).
 * It also answers:
 *   - 422 `no_extraction_ref`, `extraction_rows_absent`, `extraction_unbound`,
 *     `extraction_unreadable`;
 *   - 503 `artifact_store_unreachable`.
 */
export function ingestExtractionPath(id: string): string {
  return `/ingest/${encodeURIComponent(id)}/extraction`;
}

/**
 * `GET /ingest/{id}/source`: the dropped bytes, streamed, `no-store`. It has no `#page=` handling;
 * the PDF pane jumps to the page itself. It also answers:
 *   - 404 `source_absent`;
 *   - 422 `source_unbound`;
 *   - 503 `artifact_store_unreachable`.
 */
export function ingestSourcePath(id: string): string {
  return `/ingest/${encodeURIComponent(id)}/source`;
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
  if (isRecord(detail) && typeof detail.error === "string") return detail.error;
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

/** A 4xx from `POST /ingest` with a readable detail: drawn as a refusal on the rail entry. */
export interface IngestRefusal {
  status: number;
  message: string;
  code: string | null;
  registered: string[] | null;
}

/** Non-null ONLY for a 400-499 response whose detail `readIngestErrorMessage` can read. */
export function readIngestRefusal(err: unknown): IngestRefusal | null {
  if (!isRecord(err) || !isRecord(err.response)) return null;
  const status = err.response.status;
  if (typeof status !== "number" || status < 400 || status > 499) return null;
  const message = readIngestErrorMessage(err);
  if (message === null) return null;
  const data = err.response.data;
  const detail = isRecord(data) ? data.detail : null;
  const code = isRecord(detail) && typeof detail.error === "string" ? detail.error : null;
  const reg = isRecord(detail) ? detail.registered : null;
  const registered = Array.isArray(reg) && reg.every((x) => typeof x === "string") ? (reg as string[]) : null;
  return { status, message, code, registered };
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

/**
 * The retry route's refusal — FastAPI `HTTPException(detail={"error", "message"?})`, so the body is
 * WRAPPED: 409 `{"detail":{"error":"not_failed"}}`, 403 `{"detail":{"error":"retry_is_pin_driven",
 * "message":"..."}}`. Unlike `readActRefusal`, `message` is optional. `null` when not an HTTP error;
 * `error` is null when the body carries none.
 */
export function readIngestRetryRefusal(err: unknown): { status: number; error: string | null; message: string } | null {
  if (!isRecord(err)) return null;
  const response = err.response;
  if (!isRecord(response) || typeof response.status !== "number") return null;
  const data = response.data;
  const detail = isRecord(data) && isRecord(data.detail) ? data.detail : null;
  return {
    status: response.status,
    error: detail && typeof detail.error === "string" ? detail.error : null,
    message: detail && typeof detail.message === "string" ? detail.message : "",
  };
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
  stage: IngestStage | IngestOobDocumentStatus | IngestUnknownStage;
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
export function ingestStageLadder(stage: IngestStage | IngestOobDocumentStatus | IngestUnknownStage): StageRung[] {
  // A token with no position (ingest-v1 §7: unknown means not finished): nothing before it is claimed done,
  // and the token itself is drawn verbatim as the current rung.
  if (
    !(INGEST_STAGES as readonly string[]).includes(stage) &&
    stage !== "failed" &&
    stage !== INGEST_AWAITING_ORIGIN_STATUS &&
    stage !== INGEST_AWAITING_KIND_STATUS &&
    stage !== INGEST_NO_PARTS_STATUS &&
    stage !== INGEST_REVIEW_REJECTED_STATUS
  ) {
    return [...MAIN_STAGES.map((s): StageRung => ({ stage: s, state: "pending" })), { stage, state: "current" } as StageRung];
  }
  // Parked waiting on a person. awaiting_origin sits after extraction (received/extracting happened,
  // review has not). awaiting_kind sits after the title read, BEFORE parts extraction (architect,
  // 10-21): extraction has started but not finished, so it stays pending until a pick resumes it.
  // no_parts is the same shape as awaiting_origin: extraction finished (and found nothing), review did
  // not happen — it is a TERMINAL rung, but a neutral one, so it is not drawn as a branch off review.
  if (stage === INGEST_AWAITING_ORIGIN_STATUS || stage === INGEST_AWAITING_KIND_STATUS || stage === INGEST_NO_PARTS_STATUS) {
    const rungs: StageRung[] = MAIN_STAGES.map((s) => ({
      stage: s,
      state: s === "received" || (s === "extracting" && stage !== INGEST_AWAITING_KIND_STATUS) ? "done" : "pending",
    }));
    rungs.push({ stage, state: "current" });
    return rungs;
  }

  if (stage === "failed") {
    const rungs: StageRung[] = MAIN_STAGES.map((s) => ({
      stage: s,
      state: s === "received" ? "done" : "pending",
    }));
    rungs.push({ stage: "failed", state: "current" });
    return rungs;
  }

  const isTerminalBranch = stage === "rejected" || stage === INGEST_REVIEW_REJECTED_STATUS;
  const branchPoint = MAIN_STAGES.indexOf("review");
  const currentIndex = isTerminalBranch ? branchPoint : MAIN_STAGES.indexOf(stage as IngestStage);

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

export interface EventRung {
  stage: IngestEventRung;
  state: "done" | "current" | "pending";
}

/**
 * The EVENT branch's ladder (`INGEST_EVENT_LADDER`: received, case_opened) for one event row's
 * stage, or `null` when the stage is not one of the two the event route writes — no rung is
 * invented for it. Deliberately a separate list from `ingestStageLadder`: `case_opened` is
 * out-of-band and never a rung of the document ladder.
 */
export function ingestEventLadder(stage: IngestRowStage | IngestUnknownStage | null): EventRung[] | null {
  const at = INGEST_EVENT_LADDER.findIndex((s) => s === stage);
  if (at < 0) return null;
  return INGEST_EVENT_LADDER.map((s, i) => ({
    stage: s,
    state: i < at ? "done" : i === at ? "current" : "pending",
  }));
}

// ── Polling ──────────────────────────────────────────────────────────────────────────────

/** How often a failed+timeout row is re-read (a late run can still advance it). */
export const INGEST_FAILED_TIMEOUT_POLL_MS = 30000;

/** Whether a card polling this row should stop: a duplicate (any row whose `duplicate` is
 *  non-null, including one whose original is invisible — `stage === null`), or a row that has
 *  reached `promoted`, `rejected` or `failed` — EXCEPT a `failed` row whose `failure.reason_code` is
 *  `timeout`, which a late run can still move on (packet §3), so it is not done. `review` keeps polling — a viewer
 *  may still be about to act. */
export function ingestPollingDone(row: Pick<IngestStatusRow, "stage" | "duplicate" | "failure">): boolean {
  if (row.duplicate !== null) return true;
  if (row.stage === "failed" && row.failure?.reason_code === INGEST_FAILURE_TIMEOUT) return false;
  // `case_opened` is the event branch's terminal: nothing in this route moves it on.
  return (
    row.stage === "promoted" ||
    row.stage === "rejected" ||
    row.stage === "failed" ||
    row.stage === INGEST_REVIEW_REJECTED_STATUS ||
    row.stage === INGEST_NO_PARTS_STATUS ||
    row.stage === INGEST_CASE_OPENED_STATUS
  );
}
