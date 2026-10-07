/**
 * Fixtures for the DOORS export viewer (`src/lib/extractedTable.ts`,
 * `src/components/tables/ExtractedTableView.tsx`). INERT — these back the
 * viewer's own tests only, nothing served.
 *
 * The two HTML strings and the unstructured case are transcribed from
 * doc-tools (origin/main 7401e21) `tests/test_formatters.py`. Each is wrapped
 * in a positioned record using the keys `build_positioned_index` emits
 * (`doc_tools/utils/provenance.py` ~L75-84), in that order:
 * element_id, type, region, page_number, bbox, page_width, page_height,
 * text, text_as_html.
 *
 * element_id / page_number / bbox / page_width / page_height on every record
 * below are HAND-BUILT PLACEHOLDERS — doc-tools' formatter tests carry no
 * provenance, so there is nothing real to transcribe for those fields.
 */
import type { ExtractedTableRecord } from "@/lib/extractedTable";

// tests/test_formatters.py L21-24 (test_table_html_converts_to_markdown_grid_with_hybrid_output)
export const THEAD_TBODY_HTML =
  "<table><thead><tr><th>Part</th><th>Qty</th></tr></thead>" +
  "<tbody><tr><td>Bolt</td><td>4</td></tr></tbody></table>";

export const THEAD_TBODY_RECORD: ExtractedTableRecord = {
  element_id: "el_hand_0001",
  type: "Table",
  region: "table",
  page_number: 3,
  bbox: [10, 20, 400, 120],
  page_width: 612,
  page_height: 792,
  text: "Part Qty Bolt 4",
  text_as_html: THEAD_TBODY_HTML,
};

// tests/test_formatters.py L35 (test_table_object_metadata_supported) — bare <tr>, no thead/tbody
export const BARE_TR_HTML = "<table><tr><th>A</th></tr><tr><td>1</td></tr></table>";

export const BARE_TR_RECORD: ExtractedTableRecord = {
  element_id: "el_hand_0002",
  type: "Table",
  region: "table",
  page_number: 1,
  bbox: null,
  page_width: null,
  page_height: null,
  text: "A 1",
  text_as_html: BARE_TR_HTML,
};

// tests/test_formatters.py L42-45 (test_table_without_html_marks_structure_unavailable) —
// unstructured: text_as_html "" is what doc-tools' own markdown formatter marks
// "Structure unavailable" for, keeping the raw text. This record mirrors that input.
export const UNSTRUCTURED_RECORD: ExtractedTableRecord = {
  element_id: "el_hand_0003",
  type: "Table",
  region: "table",
  page_number: 2,
  bbox: null,
  page_width: null,
  page_height: null,
  text: "raw cells only",
  text_as_html: "",
};

// --- Hostile cases -------------------------------------------------------- //

export const HOSTILE_SCRIPT_IMG_HTML =
  "<table><tr><td><script>alert(1)</script>x</td><td><img src=x onerror=alert(1)>y</td></tr></table>";

export const HOSTILE_SCRIPT_IMG_RECORD: ExtractedTableRecord = {
  element_id: "el_hand_0004",
  type: "Table",
  region: "table",
  page_number: null,
  bbox: null,
  page_width: null,
  page_height: null,
  text: "x y",
  text_as_html: HOSTILE_SCRIPT_IMG_HTML,
};

export const HOSTILE_SPAN_HTML =
  '<table><tr><td colspan="999">a</td><td rowspan="-1">b</td></tr></table>';

export const HOSTILE_SPAN_RECORD: ExtractedTableRecord = {
  element_id: "el_hand_0005",
  type: "Table",
  region: "table",
  page_number: null,
  bbox: null,
  page_width: null,
  page_height: null,
  text: "a b",
  text_as_html: HOSTILE_SPAN_HTML,
};

export const NO_TABLE_HTML = "<div>no table</div>";

export const NO_TABLE_RECORD: ExtractedTableRecord = {
  element_id: "el_hand_0006",
  type: "Table",
  region: "table",
  page_number: null,
  bbox: null,
  page_width: null,
  page_height: null,
  text: "no table",
  text_as_html: NO_TABLE_HTML,
};
