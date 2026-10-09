/**
 * Notice-parts `sources` SSE bodies for PCN26-182 on rev 180.
 *
 * DERIVED from invincible-agent cf4a456d source (ontology_service/notice_parts.py `_source()`,
 * gateway.py `_project_sources`) and the values in tests/test_notice_parts_provenance.py. NOT a
 * wire capture. The dispatch said the capture is in Lane 1's roll-22 report; no such report was on
 * any ref at 2026-10-08 19:15 CDT. When a capture lands, seal on it and retire this.
 *
 * The projection keeps only the extras (matched_for, provenance, obtained_via, ingest_id,
 * dropped_by, promoted_by), so the wire body has NO `mpn` and NO `notice_id`.
 */
export const NOTICE_ID = "PCN26-182";
export const INGEST_ID = "sha256:2a65ca553a868db5ab8110c154d61b15896bbffbba1b51660509a90bf266db00";
export const DROPPED_BY = "alice@example.com";
export const PROMOTED_BY = "human:bob@example.com";
export const PARTS = ["5530-182", "5530-183"] as const;

const BLOCK = {
  obtained_via: "user-drop",
  ingest_id: INGEST_ID,
  ingest_run: `user-drop:${INGEST_ID}`,
  standing: "supervised",
  authoritative_source: "unconfirmed-at-intake",
  as_of: "unknown",
  ingested_at: "2026-10-08T21:41:51Z",
  derived_from: "",
};

function rawSource(mpn: string, promoted_by: string | null) {
  return {
    type: "graph" as const,
    label: `P/N ${mpn}`,
    uri: "http://internal/components/" + encodeURIComponent(mpn),
    snippet: `${mpn} is subject to ${NOTICE_ID}`,
    notice_id: NOTICE_ID,
    mpn,
    obtained_via: BLOCK.obtained_via,
    ingest_id: BLOCK.ingest_id,
    dropped_by: DROPPED_BY,
    promoted_by,
    provenance: { ...BLOCK },
  };
}

function projected(promoted_by: string | null) {
  return PARTS.map((mpn) => {
    const { mpn: _mpn, notice_id: _n, ...wire } = rawSource(mpn, promoted_by);
    return wire;
  });
}

/** Promoted: floor carries no ingest ids. */
export const NOTICE_PARTS_SOURCES_EVENT = {
  sources: projected(PROMOTED_BY),
  provenance_floor: { obtained_via: "user-drop", ingest_ids: [] as string[], unidentified: 0 },
};

/** Control: not promoted — the floor names the ingest id. */
export const NOTICE_PARTS_SOURCES_EVENT_UNPROMOTED = {
  sources: projected(null),
  provenance_floor: { obtained_via: "user-drop", ingest_ids: [INGEST_ID], unidentified: 0 },
};

/** The same sources as `_source()` builds them, before projection (mpn + notice_id present). */
export const NOTICE_PARTS_RAW_SOURCES_WITH_MPN = PARTS.map((m) => rawSource(m, PROMOTED_BY));
