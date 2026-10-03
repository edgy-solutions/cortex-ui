/**
 * ILLUSTRATION — cortex-proposed; no producer route serves this yet.
 *
 * Measured against `invincible-agent` origin/master `29c80057`:
 *   - The IPD fixture `tests/fixtures/s1000d_sandbox_rtx/DMC-SANDBOXRTX-C-95-40-00-00A-941A-
 *     A_000-01_EN-US.XML` carries only `catalogSeqNumber`'s `figureNumber`/`item`/`indenture`
 *     and `partRef`'s `manufacturerCodeValue`/`partNumberValue` — no `hotspot` and no `icn`
 *     field anywhere upstream.
 *   - `GET /artifacts/{id}` returns JSON (`ArtifactResponse`), not bytes. No route today serves
 *     ICN (S1000D infoEntityIdent) content at all.
 *
 * So EVERYTHING in this file — the parts-row shape, the payload shape, the bytes route this
 * card fetches from, and every fixture — is cortex-proposed and HAND-BUILT, not a mirror of a
 * served wire. There is no capture to load. The day a producer serves this, this file is the
 * one place that gets corrected to match it.
 */

/** The parts row that pointed here. Every field optional — a partial match upstream still
 *  names a part worth showing, never "unknown". */
export interface IllustrationPart {
  part_number?: string | null;
  manufacturer_code?: string | null;
  item?: string | null;
  figure_number?: string | null;
}

export interface IllustrationPayload {
  /** S1000D infoEntityIdent, e.g. "ICN-SANDBOXRTX-A-954000-A-00001-A-001-01". */
  icn: string;
  /** Only "image/svg+xml" is drawn — anything else is `undrawable`, absent is `media-unknown`. */
  media_type?: string | null;
  /** GATEWAY-RELATIVE path serving the bytes, fetched via the minted `api` wrapper
   *  (`fetchIllustrationContent`). Never handed to axios as an absolute URL — see
   *  `src/lib/illustrationPath.ts`. */
  content_path?: string | null;
  title?: string | null;
  /** The parts row's hotspot — the SVG element id (S1000D applicationStructureIdent) to
   *  highlight, matched EXACTLY against `getAttribute("id")`. */
  hotspot_id?: string | null;
  part?: IllustrationPart | null;
}

export const ILLUSTRATION_CONTRACT = {
  archetype: "ILLUSTRATION",
  component: "Illustration",
  // No row space, grid-cell constraint or chart x-axis argument applies here — a viewer card,
  // same shape of non-applicability as WORKFLOW_CASE's own comment on this field. "full-width"
  // for the same practical reason: a drawn illustration wants the row on a narrow viewport.
  layout: "full-width",
  // FALSE: re-fetching the same icn's bytes would return the same server-side content, not a
  // function of this card's own moving state (the hotspot highlight is computed client-side
  // over whatever was already fetched).
  recomputes: false,
  fields: {
    illustration: { encoding: "object", parsesTo: "object", required: true },
  },
} as const;

export type IllustrationContract = typeof ILLUSTRATION_CONTRACT;
