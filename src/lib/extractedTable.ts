/**
 * The DOORS export viewer's extracted-table shape and pure HTML-table parser.
 *
 * INERT. No route, no fetch, no archetype id reads this file outside its own
 * tests and `src/components/tables/*`. Mirrors doc-tools' positioned-index
 * record — doc_tools/utils/provenance.py `build_positioned_index` (~L61-86,
 * origin/main 7401e21) — which is the concrete extracted-table shape until
 * Lane 1 ships `identity.document_identity` and a served envelope.
 *
 * No raw-HTML DOM write of any kind. `parseTableHtml` turns markup into a
 * plain data grid (`TableGrid`); nothing downstream of it ever touches raw
 * HTML again. (Seal 7 scans this file's text for the forbidden APIs by name —
 * so this comment deliberately does not spell them, to keep that scan honest.)
 */

/** One record per unstructured element. `region === "table"` is the only kind this file reads. */
export interface ExtractedTableRecord {
  element_id: string;
  type: string;
  region: "table" | "narrative";
  page_number: number | null;
  bbox: [number, number, number, number] | null;
  page_width: number | null;
  page_height: number | null;
  text: string;
  text_as_html: string;
}

export interface Cell {
  text: string;
  header: boolean;
  colSpan: number;
  rowSpan: number;
}

export interface TableGrid {
  head: Cell[][];
  body: Cell[][];
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** Absent/non-numeric optional numbers become null — never 0, never a coerced NaN. */
function numberOrNull(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

function bboxOrNull(v: unknown): [number, number, number, number] | null {
  if (!Array.isArray(v) || v.length !== 4) return null;
  const nums = v.map((n) => (typeof n === "number" && Number.isFinite(n) ? n : null));
  if (nums.some((n) => n === null)) return null;
  return nums as [number, number, number, number];
}

/**
 * Refuses a non-object, a missing element_id, and anything whose region is
 * not "table" (this file never reads a narrative record).
 */
export function readExtractedTable(raw: unknown): ExtractedTableRecord | null {
  if (!isPlainObject(raw)) return null;
  const elementId = raw.element_id;
  if (typeof elementId !== "string" || elementId.length === 0) return null;
  if (raw.region !== "table") return null;
  return {
    element_id: elementId,
    type: typeof raw.type === "string" ? raw.type : "Text",
    region: "table",
    page_number: numberOrNull(raw.page_number),
    bbox: bboxOrNull(raw.bbox),
    page_width: numberOrNull(raw.page_width),
    page_height: numberOrNull(raw.page_height),
    text: typeof raw.text === "string" ? raw.text : "",
    text_as_html: typeof raw.text_as_html === "string" ? raw.text_as_html : "",
  };
}

const SKIP_TEXT_TAGS = new Set(["SCRIPT", "STYLE"]);

/**
 * A cell's text: every descendant text node, concatenated, EXCEPT a <script>
 * or <style> element contributes nothing — not even its own text — which is
 * what keeps `<script>alert(1)</script>x` from leaking "alert(1)" into the
 * cell. No other element is special-cased, so a nested <table> is walked the
 * same way as any other child: its rows and cells are never treated as
 * structural at THIS level, so their text just flattens into the parent
 * cell — this is the "flatten an inner table's text into its parent cell" rule.
 */
function extractCellText(node: Node): string {
  let out = "";
  for (const child of Array.from(node.childNodes)) {
    if (child.nodeType === Node.TEXT_NODE) {
      out += child.textContent ?? "";
    } else if (child.nodeType === Node.ELEMENT_NODE) {
      const tag = (child as Element).tagName;
      if (SKIP_TEXT_TAGS.has(tag)) continue;
      out += extractCellText(child);
    }
    // other node types (comments, etc.) contribute nothing.
  }
  return out;
}

function collapseWhitespace(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

/** colSpan/rowSpan come from the attribute only when it is an integer 1..50; else 1. */
function spanOrOne(raw: string | null): number {
  if (raw === null) return 1;
  const trimmed = raw.trim();
  if (!/^-?\d+$/.test(trimmed)) return 1;
  const n = Number(trimmed);
  return n >= 1 && n <= 50 ? n : 1;
}

function directChildren(el: Element, tag: string): Element[] {
  return Array.from(el.children).filter((c) => c.tagName === tag);
}

function buildRow(tr: Element): Cell[] {
  const cells: Cell[] = [];
  for (const child of Array.from(tr.children)) {
    if (child.tagName === "TH" || child.tagName === "TD") {
      cells.push({
        text: collapseWhitespace(extractCellText(child)),
        header: child.tagName === "TH",
        colSpan: spanOrOne(child.getAttribute("colspan")),
        rowSpan: spanOrOne(child.getAttribute("rowspan")),
      });
    }
  }
  return cells;
}

/**
 * Row placement: rows under thead go into head; rows under
 * tbody or tfoot go into body (tfoot is structural but never head, so it
 * joins tbody's bucket). A <th> row in the body stays in the body with
 * header:true — that is the L35 bare-tr example.
 */
function buildGrid(table: Element): TableGrid {
  const head: Cell[][] = [];
  const body: Cell[][] = [];
  for (const child of Array.from(table.children)) {
    if (child.tagName === "THEAD") {
      for (const tr of directChildren(child, "TR")) head.push(buildRow(tr));
    } else if (child.tagName === "TBODY" || child.tagName === "TFOOT") {
      for (const tr of directChildren(child, "TR")) body.push(buildRow(tr));
    }
    // NO `TR` ARM, deliberately. The HTML parser always wraps a bare <tr> under <table> in an
    // implicit <tbody>, so a "row directly under table" never reaches this loop — the L35 bare-tr
    // example arrives through the TBODY arm. An arm here could never run and would read as covered.
    // Any other direct child (caption, colgroup, a stray div) is not structural; ignored.
  }
  return { head, body };
}

/**
 * Parse with DOMParser, walk to the FIRST <table> in document order (a
 * nested table inside a cell appears later in the source, so this is also
 * the outermost one). With none, return null.
 */
export function parseTableHtml(html: string): TableGrid | null {
  if (!html) return null;
  const doc = new DOMParser().parseFromString(html, "text/html");
  const table = doc.querySelector("table");
  if (!table) return null;
  return buildGrid(table);
}
