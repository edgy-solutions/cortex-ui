/**
 * promotionReviewFixture — an `/ingest/{id}/extraction` body in Lane 1's 193 shape (`promotionReview.ts`) and
 * the PDF it was extracted from, built together so every `evidence_ref` lands on the text it
 * names. Dev mock (`ingestMock.ts`) and tests only; the card is built against it until Lane 1
 * serves the routes (193).
 *
 * THE PDF IS GENERATED, NOT CHECKED IN. A hand-built PDF 1.4 with one standard font (Courier,
 * which needs no embedding), so the bytes are a few hundred lines of plain text and the boxes are
 * ARITHMETIC: Courier's advance is 600/1000 em for every glyph, its ascender 629 and descender
 * −157 (the AFM's own numbers). Each row's box is computed from the same (x, y, size, text) that
 * draws it, so an outline that misses its text is a defect in the card, not in the fixture.
 *
 * The notice id is the one the architect saw on 192 (`EOL-36_BYV34-400,-BYV34-500`); the rest is
 * invented — the manufacturer especially, which names no real company.
 */
import type { Bbox } from "./bboxScale";

const PAGE = { width: 612, height: 792 } as const; // US Letter, in PDF points
const SIZE = 10;

interface Line {
  text: string;
  x: number;
  /** Baseline, PDF space (bottom-left origin). */
  y: number;
  size?: number;
}

/** The line's box in TOP-LEFT origin page units, padded 3pt: what an `evidence_ref.bbox` holds. */
export function lineBox(l: Line): Bbox {
  const s = l.size ?? SIZE;
  const pad = 3;
  return [
    l.x - pad,
    PAGE.height - (l.y + 0.629 * s) - pad,
    l.x + 0.6 * s * l.text.length + pad,
    PAGE.height - (l.y - 0.157 * s) + pad,
  ];
}

const esc = (s: string) => s.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");

/** A minimal, valid PDF 1.4: one Courier text run per line, xref offsets computed. */
export function buildPdf(pages: Line[][]): Uint8Array {
  const objs: string[] = [];
  const pageIds: number[] = [];
  // 1 catalog, 2 pages, 3 font; then a (page, contents) pair per page.
  objs[1] = `<< /Type /Catalog /Pages 2 0 R >>`;
  objs[3] = `<< /Type /Font /Subtype /Type1 /BaseFont /Courier >>`;
  pages.forEach((lines, i) => {
    const pageId = 4 + i * 2;
    const contentId = pageId + 1;
    pageIds.push(pageId);
    const stream = lines
      .map((l) => `BT /F1 ${l.size ?? SIZE} Tf ${l.x} ${l.y} Td (${esc(l.text)}) Tj ET`)
      .join("\n");
    objs[pageId] =
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE.width} ${PAGE.height}] ` +
      `/Resources << /Font << /F1 3 0 R >> >> /Contents ${contentId} 0 R >>`;
    objs[contentId] = `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`;
  });
  objs[2] = `<< /Type /Pages /Kids [${pageIds.map((p) => `${p} 0 R`).join(" ")}] /Count ${pages.length} >>`;

  let out = "%PDF-1.4\n";
  const offsets: number[] = [];
  for (let id = 1; id < objs.length; id++) {
    offsets[id] = out.length;
    out += `${id} 0 obj\n${objs[id]}\nendobj\n`;
  }
  const xref = out.length;
  out += `xref\n0 ${objs.length}\n0000000000 65535 f \n`;
  for (let id = 1; id < objs.length; id++) out += `${String(offsets[id]).padStart(10, "0")} 00000 n \n`;
  out += `trailer\n<< /Size ${objs.length} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Uint8Array.from(out, (c) => c.charCodeAt(0)); // ASCII only, so one char is one byte
}

const NOTICE_ID = "EOL-36_BYV34-400,-BYV34-500";

/**
 * A layout raster's resolution, for the rows measured in `px`. Lane 1: `units` is `pt` when
 * `obtained_via` is `text_layer_cell`, and layout `px` otherwise, with `page_dims` in the same
 * units. So the prose rows here carry 150-dpi pixels, and only a card that scales by `page_dims`
 * puts their outline on their text.
 */
const PX_PER_PT = 150 / 72;

interface FixtureRow {
  row_index: number;
  part_index: number;
  mpn: string;
  field: string;
  extracted_value: string;
  obtained_via: string;
  units: "pt" | "px";
  page: number;
  line: Line;
}

const PARTS = ["BYV34-400", "BYV34-500"];
let next = 0;
const row = (part: number, field: string, label: string, value: string, page: number, y: number, prose = false): FixtureRow => ({
  row_index: next++,
  part_index: part,
  mpn: PARTS[part],
  field,
  extracted_value: value,
  // Both are doc-tools match_methods (7f, 2026-10-17): the cell, and the enclosing table box (px).
  obtained_via: prose ? "region_preferred" : "text_layer_cell",
  units: prose ? "px" : "pt",
  page,
  line: { text: `${PARTS[part].padEnd(12)}${label.padEnd(26)}${value}`, x: 72, y },
});

// `ltb_date` is a field Lane 1 named; `lts_date` follows its pattern and is invented.
const ROWS: FixtureRow[] = [
  row(0, "ltb_date", "Last time buy", "2027-03-31", 1, 520),
  row(0, "lts_date", "Last time ship", "2027-09-30", 1, 504),
  row(1, "ltb_date", "Last time buy", "2027-03-31", 1, 488),
  row(1, "lts_date", "Last time ship", "2027-09-30", 1, 472),
  row(0, "replacement_mpn", "Recommended replacement", "BYV34-400X", 2, 640, true),
  row(1, "replacement_mpn", "Recommended replacement", "BYV34-500X", 2, 590, true),
];

const PAGES: Line[][] = [
  [
    { text: "PRODUCT DISCONTINUANCE NOTICE", x: 72, y: 720, size: 14 },
    { text: `Notice: ${NOTICE_ID}`, x: 72, y: 690 },
    { text: "Date: 2026-09-30", x: 72, y: 676 },
    { text: "Issued by: Example Discretes Ltd (fixture)", x: 72, y: 662 },
    { text: "The parts below are discontinued. Last orders and shipments:", x: 72, y: 600 },
    { text: `${"Part".padEnd(12)}${"Event".padEnd(26)}Date`, x: 72, y: 540 },
    ...ROWS.filter((r) => r.page === 1).map((r) => r.line),
  ],
  [
    { text: "Replacements", x: 72, y: 720, size: 14 },
    { text: "Customers are advised to qualify the following parts.", x: 72, y: 690 },
    { text: "Footprint and ratings are unchanged.", x: 72, y: 676 },
    ...ROWS.filter((r) => r.page === 2).map((r) => r.line),
    { text: "Contact your sales office for samples.", x: 72, y: 540 },
  ],
];

let pdfBytes: Uint8Array | null = null;

/** A FRESH copy every call: pdf.js transfers the buffer to its worker, which detaches it. */
export function fixturePdfBytes(): ArrayBuffer {
  pdfBytes ??= buildPdf(PAGES);
  return pdfBytes.slice().buffer;
}

export const FIXTURE_PAGE_COUNT = PAGES.length;
export const FIXTURE_NOTICE_ID = NOTICE_ID;

function evidenceRef(r: FixtureRow) {
  const k = r.units === "px" ? PX_PER_PT : 1;
  const bbox = lineBox(r.line).map((v) => v * k);
  return { page: r.page, bbox, bboxes: [bbox], page_dims: { width: PAGE.width * k, height: PAGE.height * k }, units: r.units };
}

/** `GET /ingest/{id}/extraction`'s body, in Lane 1's 193 shape. Every row carries evidence. */
export function fixtureExtractionBody(ingestId: string): Record<string, unknown> {
  return {
    ingest_id: ingestId,
    notice_id: NOTICE_ID,
    content_kind: "pdf",
    attempt: 1,
    notice: { mfr: "Example Discretes Ltd", mfr_parent: null, notice_date: "2026-09-30" },
    part_count: PARTS.length,
    rows: ROWS.map((r) => ({
      row_index: r.row_index,
      part_index: r.part_index,
      mpn: r.mpn,
      field: r.field,
      extracted_value: r.extracted_value,
      obtained_via: r.obtained_via,
      match_confidence: r.obtained_via === "text_layer_cell" ? 1 : 0.82,
      needs_review: false,
      review_reason: null,
      source_snippet: r.line.text,
      evidence_ref: evidenceRef(r),
    })),
    rows_without_evidence: 0,
    review_ref: null,
  };
}

/** A 193 task payload's header for the same notice. `dropped_by` is the mock's caller to set. */
export function fixturePromotionPayload(ingestId: string): Record<string, unknown> {
  return {
    ingest_id: ingestId,
    notice_id: NOTICE_ID,
    mfr: "Example Discretes Ltd",
    notice_date: "2026-09-30",
    part_count: PARTS.length,
    attempt: 1,
  };
}
