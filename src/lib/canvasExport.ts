/**
 * Canvas export — pure logic for `POST /export/package` over a canvas.
 *
 * Wired against the REAL route, invincible-agent origin/master `3f27c7cb`
 * (`feat(export): the gateway serves canvas export -- POST /export/package and the artifact
 * proxy`, rides roll #10), which superseded this repo's own proposed packet
 * (`sessions/2026-09-30-packet-to-lane-1-proposed-wire-for-canvas-export-and-the-ingest-routes.md`
 * section A — `/canvas/export/*`, now historical). Still gated behind `isCanvasExportEnabled()`:
 * the flag stays until a live capture against the real gateway seals it, the same bar every
 * other flagged adapter in this repo clears before going unconditional.
 *
 * Lane 1's live capture, `sessions/2026-10-01-payload-export-package-roll-11.json`, sealed the
 * REFUSAL half only — `GET /export/package/recipients`, the 409 `recipient_required` shape, and
 * a `status: "failed"` response carrying the new `outcome` field (the live engine could not import
 * `agent_fleet`, so every observed POST had failed).
 *
 * The first witnessed `"exists"` response is Lane 1's rev-171 capture (helm rev 171, fleet
 * `4c3b61a6`): `sessions/2026-10-04-payload-export-package-rev-171-{1-recipients,2-post,
 * 3-get-artifact,4-get-artifact-no-token}.json` — a full round trip, recipients through a served
 * artifact GET (200, `content-length` matching `artifact_bytes`) and the same GET with no bearer
 * (401, `www-authenticate: Bearer`). Sealed in `canvasExport.test.ts`.
 *
 * No React here on purpose — same split as `cardExport.ts`: the decisions are pure and sealed,
 * the DOM/network is thin and lives in the component.
 */
import { TASK_ARTIFACT_PREFIX } from "@/lib/taskArtifact";
import { INGEST_ARTIFACT_PREFIX } from "@/lib/ingestArtifact";
import { isFeatureEnabled } from "@/lib/featureFlags";

export interface ExportRecipient {
  value: string;
  label: string;
}

function isNonEmptyString(v: unknown): v is string {
  return typeof v === "string" && v.length > 0;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

/**
 * `GET /export/package/recipients`'s `recipients` array, and the 409 `recipient_required`
 * body's `options` — both `{value, label}` pairs, both non-empty strings (roll-11 capture
 * exchange [0]). `null` on a non-array OR any malformed element: a partial list must not be
 * drawn as though it were the whole list.
 */
export function readExportRecipients(raw: unknown): ExportRecipient[] | null {
  if (!Array.isArray(raw)) return null;
  const out: ExportRecipient[] = [];
  for (const item of raw) {
    if (!isRecord(item) || !isNonEmptyString(item.value) || !isNonEmptyString(item.label)) {
      return null;
    }
    out.push({ value: item.value, label: item.label });
  }
  return out;
}

/**
 * `POST /export/package`'s 409 body's `detail` (roll-11 capture exchange [1]) — non-null ONLY
 * when `reason === "recipient_required"` AND `options` itself passes `readExportRecipients`. A
 * malformed 409 (the reason present but garbage options, or anything else) must not seed the
 * picker with an empty or partial list — see `CanvasExportButton.tsx`'s 409 arm, which falls
 * through to the generic error text on a `null` here instead.
 */
export function readRecipientRequired(detail: unknown): ExportRecipient[] | null {
  if (!isRecord(detail) || detail.reason !== "recipient_required") return null;
  return readExportRecipients(detail.options);
}

// `"producing"` is kept as a legal value of the type and of `readCanvasExport` — a value this
// adapter can still parse — but the real gateway is SYNCHRONOUS (`3f27c7cb`): `export_package`
// never returns it today. There is also no GET-by-id to poll it with. It stays legal so a future
// async slice does not require re-widening this type and every reader of it.
export type CanvasExportStatus = "producing" | "exists" | "failed";

/**
 * One engine's section of a MIXED-board export (`documents[]`, invincible-agent `5b2a16a2`,
 * `gateway.py` `export_package`'s per-engine split). Each is `{engine, answers, ...section}`
 * where the section is exactly one of `_shape_export_package_response`'s two arms (refusal /
 * success + cost's `lots_disclosed`/`sections`), `_cost_refusal_section`, or
 * `_fin_ad_hoc_refusal_section` — so every field past the five required ones may be absent or
 * null, and a section's own `status` is only ever `exists` or `failed` (never `partial`).
 * The refusal fields (`reason`, `reason_code`, `outcome`) belong to the EXPORTER'S view only.
 */
export interface CanvasExportDocument {
  engine: string;
  answers: string[];
  status: CanvasExportStatus;
  export_id: string | null;
  recipient_scope: string;
  artifact_uri?: string;
  artifact_sha256?: string;
  artifact_bytes?: number;
  artifact_filename?: string;
  algorithm_sha?: string;
  reason?: string;
  reason_code?: string;
  outcome?: string;
  lots_disclosed?: number[] | null;
  sections?: string[] | null;
  template_id?: string | null;
}

export interface CanvasExport {
  /** The content address (`artifact_sha256`) when `status === "exists"`; `null` on failure —
   *  there is no job id, because production is synchronous and the hash IS the identity. */
  export_id: string | null;
  /** `"partial"` is the MIXED-board verdict (some engines exported, some refused) and is only
   *  ever read together with a non-empty `documents`. */
  status: CanvasExportStatus | "partial";
  recipient_scope: string;
  /** Per-engine sections of a mixed board. Present => the top-level artifact/lots/sections
   *  fields are NOT where to look; each document carries its own. */
  documents?: CanvasExportDocument[];
  artifact_uri?: string;
  artifact_sha256?: string;
  artifact_bytes?: number;
  artifact_filename?: string;
  algorithm_sha?: string;
  reason?: string;
  /** Present on a `status: "failed"` response — the engine's own refusal category (e.g.
   *  `"unavailable"` when the package builder could not be imported; roll-11 capture
   *  exchange [2]). Copied through verbatim, never inferred. */
  outcome?: string;
  /** Which lots were included in the package, when the engine reports it; `null` when it
   *  doesn't apply to this recipient/canvas. */
  lots_disclosed?: number[] | null;
  /** Which report sections were built, same null-vs-absent shape as `lots_disclosed`. */
  sections?: string[] | null;
}

const VALID_STATUSES: readonly CanvasExportStatus[] = ["producing", "exists", "failed"];
/** The top-level set: the mixed path emits `exists | partial | failed` (`gateway.py`). */
const VALID_TOP_STATUSES: readonly string[] = [...VALID_STATUSES, "partial"];

/**
 * One `documents[]` element, or `null` when malformed. The five required fields mirror what
 * every section arm emits (engine, answers, status, export_id, recipient_scope); the rest follow
 * the top-level reader's own rule — a wrong-typed optional is left out, never coerced.
 */
function readExportDocument(raw: unknown): CanvasExportDocument | null {
  if (!isRecord(raw)) return null;
  const d = raw as Record<string, unknown>;
  if (!isNonEmptyString(d.engine)) return null;
  if (!Array.isArray(d.answers) || !d.answers.every((a) => typeof a === "string")) return null;
  if (typeof d.status !== "string" || !VALID_STATUSES.includes(d.status as CanvasExportStatus)) {
    return null;
  }
  if (d.export_id !== null && typeof d.export_id !== "string") return null;
  if (!isNonEmptyString(d.recipient_scope)) return null;

  const out: CanvasExportDocument = {
    engine: d.engine,
    answers: d.answers as string[],
    status: d.status as CanvasExportStatus,
    export_id: d.export_id as string | null,
    recipient_scope: d.recipient_scope,
  };
  if (typeof d.artifact_uri === "string") out.artifact_uri = d.artifact_uri;
  if (typeof d.artifact_sha256 === "string") out.artifact_sha256 = d.artifact_sha256;
  if (typeof d.artifact_bytes === "number") out.artifact_bytes = d.artifact_bytes;
  if (typeof d.artifact_filename === "string") out.artifact_filename = d.artifact_filename;
  if (typeof d.algorithm_sha === "string") out.algorithm_sha = d.algorithm_sha;
  if (typeof d.reason === "string") out.reason = d.reason;
  if (typeof d.reason_code === "string") out.reason_code = d.reason_code;
  if (typeof d.outcome === "string") out.outcome = d.outcome;
  if (d.template_id === null || typeof d.template_id === "string") out.template_id = d.template_id;
  if (d.lots_disclosed === null) out.lots_disclosed = null;
  else if (Array.isArray(d.lots_disclosed) && d.lots_disclosed.every((v) => typeof v === "number")) {
    out.lots_disclosed = d.lots_disclosed as number[];
  }
  if (d.sections === null) out.sections = null;
  else if (Array.isArray(d.sections) && d.sections.every((v) => typeof v === "string")) {
    out.sections = d.sections as string[];
  }
  return out;
}

/**
 * `documents` absent or null => `undefined` (the single-engine path, untouched). Present =>
 * the list, or `null` for "unreadable".
 *
 * MALFORMED RULE (this file's own doctrine, `readExportRecipients` above: "a partial list must
 * not be drawn as though it were the whole list"): any malformed element, a non-array, or an
 * EMPTY array makes the documents unreadable, and unreadable documents null the WHOLE response —
 * not just the list. Dropping to a documents-less row would draw a top-level `partial`/`exists`
 * with no per-engine truth behind it (an `exists` with no link, a refusal never shown), which is
 * the exact misreading this adapter exists to prevent; "an unrecognised shape reads as no export"
 * (`readCanvasExport`'s own rule). An empty array is unreadable because the gateway never emits
 * one (the mixed path runs only when a fin part exists) and zero rows would be a claim.
 */
function readExportDocuments(raw: unknown): CanvasExportDocument[] | null | undefined {
  if (raw === undefined || raw === null) return undefined;
  if (!Array.isArray(raw) || raw.length === 0) return null;
  const out: CanvasExportDocument[] = [];
  for (const item of raw) {
    const d = readExportDocument(item);
    if (d === null) return null;
    out.push(d);
  }
  return out;
}

/**
 * Validating adapter for the export response (`POST /export/package`'s success body). Never
 * throws — an unrecognised shape or an unknown `status` (a server ahead of this client, or a
 * malformed response) reads as "no export", the same non-claim every other adapter in this
 * codebase draws from garbage.
 */
export function readCanvasExport(raw: unknown): CanvasExport | null {
  if (typeof raw !== "object" || raw === null) return null;
  const r = raw as Record<string, unknown>;
  if (r.export_id !== null && typeof r.export_id !== "string") return null;
  if (typeof r.recipient_scope !== "string" || !r.recipient_scope) return null;
  if (typeof r.status !== "string" || !VALID_TOP_STATUSES.includes(r.status)) {
    return null;
  }
  const documents = readExportDocuments(r.documents);
  if (documents === null) return null;
  // `partial` is only meaningful as a verdict over documents; without them it is unreadable.
  if (r.status === "partial" && documents === undefined) return null;

  const out: CanvasExport = {
    export_id: r.export_id === null ? null : (r.export_id as string),
    status: r.status as CanvasExport["status"],
    recipient_scope: r.recipient_scope,
  };
  if (documents !== undefined) out.documents = documents;
  if (typeof r.artifact_uri === "string") out.artifact_uri = r.artifact_uri;
  if (typeof r.artifact_sha256 === "string") out.artifact_sha256 = r.artifact_sha256;
  if (typeof r.artifact_bytes === "number") out.artifact_bytes = r.artifact_bytes;
  if (typeof r.artifact_filename === "string") out.artifact_filename = r.artifact_filename;
  if (typeof r.algorithm_sha === "string") out.algorithm_sha = r.algorithm_sha;
  if (typeof r.reason === "string") out.reason = r.reason;
  if (typeof r.outcome === "string") out.outcome = r.outcome;
  if (r.lots_disclosed === null) out.lots_disclosed = null;
  else if (Array.isArray(r.lots_disclosed) && r.lots_disclosed.every((v) => typeof v === "number")) {
    out.lots_disclosed = r.lots_disclosed as number[];
  }
  if (r.sections === null) out.sections = null;
  else if (Array.isArray(r.sections) && r.sections.every((v) => typeof v === "string")) {
    out.sections = r.sections as string[];
  }
  return out;
}

const SHA256_RE = /^sha256:[0-9a-f]{64}$/;
/** The gateway-only path the download proxy serves — `3f27c7cb`'s `artifact_uri` is always
 *  this prefix, never the engine's own path, specifically so a caller cannot be pointed at an
 *  arbitrary URL by a compromised or mis-built response. */
const ARTIFACT_URI_PREFIX = "/export/package/artifact/";

/**
 * The link-drawing rule: non-null ONLY when `status === "exists"` AND `artifact_sha256` matches
 * `^sha256:[0-9a-f]{64}$` (lowercase hex, full 64, prefixed) AND `artifact_uri` is a non-empty
 * string starting with the gateway's own download-proxy prefix. That hash is the engine's
 * re-read-from-disk evidence that the file exists; anything short of it draws the status text,
 * never a link — a link pointing at a file that was never confirmed written, or at a path this
 * client did not verify is the gateway's own proxy, is worse than no link.
 */
export function artifactLink(
  e: Pick<
    CanvasExport,
    "status" | "artifact_uri" | "artifact_sha256" | "artifact_filename" | "artifact_bytes"
  >,
): { href: string; sha256: string; filename?: string; bytes?: number } | null {
  if (e.status !== "exists") return null;
  if (typeof e.artifact_sha256 !== "string" || !SHA256_RE.test(e.artifact_sha256)) return null;
  if (typeof e.artifact_uri !== "string" || e.artifact_uri.length === 0) return null;
  if (!e.artifact_uri.startsWith(ARTIFACT_URI_PREFIX)) return null;

  const link: { href: string; sha256: string; filename?: string; bytes?: number } = {
    href: e.artifact_uri,
    sha256: e.artifact_sha256,
  };
  if (e.artifact_filename !== undefined) link.filename = e.artifact_filename;
  if (e.artifact_bytes !== undefined) link.bytes = e.artifact_bytes;
  return link;
}

/**
 * The ids of the canvas's ANSWERS, in canvas order, deduped — the population `answers` is built
 * from on export. Task-artifacts (`TASK_ARTIFACT_PREFIX`-prefixed ids, `taskArtifact.ts`) are
 * not answers and are excluded by id, per section A's contract population; so are drops
 * (`INGEST_ARTIFACT_PREFIX`, `ingestArtifact.ts`) — client-made, never in the graph of record.
 */
/**
 * The words a person reads for one answer: the non-empty `summary`, else the non-empty
 * `question_text`, else the id. Trimmed; no other coercion.
 */
export function answerLabel(a: { id: string; summary?: string; question_text?: string }): string {
  const summary = typeof a.summary === "string" ? a.summary.trim() : "";
  if (summary) return summary;
  const question = typeof a.question_text === "string" ? a.question_text.trim() : "";
  if (question) return question;
  return a.id;
}

export function canvasAnswerIds(artifacts: { id: string }[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const a of artifacts) {
    if (a.id.startsWith(TASK_ARTIFACT_PREFIX) || a.id.startsWith(INGEST_ARTIFACT_PREFIX)) continue;
    if (seen.has(a.id)) continue;
    seen.add(a.id);
    out.push(a.id);
  }
  return out;
}

// ── Flag ────────────────────────────────────────────────────────────────
// Backed by the runtime feature-flag registry (`src/lib/featureFlags.ts`): a localStorage
// override for local/dev, falling back to the deployer's `VITE_FEATURES` runtime list. Default
// OFF — the route is real (`3f27c7cb`) but unwitnessed from this client; the flag stays until a
// live capture seals it.
export function isCanvasExportEnabled(): boolean {
  return isFeatureEnabled("canvasExport");
}
