/**
 * Pure-logic seals for `src/lib/extractedTable.ts`. Mutants T1-T4 are fired by hand
 * (see the session report) and must redden a named assertion here, not merely exit
 * non-zero.
 */
import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { readExtractedTable, parseTableHtml } from "./extractedTable";
import {
  THEAD_TBODY_HTML,
  BARE_TR_HTML,
  HOSTILE_SCRIPT_IMG_HTML,
  HOSTILE_SPAN_HTML,
  NO_TABLE_HTML,
} from "../components/tables/extractedTable.fixtures";

describe("parseTableHtml — thead/tbody", () => {
  it("[seal 1] puts the thead row in head and the tbody row in body, 1 of each", () => {
    const grid = parseTableHtml(THEAD_TBODY_HTML);
    expect(grid).not.toBeNull();
    expect(grid!.head).toHaveLength(1);
    expect(grid!.body).toHaveLength(1);
    expect(grid!.head[0]).toEqual([
      { text: "Part", header: true, colSpan: 1, rowSpan: 1 },
      { text: "Qty", header: true, colSpan: 1, rowSpan: 1 },
    ]);
    expect(grid!.body[0]).toEqual([
      { text: "Bolt", header: false, colSpan: 1, rowSpan: 1 },
      { text: "4", header: false, colSpan: 1, rowSpan: 1 },
    ]);
  });
});

describe("parseTableHtml — bare <tr>", () => {
  it("[seal 2] keeps a <th> row in body (header:true), none in head", () => {
    const grid = parseTableHtml(BARE_TR_HTML);
    expect(grid).not.toBeNull();
    expect(grid!.head).toHaveLength(0);
    expect(grid!.body).toHaveLength(2);
    expect(grid!.body[0]).toEqual([{ text: "A", header: true, colSpan: 1, rowSpan: 1 }]);
    expect(grid!.body[1]).toEqual([{ text: "1", header: false, colSpan: 1, rowSpan: 1 }]);
  });
});

describe("parseTableHtml — hostile", () => {
  it("[seal 4 / T1] drops script/img markup but keeps their sibling text exactly", () => {
    const grid = parseTableHtml(HOSTILE_SCRIPT_IMG_HTML);
    expect(grid).not.toBeNull();
    expect(grid!.body).toHaveLength(1);
    // Exact equality, not "contains x": a walker that copies the <script>/<img>
    // element as-is (T1) would leave markup or "alert(1)" in the text instead of
    // the bare sibling text.
    expect(grid!.body[0][0]).toEqual({ text: "x", header: false, colSpan: 1, rowSpan: 1 });
    expect(grid!.body[0][1]).toEqual({ text: "y", header: false, colSpan: 1, rowSpan: 1 });
  });

  it("[seal 4 / T2] clamps colspan 999 and rowspan -1 to 1", () => {
    const grid = parseTableHtml(HOSTILE_SPAN_HTML);
    expect(grid).not.toBeNull();
    expect(grid!.body[0][0]).toEqual({ text: "a", header: false, colSpan: 1, rowSpan: 1 });
    expect(grid!.body[0][1]).toEqual({ text: "b", header: false, colSpan: 1, rowSpan: 1 });
  });
});

describe("parseTableHtml — no table", () => {
  it("[seal 5] returns null", () => {
    expect(parseTableHtml(NO_TABLE_HTML)).toBeNull();
  });

  it("returns null for empty html", () => {
    expect(parseTableHtml("")).toBeNull();
  });
});

describe("readExtractedTable", () => {
  it("[seal 6] refuses region narrative", () => {
    expect(
      readExtractedTable({ element_id: "e1", region: "narrative", text: "x", text_as_html: "" }),
    ).toBeNull();
  });

  it("[seal 6] refuses a missing element_id", () => {
    expect(readExtractedTable({ region: "table", text: "x", text_as_html: "" })).toBeNull();
  });

  it("[seal 6] refuses a non-object", () => {
    expect(readExtractedTable(null)).toBeNull();
    expect(readExtractedTable("table")).toBeNull();
    expect(readExtractedTable([1, 2])).toBeNull();
  });

  it("[seal 6 / T4] page_number absent becomes null, never 0", () => {
    const rec = readExtractedTable({
      element_id: "e1",
      region: "table",
      text: "x",
      text_as_html: "",
    });
    expect(rec).not.toBeNull();
    expect(rec!.page_number).toBeNull();
    expect(rec!.page_number).not.toBe(0);
  });

  it("carries bbox/page_width/page_height through when present", () => {
    const rec = readExtractedTable({
      element_id: "e1",
      region: "table",
      page_number: 5,
      bbox: [1, 2, 3, 4],
      page_width: 600,
      page_height: 800,
      text: "x",
      text_as_html: "",
    });
    expect(rec).toEqual({
      element_id: "e1",
      type: "Text",
      region: "table",
      page_number: 5,
      bbox: [1, 2, 3, 4],
      page_width: 600,
      page_height: 800,
      text: "x",
      text_as_html: "",
    });
  });
});

describe("[seal 7] source census — no innerHTML write in the table lib/view sources", () => {
  const files: { path: string; text: string }[] = [];

  files.push({
    path: "src/lib/extractedTable.ts",
    text: readFileSync(join(__dirname, "extractedTable.ts"), "utf8"),
  });

  const tablesDir = join(__dirname, "..", "components", "tables");
  const tsxNames = readdirSync(tablesDir).filter((n) => n.endsWith(".tsx"));
  for (const name of tsxNames) {
    files.push({ path: `src/components/tables/${name}`, text: readFileSync(join(tablesDir, name), "utf8") });
  }

  it("scanned at least the two known files (guard against reading zero files)", () => {
    expect(files.length).toBeGreaterThanOrEqual(2);
  });

  it("contains no dangerouslySetInnerHTML and no .innerHTML = assignment", () => {
    for (const f of files) {
      expect(f.text, `${f.path} must not use dangerouslySetInnerHTML`).not.toMatch(
        /dangerouslySetInnerHTML/,
      );
      expect(f.text, `${f.path} must not assign .innerHTML`).not.toMatch(/\.innerHTML\s*=/);
    }
  });
});
