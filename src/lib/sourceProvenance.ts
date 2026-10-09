/**
 * sourceProvenance — the per-source notice-parts extras, keyed by source uri.
 *
 * The gateway's _project_sources keeps ("matched_for","provenance","obtained_via","ingest_id",
 * "dropped_by","promoted_by") beyond the base Source fields. `mpn` is NOT in that list, so it MAY
 * BE ABSENT; it is never derived from the label here.
 */
import type { ProvenanceFloor } from "@/lib/ingestWire";

export interface SourceProvenanceEntry {
  mpn: string | null;
  obtained_via: string | null;
  ingest_id: string | null;
  dropped_by: string | null;
  promoted_by: string | null;
}

export interface SourcesProvenance {
  floor: ProvenanceFloor | null;
  by_uri: Record<string, SourceProvenanceEntry>;
}

const KEYS = ["mpn", "obtained_via", "ingest_id", "dropped_by", "promoted_by"] as const;

function str(v: unknown): string | null {
  return typeof v === "string" && v.length > 0 ? v : null;
}

export function readSourcesProvenance(
  sources: unknown,
  floor: ProvenanceFloor | null,
): SourcesProvenance | null {
  const by_uri: Record<string, SourceProvenanceEntry> = {};
  if (Array.isArray(sources)) {
    for (const s of sources) {
      if (typeof s !== "object" || s === null) continue;
      const rec = s as Record<string, unknown>;
      if (typeof rec.uri !== "string") continue;
      if (!KEYS.some((k) => k in rec)) continue;
      by_uri[rec.uri] = {
        mpn: str(rec.mpn),
        obtained_via: str(rec.obtained_via),
        ingest_id: str(rec.ingest_id),
        dropped_by: str(rec.dropped_by),
        promoted_by: str(rec.promoted_by),
      };
    }
  }
  if (floor === null && Object.keys(by_uri).length === 0) return null;
  return { floor, by_uri };
}
