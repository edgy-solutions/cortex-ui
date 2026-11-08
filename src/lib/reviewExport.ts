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
export type ExportProfile = { name: string; format: string; granularity: string; label?: string };

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
    out.push(p);
  }
  return out;
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
/** The `GET /me/entitlements` body `reviewExportMock` stands in: the fields `canExportBatch` reads, as served. */
export const FIXTURE_ENTITLEMENTS = { capabilities: [EXPORT_BATCH_CAPABILITY] };

/** One SYNTHETIC row for `columns`: every cell is plainly marked, none is a real notice's. */
function syntheticRow(columns: string[], key: string): Record<string, string> {
  const row: Record<string, string> = {};
  for (const col of columns) row[col] = col === "Ingest" ? key : `synthetic ${col}`;
  return row;
}

/** Shaped like the producer's `to_csv` (CRLF, header then rows) and `to_json` ({profile, column_map_version,
 *  granularity, columns, rows}), with ONE synthetic row. A profile the fixture does not know gets no columns. */
export function fixtureExportBody(
  profile: ExportProfile,
  scope: { ingestId: string } | { from: string; to: string },
): { blob: Blob; filename: string } {
  const key = "ingestId" in scope ? scope.ingestId : `${scope.from}_${scope.to}`;
  const columns = FIXTURE_154_COLUMNS[profile.name] ?? [];
  const row = syntheticRow(columns, key);
  const cell = (v: string): string => (/[",\r\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  const text =
    profile.format === "csv"
      ? [columns, columns.map((c) => row[c]!)].map((r) => r.map(cell).join(",") + "\r\n").join("")
      : JSON.stringify({ profile: profile.name, column_map_version: 1, granularity: profile.granularity, columns, rows: [row] });
  const type = profile.format === "csv" ? "text/csv" : "application/json";
  return { blob: new Blob([text], { type }), filename: `${key}.${profile.name}.${profile.format}` };
}
