import type { Artifact } from "@/api/types";
import { ingestComponentFrom, ingestLeadLine } from "@/lib/ingestArtifact";
import type { IngestStatusRow } from "@/lib/ingestWire";

/**
 * reviewExport -- export on the completed review card, and the batch export.
 *
 * Packet: invincible-agent `sessions/2026-10-28-packet-to-lane-01-from-cortex-review-export-what-cortex-needs-on-the-wire.md`.
 *
 * Route 1 is declared at invincible-agent 10ac02fe (#154), route 2 at 6a4175a2 (#356); field 3 at c3b51ed7 (#290, ingest-v1 1.7.0).
 * The wire names are spelled ONCE, here:
 *   1. `GET /ingest/export/profiles`                      -> bare array of ExportProfile
 *   2. `POST /ingest/export/notices`                       -> check_only list, or the batch file (see EXPORT AS below)
 *   3. `capabilities` on `GET /me/entitlements`           -> batch control, on `EXPORT_BATCH_CAPABILITY`
 * The profile keys follow lane 01's `policy/exports/` header (invincible-agent
 * `sessions/2026-10-28-packet-to-fin-policy-exports-header-is-granularity-not-scope.md`):
 * `{name, format, granularity, label}`, format and granularity read verbatim (any non-empty string; config names the case, architect 2026-10-30). It was `scope: row | notice`
 * in cortex's proposal; 7f §2 records `scope` as a three-way collision, so lane 01 renamed it.
 * Route 1 and the profile keys are declared at invincible-agent 10ac02fe (#154). A refusal there is
 * FastAPI's `HTTPException(detail={error, ...})`,
 * so the code is `detail.error` (`not_entitled_to_export`, `not_entitled_to_export_batch`,
 * `export_profile_unknown`, ...). The file route fetches as a Blob, so the client re-reads a refusal
 * body as JSON before `refusalCode` sees it (`jsonRefusalBody`).
 *
 * "EXPORT AS..." (architect rulings 2026-11-10, relayed by Chris; wire declared by saf's #356 at invincible-agent 6a4175a2):
 *   1. Profiles carry `accepts` (content kinds; null = any), `grain`, `dedupe`, `version`, `exportable_states`.
 *   2. The server serves only the profiles the caller may use.
 *   3. Unexportable notices are listed with reasons BEFORE download (`check_only`), and the user may proceed without them.
 *   4. "Export as..." offers only the profiles that accept EVERY kind present and whose `exportable_states` include a state present.
 *   5. Personal download is the default and needs no recipient: `destination` is never sent.
 *   6. `POST /ingest/export/notices` `{notice_ids, profile, check_only?}`; `notice_ids` carries INGEST ids. The gates are
 *      `ingest:exportBatch` then `can_export:<profile>`. Reason codes are shown verbatim, never branched on, and the LOGIC spells
 *      no state name: states are the `stage` the status routes serve (config names the case). Only the sealed mock mirror
 *      `FIXTURE_PROFILES` spells them, because the producer serves them.
 *
 * RANGE IS BACK, behind `exportRange` (off unless `VITE_FEATURES` names it), built against saf's #364 (3a632cb3, OPEN):
 * `POST /ingest/export/notices` takes `{notice_ids}` XOR `{range:{from,to}}` (UTC days, inclusive, by RECEIPT time), and a
 * range `check_only` returns the RESOLVED `notice_ids` beside `unexportable`, so the check precedes the file (ruling 3).
 * The download never sends a range: it sends the cleared ids, since a range download would 422 on any unexportable notice
 * in it. No day limit and no cap is spelled here: the server refuses and the dialog shows its message.
 */

/** Route 2, declared at invincible-agent 6a4175a2 (#356). */
export const EXPORT_NOTICES_PATH = "/ingest/export/notices";
/** The capability the batch control is shown on. It is the key route 2's door is gated on (`can_invoke`), so the
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
  /** The content kinds the profile takes. null or absent = ANY kind. */
  accepts?: string[] | null;
  /** `per_notice | per_part` today, read verbatim. */
  grain?: string;
  version?: number;
  dedupe?: string[];
  /** The states (the `stage` the status routes serve) a notice must be in to be exported. Absent: never offered. */
  exportable_states?: string[];
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
      if (e.accepts === null) p.accepts = null;
      else if (Array.isArray(e.accepts) && e.accepts.every((k) => typeof k === "string" && k !== "")) p.accepts = e.accepts as string[];
      else return null;
    }
    if ("grain" in e) {
      if (typeof e.grain !== "string" || e.grain === "") return null;
      p.grain = e.grain;
    }
    if ("version" in e) {
      if (typeof e.version !== "number" || !Number.isInteger(e.version)) return null;
      p.version = e.version;
    }
    if ("dedupe" in e) {
      if (!Array.isArray(e.dedupe) || !e.dedupe.every((k) => typeof k === "string")) return null;
      p.dedupe = e.dedupe as string[];
    }
    if ("exportable_states" in e) {
      if (!Array.isArray(e.exportable_states) || !e.exportable_states.every((k) => typeof k === "string" && k !== "")) return null;
      p.exportable_states = e.exportable_states as string[];
    }
    out.push(p);
  }
  return out;
}

/** `label` is DISPLAY ONLY (the notice's own number, else `drop <12 hex>`, via `ingestLeadLine`): nothing keys on it, and
 *  `profilesFor` never reads it. The wire keeps carrying `ingestId`. */
export type ExportTarget = { ingestId: string; kind: string | null; state: string | null; label?: string };

/** The profiles, in served order, to offer for these targets. A profile is offered iff (1) it declares
 *  `exportable_states` (absent: cortex does not guess), (2) it accepts every KNOWN kind present (`accepts` null/absent
 *  takes any; an unknown kind does not block), and (3) at least one target is in an exportable state or has an unknown
 *  state (the server decides). No targets offers nothing. The logic spells no state name. */
export function profilesFor(profiles: ExportProfile[], targets: ExportTarget[]): ExportProfile[] {
  if (targets.length === 0) return [];
  return profiles.filter((p) => {
    const states = p.exportable_states;
    if (!Array.isArray(states)) return false;
    const accepts = p.accepts;
    if (Array.isArray(accepts) && !targets.every((t) => t.kind === null || accepts.includes(t.kind))) return false;
    return targets.some((t) => t.state === null || states.includes(t.state));
  });
}

export function profileLabel(p: ExportProfile): string {
  return typeof p.label === "string" && p.label !== "" ? p.label : p.name;
}

/** The served `capabilities` list (every key the caller holds `can_invoke` on) carries the batch key. A body without
 *  the list -- a BFF older than #290 -- is false: the control hides rather than offering a door that refuses. */
export function canExportBatch(entitlements: unknown): boolean {
  if (!isRecord(entitlements)) return false;
  const c = entitlements.capabilities;
  return Array.isArray(c) && c.includes(EXPORT_BATCH_CAPABILITY);
}

/** What names the notices: exactly one of the ingest ids or a UTC-day range. A union, so "both" and "neither" cannot be built. */
export type ExportRange = { from: string; to: string };
export type ExportSelector = { notice_ids: string[] } | { range: ExportRange };

/** The `POST EXPORT_NOTICES_PATH` body. `notice_ids` carries INGEST ids. Never `destination` (personal download, ruling 5). */
export function exportNoticesBody(profile: string, selector: ExportSelector, checkOnly: boolean): Record<string, unknown> {
  const sel = "range" in selector ? { range: { from: selector.range.from, to: selector.range.to } } : { notice_ids: selector.notice_ids };
  return { ...sel, profile, ...(checkOnly ? { check_only: true } : {}) };
}

export type Unexportable = { notice_id: string; reason: string; state: string | null };
/** `noticeIds` is present only on a RANGE check: the resolved set, which the dialog needs because the range names no id. */
export type ExportCheck = { profile: string; version: number; notices: number; unexportable: Unexportable[]; noticeIds?: string[] };

function readUnexportableList(v: unknown): Unexportable[] | null {
  if (!Array.isArray(v)) return null;
  const out: Unexportable[] = [];
  for (const u of v) {
    if (!isRecord(u)) return null;
    if (typeof u.notice_id !== "string" || u.notice_id === "") return null;
    if (typeof u.reason !== "string" || u.reason === "") return null;
    if ("state" in u && u.state !== undefined && typeof u.state !== "string") return null;
    out.push({ notice_id: u.notice_id, reason: u.reason, state: typeof u.state === "string" ? u.state : null });
  }
  return out;
}

/** The `check_only` 200, or null when ANY part is malformed. A range check (`range: true`) must carry `notice_ids`, the
 *  resolved set: without it the dialog could not name what to send. An ids check ignores one. An undeclared key is tolerated. */
export function readExportCheck(body: unknown, opts: { range?: boolean } = {}): ExportCheck | null {
  if (!isRecord(body)) return null;
  if (typeof body.profile !== "string" || body.profile === "") return null;
  if (typeof body.version !== "number" || !Number.isInteger(body.version)) return null;
  if (typeof body.notices !== "number" || !Number.isInteger(body.notices) || body.notices < 0) return null;
  const unexportable = readUnexportableList(body.unexportable);
  if (unexportable === null) return null;
  const out: ExportCheck = { profile: body.profile, version: body.version, notices: body.notices, unexportable };
  if (opts.range === true) {
    const ids = body.notice_ids;
    if (!Array.isArray(ids) || !ids.every((i) => typeof i === "string" && i !== "")) return null;
    out.noticeIds = ids as string[];
  }
  return out;
}

/** The unexportable list of a refused download (422 `detail.unexportable`), read by SHAPE, not by the error code. */
export function readUnexportableRefusal(err: unknown): Unexportable[] | null {
  const res = isRecord(err) && isRecord(err.response) ? err.response : null;
  const data = res && isRecord(res.data) ? res.data : null;
  const detail = data && isRecord(data.detail) ? data.detail : null;
  if (!detail) return null;
  return readUnexportableList(detail.unexportable);
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

/** The dialog's targets for a lasso selection: kind and state from the status rows (`rows[id]`), the kind falling back to
 *  the card's own ingest component; `label` is the notice's number (row, else card), else `drop <12 hex>`; an unknown state is null, a `stage` this client has no position for is kept verbatim. */
export function lassoTargets(
  artifacts: Artifact[],
  selection: string[],
  rows: Record<string, IngestStatusRow | undefined>,
): { targets: ExportTarget[]; notReady: { id: string; label: string }[]; others: number } {
  const { ingestIds, notReady, others } = selectionNotices(artifacts, selection);
  const byIngest = new Map<string, Artifact>();
  for (const a of artifacts) {
    const id = ingestComponentFrom(a)?.ingest_id;
    if (id && !byIngest.has(id)) byIngest.set(id, a);
  }
  const targets = ingestIds.map((id) => {
    const a = byIngest.get(id);
    const row = rows[id];
    const kind = row?.content_kind ?? (a ? ingestComponentFrom(a)?.content_kind : null) ?? null;
    const state = typeof row?.stage === "string" ? row.stage : null;
    const number = row?.notice_id ?? (a ? ingestComponentFrom(a)?.notice_id : null) ?? null;
    return { ingestId: id, kind: typeof kind === "string" ? kind : null, state, label: ingestLeadLine("", { notice_id: number, ingest_id: id }) };
  });
  return { targets, notReady, others };
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

/** A refusal's `detail.message`, verbatim (the range refusals state their cap there; cortex spells none). */
export function refusalMessage(err: unknown): string | null {
  const res = isRecord(err) && isRecord(err.response) ? err.response : null;
  const data = res && isRecord(res.data) ? res.data : null;
  const detail = data && isRecord(data.detail) ? data.detail : null;
  return detail && typeof detail.message === "string" && detail.message !== "" ? detail.message : null;
}

// -- The fixtures: served only when `reviewExportMock` is on -----------------------
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
/** A MIRROR of what `GET /ingest/export/profiles` serves at invincible-agent 8c3eb9af (#356 merge), for a viewer granted
 *  every profile: the base rows (`policy/exports/*.yaml`) plus the sample overlay (`policy/overlays/sample/exports/*.yaml`),
 *  sorted by name, filled as `export_profiles.py` fills them (`grain` from `_GRAIN_OF`, `accepts` null when absent,
 *  `dedupe` [] when absent, `exportable_states` defaulting to `DEFAULT_EXPORTABLE_STATES`).
 *  The stage names below are spelled because the producer serves them; they are sealed field for field by
 *  `reviewExportMockProfiles.producerSeal.test.ts` and are used ONLY when `reviewExportMock` is on, so the demo offers the
 *  real review button for a real stage. No code branches on them. */
export const FIXTURE_PROFILES: ExportProfile[] = [
  {
    name: "default-csv", format: "csv", granularity: "notice_part", label: "Default CSV, one row per notice part",
    accepts: null, grain: "per_part", dedupe: [], version: 1, exportable_states: ["promoted"],
  },
  {
    name: "default-json", format: "json", granularity: "notice_part", label: "Default JSON, one row per notice part, with provenance",
    accepts: null, grain: "per_part", dedupe: [], version: 1, exportable_states: ["promoted"],
  },
  {
    name: "part-list", format: "csv", granularity: "notice_part", label: "Part list, one row per part",
    accepts: null, grain: "per_part", dedupe: ["Part"], version: 1, exportable_states: ["promoted"],
  },
  {
    name: "part-list-reviewed", format: "csv", granularity: "notice_part", label: "Part list (reviewed)",
    accepts: null, grain: "per_part", dedupe: ["Part"], version: 1, exportable_states: ["review", "promoted"],
  },
];
export const FIXTURE_COLUMNS: Record<string, string[]> = {
  ...FIXTURE_154_COLUMNS,
  "part-list": ["Part"],
  "part-list-reviewed": ["Part"],
};

/** The SYNTHETIC `check_only` answer: nothing is unexportable. */
export function fixtureCheck(profile: string, ingestIds: string[]): ExportCheck {
  return { profile, version: 1, notices: ingestIds.length, unexportable: [] };
}

/** SYNTHETIC notices with a receipt day, for the mock's range form (the range is read against receipt time, #364). */
export const FIXTURE_RECEIVED: { ingestId: string; day: string }[] = [
  { ingestId: "synthetic-range-1", day: "2026-01-05" },
  { ingestId: "synthetic-range-2", day: "2026-01-06" },
  { ingestId: "synthetic-range-3", day: "2026-02-01" },
];

/** The SYNTHETIC range `check_only` answer: the fixture notices received in the (inclusive) range, nothing unexportable.
 *  YYYY-MM-DD compares as a string. */
export function fixtureCheckRange(profile: string, range: ExportRange): ExportCheck {
  const ids = FIXTURE_RECEIVED.filter((n) => n.day >= range.from && n.day <= range.to).map((n) => n.ingestId);
  return { profile, version: 1, notices: ids.length, unexportable: [], noticeIds: ids };
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
  scope: { ingestIds: string[] },
): { blob: Blob; filename: string } {
  const ids = scope.ingestIds;
  const key = `selection-${ids.length}`;
  const columns = FIXTURE_COLUMNS[profile.name] ?? [];
  const rows = ids.map((id) => syntheticRow(columns, id));
  const cell = (v: string): string => (/[",\r\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  const text =
    profile.format === "csv"
      ? [columns, ...rows.map((row) => columns.map((c) => row[c]!))].map((r) => r.map(cell).join(",") + "\r\n").join("")
      : JSON.stringify({ profile: profile.name, column_map_version: 1, granularity: profile.granularity, columns, rows });
  const type = profile.format === "csv" ? "text/csv" : "application/json";
  return { blob: new Blob([text], { type }), filename: `${key}.${profile.name}.${profile.format}` };
}
