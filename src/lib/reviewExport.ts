import type { Artifact } from "@/api/types";
import { ingestComponentFrom } from "@/lib/ingestArtifact";

/**
 * reviewExport -- export on the completed review card, and the batch export.
 *
 * Packet: invincible-agent `sessions/2026-10-28-packet-to-lane-01-from-cortex-review-export-what-cortex-needs-on-the-wire.md`.
 *
 * Routes 1-3 are declared at invincible-agent 10ac02fe (#154); field 4 at c3b51ed7 (#290, ingest-v1 1.7.0).
 * The wire names are spelled ONCE, here:
 *   1. `GET /ingest/export/profiles`                      -> bare array of ExportProfile
 *   2. `GET /ingest/{ingest_id}/export?profile=<name>`    -> file bytes + Content-Disposition
 *   3. `GET /ingest/export?profile=&from=&to=`            -> batch file, same headers
 *   4. `capabilities` on `GET /me/entitlements`           -> batch control, on `EXPORT_BATCH_CAPABILITY`
 * The profile keys follow lane 01's `policy/exports/` header (invincible-agent
 * `sessions/2026-10-28-packet-to-fin-policy-exports-header-is-granularity-not-scope.md`):
 * `{name, format, granularity, label}`, format and granularity read verbatim (any non-empty string; config names the case, architect 2026-10-30). It was `scope: row | notice`
 * in cortex's proposal; 7f §2 records `scope` as a three-way collision, so lane 01 renamed it.
 * Routes 1-3 and the profile keys are declared at invincible-agent 10ac02fe (#154). A refusal there is
 * FastAPI's `HTTPException(detail={error, ...})`,
 * so the code is `detail.error` (`ingest_not_promoted`, `not_entitled_to_export_batch`,
 * `export_profile_unknown`, ...). The file routes fetch as a Blob, so the client re-reads a refusal
 * body as JSON before `refusalCode` sees it (`jsonRefusalBody`).
 *
 * "EXPORT AS..." ON THE LASSO BAR (architect rulings 2026-11-10, relayed by Chris):
 *   1. Profiles gain `accepts` (content kinds), `grain` (`per_notice | per_part`, optional `dedupe`) and `version`.
 *   2. The server serves only the profiles the caller may use.
 *   3. Unexportable notices in a selection are listed with reasons BEFORE download, and the user may proceed
 *      without them. The file never fails silently.
 *   4. The panel above the answers list goes. "Export as..." joins the lasso bar. It resolves the selection to its
 *      notices and offers only the profiles that accept EVERY kind present. "Select by range" is a shortcut inside
 *      that dialog.
 *   5. Personal download is the default, and it needs no recipient.
 * saf owns the server side and has declared NO wire yet, so the resolve route and the POST form of the download
 * below are PROVISIONAL and CORTEX-PROPOSED (precedent: `accessProposal.ts`). They are spelled once, here, and saf
 * confirms or corrects them. Config names the case: nothing here knows a content kind, a profile or a column.
 *
 * The gate is `stage === "promoted"` on `GET /ingest/{id}/status` (a REAL, declared route).
 */

/** Route 2, declared at invincible-agent 10ac02fe (#154). */
export const exportOnePath = (ingestId: string): string => `/ingest/${encodeURIComponent(ingestId)}/export`;
/** Route 3, declared at invincible-agent 10ac02fe (#154). */
export const EXPORT_BATCH_PATH = "/ingest/export";
/** The capability the batch control is shown on. It is the key route 3's door is gated on (`can_invoke`), so the
 *  control shows exactly when the door would admit. Capability, never group (architect 2026-11-07). */
export const EXPORT_BATCH_CAPABILITY = "ingest:exportBatch";

/** `format` and `granularity` are read verbatim, any non-empty string: the producer's `FORMATS` / `GRANULARITIES`
 *  decide what is served, and cortex only shows them and uses `format` as a filename-extension fallback. A closed
 *  union here would blank the WHOLE picker the day the producer adds a value (config names the case, architect 2026-10-30). */
export type ExportProfile = {
  name: string;
  format: string;
  granularity: string;
  label?: string;
  /** The content kinds the profile takes (ruling 1). Absent means cortex does not know, so it is never offered. */
  accepts?: string[];
  /** `per_notice | per_part` today, read verbatim. */
  grain?: string;
  dedupe?: boolean;
  version?: string;
};

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** The served list, or null when ANY entry is malformed. Server order kept; no dedupe, no sort. */
export function readExportProfiles(body: unknown): ExportProfile[] | null {
  if (!Array.isArray(body)) return null;
  const out: ExportProfile[] = [];
  for (const e of body) {
    if (!isRecord(e)) return null;
    if (typeof e.name !== "string" || e.name === "") return null;
    if (typeof e.format !== "string" || e.format === "") return null;
    if (typeof e.granularity !== "string" || e.granularity === "") return null;
    const p: ExportProfile = { name: e.name, format: e.format, granularity: e.granularity };
    if (typeof e.label === "string") p.label = e.label;
    if ("accepts" in e) {
      if (!Array.isArray(e.accepts) || !e.accepts.every((k) => typeof k === "string" && k !== "")) return null;
      p.accepts = e.accepts as string[];
    }
    if ("grain" in e) {
      if (typeof e.grain !== "string" || e.grain === "") return null;
      p.grain = e.grain;
    }
    if ("version" in e) {
      if (typeof e.version !== "string" || e.version === "") return null;
      p.version = e.version;
    }
    if ("dedupe" in e) {
      if (typeof e.dedupe !== "boolean") return null;
      p.dedupe = e.dedupe;
    }
    out.push(p);
  }
  return out;
}

/** The profiles, in served order, that accept EVERY kind. A profile with no `accepts` is never offered: cortex does
 *  not guess what it accepts. No kinds offers nothing. */
export function profilesAccepting(profiles: ExportProfile[], kinds: string[]): ExportProfile[] {
  if (kinds.length === 0) return [];
  return profiles.filter((p) => Array.isArray(p.accepts) && kinds.every((k) => p.accepts!.includes(k)));
}

export function profileLabel(p: ExportProfile): string {
  return typeof p.label === "string" && p.label !== "" ? p.label : p.name;
}

export function isExportStage(stage: unknown): boolean {
  return stage === "promoted";
}

/** The served `capabilities` list (every key the caller holds `can_invoke` on) carries the batch key. A body without
 *  the list -- a BFF older than #290 -- is false: the control hides rather than offering a door that refuses. */
export function canExportBatch(entitlements: unknown): boolean {
  if (!isRecord(entitlements)) return false;
  const c = entitlements.capabilities;
  return Array.isArray(c) && c.includes(EXPORT_BATCH_CAPABILITY);
}

// -- PROVISIONAL, CORTEX-PROPOSED (saf owns the server side; not declared yet) ------------------
/** `POST /ingest/export/resolve`. Body `{ingest_ids}` or `{from, to}` (YYYY-MM-DD); response
 *  `{notices: [{ingest_id, notice_id, content_kind}], unexportable: [{ingest_id, notice_id, reason_code, reason}]}`. */
export const EXPORT_RESOLVE_PATH = "/ingest/export/resolve";
/** The download is `POST EXPORT_BATCH_PATH` with `{profile, ingest_ids}`: file bytes plus Content-Disposition. The
 *  server records the actor, the ids, the profile and its version. Cortex sends no recipient. */

export type ExportScope = { ingestIds: string[] } | { from: string; to: string };
export type ResolvedNotice = { ingest_id: string; notice_id: string | null; content_kind: string };
export type Unexportable = { ingest_id: string | null; notice_id: string | null; reason_code: string | null; reason: string };
export type ExportResolution = { notices: ResolvedNotice[]; unexportable: Unexportable[] };

/** The resolve body, so its key names are spelled here once. */
export function exportScopeBody(scope: ExportScope): Record<string, unknown> {
  return "ingestIds" in scope ? { ingest_ids: scope.ingestIds } : { from: scope.from, to: scope.to };
}

const strOrNull = (v: unknown): v is string | null => v === null || typeof v === "string";

/** The resolution, or null when ANY part is malformed (strict, like `readExportProfiles`). */
export function readExportResolution(body: unknown): ExportResolution | null {
  if (!isRecord(body) || !Array.isArray(body.notices) || !Array.isArray(body.unexportable)) return null;
  const notices: ResolvedNotice[] = [];
  for (const n of body.notices) {
    if (!isRecord(n)) return null;
    if (typeof n.ingest_id !== "string") return null;
    if (!strOrNull(n.notice_id)) return null;
    if (typeof n.content_kind !== "string" || n.content_kind === "") return null;
    notices.push({ ingest_id: n.ingest_id, notice_id: n.notice_id, content_kind: n.content_kind });
  }
  const unexportable: Unexportable[] = [];
  for (const u of body.unexportable) {
    if (!isRecord(u)) return null;
    if (!strOrNull(u.ingest_id) || !strOrNull(u.notice_id) || !strOrNull(u.reason_code)) return null;
    if (typeof u.reason !== "string" || u.reason === "") return null;
    unexportable.push({ ingest_id: u.ingest_id, notice_id: u.notice_id, reason_code: u.reason_code, reason: u.reason });
  }
  return { notices, unexportable };
}

/** Partition the lasso selection: the ingest ids to resolve (selection order, distinct), the INGEST cards that have no
 *  ingest id yet, and a count of every other present card (answers, tasks) that this export does not take. */
export function selectionNotices(
  artifacts: Artifact[],
  selection: string[],
): { ingestIds: string[]; notReady: { id: string; label: string }[]; others: number } {
  const byId = new Map(artifacts.map((a) => [a.id, a]));
  const ingestIds: string[] = [];
  const notReady: { id: string; label: string }[] = [];
  let others = 0;
  for (const id of selection) {
    const a = byId.get(id);
    if (!a) continue;
    const c = ingestComponentFrom(a);
    if (!c) {
      others += 1;
    } else if (c.ingest_id) {
      if (!ingestIds.includes(c.ingest_id)) ingestIds.push(c.ingest_id);
    } else {
      notReady.push({ id, label: a.summary || id });
    }
  }
  return { ingestIds, notReady, others };
}

function stripPath(name: string): string | null {
  const base = name.split(/[\\/]/).pop() ?? "";
  return base === "" || base === "." || base === ".." ? null : base;
}

export function filenameFromDisposition(header: string | undefined | null): string | null {
  if (typeof header !== "string") return null;
  const star = /filename\*\s*=\s*[^']*'[^']*'([^;]+)/i.exec(header);
  if (star) {
    let v = star[1]!.trim();
    try {
      v = decodeURIComponent(v);
    } catch {
      /* keep raw */
    }
    const s = stripPath(v);
    if (s) return s;
  }
  const quoted = /filename\s*=\s*"([^"]*)"/i.exec(header);
  if (quoted) return stripPath(quoted[1]!);
  const bare = /filename\s*=\s*([^;"\s]+)/i.exec(header);
  if (bare) return stripPath(bare[1]!);
  return null;
}

/** Re-read a Blob refusal body as JSON, in place; anything unreadable is left as it was. */
export async function jsonRefusalBody(err: unknown): Promise<void> {
  const res = isRecord(err) && isRecord(err.response) ? err.response : null;
  if (!res || !(res.data instanceof Blob)) return;
  try {
    res.data = JSON.parse(await res.data.text());
  } catch {
    /* not JSON: refusalCode reads no code */
  }
}

export function refusalCode(err: unknown): { status: number | null; code: string | null } {
  const res = isRecord(err) && isRecord(err.response) ? err.response : null;
  if (!res) return { status: null, code: null };
  const status = typeof res.status === "number" ? res.status : null;
  const data = isRecord(res.data) ? res.data : null;
  const detail = data && isRecord(data.detail) ? data.detail : null;
  const raw = detail ? detail.error : null;
  return { status, code: typeof raw === "string" ? raw : null };
}

// -- The fixture: SYNTHETIC, served only when `reviewExportMock` is on -----------------------
/** What `GET /ingest/export/profiles` returns at invincible-agent 10ac02fe (#154): the two profiles in
 *  `policy/exports/*.yaml`, sorted by name. Sealed field for field by `reviewExport154.test.ts`. */
export const FIXTURE_154_PROFILES: ExportProfile[] = [
  { name: "default-csv", format: "csv", granularity: "notice_part", label: "Default CSV, one row per notice part" },
  { name: "default-json", format: "json", granularity: "notice_part", label: "Default JSON, one row per notice part, with provenance" },
];
/** Each profile's `columns[].output`, in order (the header row of `to_csv`, `columns` of `to_json`). */
export const FIXTURE_154_COLUMNS: Record<string, string[]> = {
  "default-csv": [
    "Ingest", "Notice", "Leaf", "Manufacturer", "Manufacturer source", "Notice date", "Part",
    "Affected MPN", "Replacement MPN", "LTB date", "notice_date_ambiguous", "ltb_date_ambiguous", "no_parts",
  ],
  "default-json": [
    "Ingest", "Notice", "Leaf", "Manufacturer", "Manufacturer source", "Notice date", "Part",
    "Affected MPN", "Affected MPN obtained via", "Affected MPN evidence",
    "Replacement MPN", "Replacement MPN obtained via", "Replacement MPN evidence",
    "LTB date", "LTB date obtained via", "LTB date evidence",
    "notice_date_ambiguous", "ltb_date_ambiguous", "no_parts",
  ],
};
/** SYNTHETIC content kinds for the provisional fixtures. */
export const FIXTURE_KINDS = ["synthetic-kind-a", "synthetic-kind-b"];
/** PROVISIONAL profiles (accepts / grain / version, ruling 1): the two 154 profiles plus a sample overlay (ruling 7). */
export const FIXTURE_PROVISIONAL_PROFILES: ExportProfile[] = [
  ...FIXTURE_154_PROFILES.map((p) => ({ ...p, accepts: [FIXTURE_KINDS[0]!], grain: "per_notice", version: "1" })),
  {
    name: "part-list",
    format: "csv",
    granularity: "notice_part",
    label: "Part list (sample)",
    accepts: [...FIXTURE_KINDS],
    grain: "per_part",
    dedupe: true,
    version: "1",
  },
];
export const FIXTURE_PROVISIONAL_COLUMNS: Record<string, string[]> = { ...FIXTURE_154_COLUMNS, "part-list": ["Part"] };

/** The SYNTHETIC resolution: ids are all notices of the first kind; a range has two kinds and one refusal. */
export function fixtureResolution(scope: ExportScope): ExportResolution {
  if ("ingestIds" in scope) {
    return {
      notices: scope.ingestIds.map((id, i) => ({ ingest_id: id, notice_id: `synthetic-notice-${i + 1}`, content_kind: FIXTURE_KINDS[0]! })),
      unexportable: [],
    };
  }
  return {
    notices: [
      { ingest_id: "synthetic-range-1", notice_id: null, content_kind: FIXTURE_KINDS[0]! },
      { ingest_id: "synthetic-range-2", notice_id: null, content_kind: FIXTURE_KINDS[1]! },
    ],
    unexportable: [{ ingest_id: "synthetic-range-3", notice_id: null, reason_code: "synthetic_refusal", reason: "synthetic: not promoted" }],
  };
}

/** The `GET /me/entitlements` body `reviewExportMock` stands in: the fields `canExportBatch` reads, as served. */
export const FIXTURE_ENTITLEMENTS = { capabilities: [EXPORT_BATCH_CAPABILITY] };

/** One SYNTHETIC row for `columns`: every cell is plainly marked, none is a real notice's. */
function syntheticRow(columns: string[], key: string): Record<string, string> {
  const row: Record<string, string> = {};
  for (const col of columns) row[col] = col === "Ingest" ? key : `synthetic ${col}`;
  return row;
}

/** Shaped like the producer's `to_csv` (CRLF, header then rows) and `to_json` ({profile, column_map_version,
 *  granularity, columns, rows}), with one synthetic row per id. A profile the fixture does not know gets no columns. */
export function fixtureExportBody(
  profile: ExportProfile,
  scope: { ingestId: string } | { ingestIds: string[] },
): { blob: Blob; filename: string } {
  const ids = "ingestId" in scope ? [scope.ingestId] : scope.ingestIds;
  const key = "ingestId" in scope ? scope.ingestId : `selection-${ids.length}`;
  const columns = FIXTURE_PROVISIONAL_COLUMNS[profile.name] ?? [];
  const rows = ids.map((id) => syntheticRow(columns, id));
  const cell = (v: string): string => (/[",\r\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  const text =
    profile.format === "csv"
      ? [columns, ...rows.map((row) => columns.map((c) => row[c]!))].map((r) => r.map(cell).join(",") + "\r\n").join("")
      : JSON.stringify({ profile: profile.name, column_map_version: 1, granularity: profile.granularity, columns, rows });
  const type = profile.format === "csv" ? "text/csv" : "application/json";
  return { blob: new Blob([text], { type }), filename: `${key}.${profile.name}.${profile.format}` };
}
