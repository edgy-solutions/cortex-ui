/**
 * The ruled evidence_ref (architect 10-21): `{page, bbox, note?}` with the bbox in PAGE FRACTIONS.
 *
 *   Crop coordinates: page fractions. [x0, y0, x1, y1] in 0..1, origin top-left, plus page.
 *   Producers convert layout pixels and word-layer points before writing.
 */
import type { Bbox, PageDims } from "./bboxScale";

/** With page fractions the page's own size is 1x1, so the sealed rule `scaleBox(bbox, FRACTION_PAGE, drawn)`
 *  places the box. There is no second scaling rule. */
export const FRACTION_PAGE: PageDims = { width: 1, height: 1 };

/**
 * Exactly 4 finite numbers with 0 <= x0 < x1 <= 1 and 0 <= y0 < y1 <= 1. A box with no area or turned
 * inside out outlines nothing; a value over 1 is an unconverted pixel or point box (a producer bug), and
 * drawing it would put the outline off the page.
 */
export function isFractionBox(b: unknown): b is Bbox {
  if (!Array.isArray(b) || b.length !== 4) return false;
  if (!b.every((n) => typeof n === "number" && Number.isFinite(n))) return false;
  const [x0, y0, x1, y1] = b as number[];
  return x0 >= 0 && x0 < x1 && x1 <= 1 && y0 >= 0 && y0 < y1 && y1 <= 1;
}

export interface FractionEvidenceRef {
  page: number;
  bbox: Bbox;
  note?: string;
}

/** Strict reader: keys only page / bbox / note; page an integer >= 1; bbox page fractions; a present note non-blank. */
export function readFractionEvidenceRef(v: unknown): FractionEvidenceRef | undefined {
  if (typeof v !== "object" || v === null || Array.isArray(v)) return undefined;
  const o = v as Record<string, unknown>;
  for (const k of Object.keys(o)) if (k !== "page" && k !== "bbox" && k !== "note") return undefined;
  if (typeof o.page !== "number" || !Number.isInteger(o.page) || o.page < 1) return undefined;
  if (!isFractionBox(o.bbox)) return undefined;
  if ("note" in o) {
    if (typeof o.note !== "string" || o.note.trim() === "") return undefined;
    return { page: o.page, bbox: o.bbox, note: o.note };
  }
  return { page: o.page, bbox: o.bbox };
}
