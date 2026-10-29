/**
 * promotionReviewScaleFixture — the same 193 extraction shape as `promotionReviewFixture.ts`, at the
 * size that breaks a flat row table: 402 parts, two rows each. Dev mock (`ingestMock.ts`, for a drop
 * whose file name matches /scale/i) and tests only.
 *
 * The parts are built the way a real series notice reads: three long RUNS whose pairs differ only in
 * a counter, broken by 22 STRAGGLERS (a few of which split a run in two). Six rows carry the flags the
 * review has to surface: three the extractor doubts, two whose evidence is the enclosing table (px
 * units, like the prose rows of the small fixture), one with no box at all. Some sit inside runs, on
 * purpose: a flagged part stays in its run.
 *
 * Every part's `ltb_date` is `inherited_doc_level`, all citing the ONE sentence on page 1. Every
 * replacement row cites its own table line. Boxes are arithmetic from the same lines that draw the
 * PDF (`lineBox`), as in the small fixture. All names are invented.
 */
import type { Bbox } from "./bboxScale";
import { buildPdf, lineBox } from "./promotionReviewFixture";

type Line = Parameters<typeof lineBox>[0];

const PAGE = { width: 612, height: 792 } as const;
const PX_PER_PT = 150 / 72;
const LINE_PITCH = 14;
const TOP_Y = 700;
const BOTTOM_Y = 72;
const PER_PAGE = Math.floor((TOP_Y - BOTTOM_Y) / LINE_PITCH) + 1; // 45

export const SCALE_FIXTURE_NOTICE_ID = "PCN-SCALE-0402";
export const SCALE_FIXTURE_PART_COUNT = 402;
const LTB = "2027-03-31";
const LTB_SENTENCE = `Last time buy for every part listed: ${LTB}.`;

const pad = (n: number, w: number) => String(n).padStart(w, "0");

type Pair = [mpn: string, replacement: string];
const seq = (count: number, from: number, make: (n: number) => Pair): Pair[] =>
  Array.from({ length: count }, (_, i) => make(from + i));

// Run A: FK25 + 5-digit counter -> FK25 + the counter 364 later. Run B: HX111 -> HX1A1, 4-digit, Q both sides.
// Run C: FJ48 + 5-digit counter -> FJ48 + the counter + 400.
const A = (count: number, from: number) => seq(count, from, (n) => [`FK25${pad(n, 5)}`, `FK25${pad(n + 364, 5)}`]);
const B = (count: number, from: number) => seq(count, from, (n) => [`HX111${pad(n, 4)}Q`, `HX1A1${pad(n, 4)}Q`]);
const C = (count: number, from: number) => seq(count, from, (n) => [`FJ48${pad(n, 5)}`, `FJ48${pad(n + 400, 5)}`]);

/** 22 stragglers, every one with a shape of its own so no two neighbours could pass for a run. */
const STRAGGLERS: Pair[] = [
  ["FKA000028Q", "HX3AA0006Q"],
  ["BYV34-400", "BYV34-400X"],
  ["BYV34-500", "BYV34-500X"],
  ["MMBZ5231B", "MMBZ5231BW"],
  ["1N4148", "1N4148W"],
  ["BAT54-S", "BAT54-SH"],
  ["ZX84C5V1", "ZX84C5V1-7"],
  ["FK25X0037", "FK25X0401"],
  ["HX11-0042", "HX1A-0042Q"],
  ["FJ48A0001", "FJ48A0401"],
  ["SD103A", "SD103AW-7"],
  ["PMEG3010", "PMEG3010EP"],
  ["BZX55C4V7", "BZX55C4V7-TR"],
  ["RB521S", "RB521S-30"],
  ["TLV431A", "TLV431AIDBZR"],
  ["LM317T", "LM317MDT"],
  ["UF4007", "UF4007-E3"],
  ["SS14", "SS14HE3"],
  ["MBR0520", "MBR0520LT1"],
  ["DF10M", "DF10S"],
  ["GBU4J", "GBU4JL"],
  ["KBP206", "KBP206G"],
];

function buildPairs(): Pair[] {
  const out: Pair[] = [];
  let s = 0;
  const strag = (n: number) => {
    for (let i = 0; i < n; i++) out.push(STRAGGLERS[s++]);
  };
  // Run A, 150: pieces 40 | 25 | 25 | 30 | 30, counters continuing across the splits.
  strag(2);
  out.push(...A(40, 37));
  strag(1);
  out.push(...A(25, 77));
  strag(2);
  out.push(...A(25, 102));
  strag(1);
  out.push(...A(30, 127));
  strag(1);
  out.push(...A(30, 157));
  // Run B, 120: 30 | 25 | 25 | 20 | 20.
  strag(1);
  out.push(...B(30, 1));
  strag(1);
  out.push(...B(25, 31));
  strag(1);
  out.push(...B(25, 56));
  strag(1);
  out.push(...B(20, 81));
  strag(1);
  out.push(...B(20, 101));
  // Run C, 110: 30 | 20 | 20 | 20 | 20.
  strag(3);
  out.push(...C(30, 500));
  strag(1);
  out.push(...C(20, 530));
  strag(1);
  out.push(...C(20, 550));
  strag(1);
  out.push(...C(20, 570));
  strag(1);
  out.push(...C(20, 590));
  strag(STRAGGLERS.length - s);
  return out;
}

const PAIRS = buildPairs();

// Flags baked in, by part position (all replacement rows).
const NEEDS_REVIEW = new Map<number, string>([
  [20, "two candidates in the cell"], // inside run A
  [210, "two candidates in the cell"], // inside run B
  [300, "replacement cell is split across a page break"], // inside run C
]);
const REGION = new Set([60, 250]); // enclosing-table evidence: one in run A, one in run B
const NO_BOX = 330; // inside run C

interface Placed {
  pair: Pair;
  page: number;
  line: Line;
}

const placed: Placed[] = PAIRS.map((pair, i) => ({
  pair,
  page: 2 + Math.floor(i / PER_PAGE),
  line: { text: `${pair[0].padEnd(16)}${pair[1]}`, x: 72, y: TOP_Y - LINE_PITCH * (i % PER_PAGE) },
}));

const PAGE_COUNT = 1 + Math.ceil(PAIRS.length / PER_PAGE);

const SENTENCE_LINE: Line = { text: LTB_SENTENCE, x: 72, y: 600 };

function pagesOfLines(): Line[][] {
  const pages: Line[][] = [
    [
      { text: "PRODUCT CHANGE NOTICE", x: 72, y: 720, size: 14 },
      { text: `Notice: ${SCALE_FIXTURE_NOTICE_ID}`, x: 72, y: 690 },
      { text: "Date: 2026-09-30", x: 72, y: 676 },
      { text: "Issued by: Example Discretes Ltd (fixture)", x: 72, y: 662 },
      SENTENCE_LINE,
    ],
  ];
  for (let p = 2; p <= PAGE_COUNT; p++) {
    pages.push([
      { text: `${"Affected part".padEnd(16)}Replacement`, x: 72, y: 720, size: 10 },
      ...placed.filter((x) => x.page === p).map((x) => x.line),
    ]);
  }
  return pages;
}

const PAGES = pagesOfLines();

/** The box enclosing every line of a table page, in points: what a layout "region" row cites. */
function tableBox(page: number): Bbox {
  const boxes = PAGES[page - 1].map(lineBox);
  return [
    Math.min(...boxes.map((b) => b[0])),
    Math.min(...boxes.map((b) => b[1])),
    Math.max(...boxes.map((b) => b[2])),
    Math.max(...boxes.map((b) => b[3])),
  ];
}

let pdfBytes: Uint8Array | null = null;

/** A FRESH copy every call: pdf.js transfers the buffer to its worker, which detaches it. */
export function scaleFixturePdfBytes(): ArrayBuffer {
  pdfBytes ??= buildPdf(PAGES);
  return pdfBytes.slice().buffer;
}

export const SCALE_FIXTURE_PAGE_COUNT = PAGES.length;

const ptDims = { width: PAGE.width, height: PAGE.height };
const pxDims = { width: PAGE.width * PX_PER_PT, height: PAGE.height * PX_PER_PT };

/** `GET /ingest/{id}/extraction`'s body for the scale notice: 402 parts, an `ltb_date` row and a `replacement_mpn` row each. */
export function scaleFixtureExtractionBody(ingestId: string): Record<string, unknown> {
  const sentenceBox = lineBox(SENTENCE_LINE);
  const rows: Record<string, unknown>[] = [];
  placed.forEach((x, i) => {
    const [mpn, replacement] = x.pair;
    rows.push({
      row_index: rows.length,
      part_index: i,
      mpn,
      field: "ltb_date",
      extracted_value: LTB,
      obtained_via: "inherited_doc_level",
      match_confidence: 0.9,
      needs_review: false,
      review_reason: null,
      source_snippet: LTB_SENTENCE,
      evidence_ref: { page: 1, bbox: sentenceBox, bboxes: [sentenceBox], page_dims: ptDims, units: "pt" },
    });
    const region = REGION.has(i);
    const cell = lineBox(x.line);
    const k = region ? PX_PER_PT : 1;
    const box = region ? tableBox(x.page).map((v) => v * k) : cell;
    rows.push({
      row_index: rows.length,
      part_index: i,
      mpn,
      field: "replacement_mpn",
      extracted_value: replacement,
      obtained_via: region ? "region_preferred" : "text_layer_cell",
      match_confidence: region ? 0.82 : 1,
      needs_review: NEEDS_REVIEW.has(i),
      review_reason: NEEDS_REVIEW.get(i) ?? null,
      source_snippet: x.line.text,
      evidence_ref:
        i === NO_BOX
          ? { page: x.page, bbox: null, page_dims: ptDims, units: "pt" }
          : { page: x.page, bbox: box, bboxes: [box], page_dims: region ? pxDims : ptDims, units: region ? "px" : "pt" },
    });
  });
  return {
    ingest_id: ingestId,
    notice_id: SCALE_FIXTURE_NOTICE_ID,
    content_kind: "pdf",
    attempt: 1,
    notice: { mfr: "Example Discretes Ltd", mfr_parent: null, notice_date: "2026-09-30" },
    part_count: SCALE_FIXTURE_PART_COUNT,
    rows,
    rows_without_evidence: 0,
    review_ref: null,
  };
}

/** A 193 task payload's header for the same notice. `dropped_by` is the mock's caller to set. */
export function scaleFixturePromotionPayload(ingestId: string): Record<string, unknown> {
  return {
    ingest_id: ingestId,
    notice_id: SCALE_FIXTURE_NOTICE_ID,
    mfr: "Example Discretes Ltd",
    notice_date: "2026-09-30",
    part_count: SCALE_FIXTURE_PART_COUNT,
    attempt: 1,
  };
}
