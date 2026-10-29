/**
 * reviewExport -- export on the completed review card, and the AP-group batch export.
 *
 * Packet: invincible-agent `sessions/2026-10-28-packet-to-lane-01-from-cortex-review-export-what-cortex-needs-on-the-wire.md`.
 *
 * PROPOSED: every route and field here is cortex's proposal, undeclared by the producer.
 * Rename here when Lane 1 declares them. The wire names are spelled ONCE, in this module:
 *   1. PROPOSED `GET /ingest/export/profiles`                      -> bare array of ExportProfile
 *   2. PROPOSED `GET /ingest/{ingest_id}/export?profile=<name>`    -> file bytes + Content-Disposition
 *   3. PROPOSED `GET /ingest/export?profile=&from=&to=`            -> batch file, same headers
 *   4. PROPOSED `groups: string[]` on `GET /me/entitlements`       -> batch control membership
 * The profile keys follow lane 01's `policy/exports/` header (invincible-agent
 * `sessions/2026-10-28-packet-to-fin-policy-exports-header-is-granularity-not-scope.md`):
 * `{name, format, granularity, label}`, granularity `notice_part | notice`. It was `scope: row | notice`
 * in cortex's proposal; 7f §2 records `scope` as a three-way collision, so lane 01 renamed it.
 * Routes 1-3 and the profile keys are DECLARED at lane 01's #154 (`lane/01-review-export` @ a14e21b5,
 * preview, unmerged -- not at our pin). A refusal there is FastAPI's `HTTPException(detail={error, ...})`,
 * so the code is `detail.error` (`ingest_not_promoted`, `not_entitled_to_export_batch`,
 * `export_profile_unknown`, ...). The file routes fetch as a Blob, so the client re-reads a refusal
 * body as JSON before `refusalCode` sees it (`jsonRefusalBody`).
 *
 * The gate is `stage === "promoted"` on `GET /ingest/{id}/status` (a REAL, declared route).
 */

/** PROPOSED route 1. */
export const EXPORT_PROFILES_PATH = "/ingest/export/profiles";
/** PROPOSED route 2. */
export const exportOnePath = (ingestId: string): string => `/ingest/${encodeURIComponent(ingestId)}/export`;
/** PROPOSED route 3. */
export const EXPORT_BATCH_PATH = "/ingest/export";
/** PROPOSED: the `groups` entry that shows the batch control. */
export const AP_GROUP = "alert-processors";

export type ExportProfile = { name: string; format: "csv" | "json"; granularity: "notice_part" | "notice"; label?: string };

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
    if (e.format !== "csv" && e.format !== "json") return null;
    if (e.granularity !== "notice_part" && e.granularity !== "notice") return null;
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

export function canExportBatch(entitlements: unknown): boolean {
  if (!isRecord(entitlements)) return false;
  const g = entitlements.groups;
  return Array.isArray(g) && g.includes(AP_GROUP);
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
export const PROPOSED_FIXTURE_PROFILES: ExportProfile[] = [
  { name: "synthetic-rows-csv", format: "csv", granularity: "notice_part", label: "Rows (CSV, synthetic)" },
  { name: "synthetic-notice-json", format: "json", granularity: "notice" },
  { name: "synthetic-rows-json", format: "json", granularity: "notice_part", label: "Rows (JSON, synthetic)" },
];
export const PROPOSED_FIXTURE_GROUPS: string[] = [AP_GROUP];

export function fixtureExportBody(
  profile: ExportProfile,
  scope: { ingestId: string } | { from: string; to: string },
): { blob: Blob; filename: string } {
  const key = "ingestId" in scope ? scope.ingestId : `${scope.from}_${scope.to}`;
  const text =
    profile.format === "csv"
      ? `key,profile,granularity\n${key},${profile.name},${profile.granularity}\n`
      : JSON.stringify({ key, profile: profile.name, granularity: profile.granularity, synthetic: true });
  const type = profile.format === "csv" ? "text/csv" : "application/json";
  return { blob: new Blob([text], { type }), filename: `${key}.${profile.name}.${profile.format}` };
}
