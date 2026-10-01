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
 * Lane 1's live capture, `sessions/2026-10-01-payload-export-package-roll-11.json`, seals the
 * REFUSAL half only — `GET /export/package/recipients`, the 409 `recipient_required` shape, and
 * a `status: "failed"` response carrying the new `outcome` field (the live engine cannot import
 * `agent_fleet`, so every observed POST has failed). No `"exists"` response has been witnessed
 * from this client yet; that arm stays as it was, unsealed.
 *
 * No React here on purpose — same split as `cardExport.ts`: the decisions are pure and sealed,
 * the DOM/network is thin and lives in the component.
 */
import { TASK_ARTIFACT_PREFIX } from "@/lib/taskArtifact";
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

export interface CanvasExport {
  /** The content address (`artifact_sha256`) when `status === "exists"`; `null` on failure —
   *  there is no job id, because production is synchronous and the hash IS the identity. */
  export_id: string | null;
  status: CanvasExportStatus;
  recipient_scope: string;
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
  if (typeof r.status !== "string" || !VALID_STATUSES.includes(r.status as CanvasExportStatus)) {
    return null;
  }

  const out: CanvasExport = {
    export_id: r.export_id === null ? null : (r.export_id as string),
    status: r.status as CanvasExportStatus,
    recipient_scope: r.recipient_scope,
  };
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
  e: CanvasExport,
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
 * not answers and are excluded by id, per section A's contract population.
 */
export function canvasAnswerIds(artifacts: { id: string }[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const a of artifacts) {
    if (a.id.startsWith(TASK_ARTIFACT_PREFIX)) continue;
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
