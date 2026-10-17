// @vitest-environment node
/**
 * THE FIXTURE IS HONEST: the generated PDF parses with the real pdf.js, has the pages the body
 * claims, and every row's `evidence_ref` box contains the text pdf.js itself reports for that row
 * — mpn and value both. The card's outline tests are only as good as this: an outline test against
 * a box that misses its text would pass while pointing a steward at nothing.
 *
 * Positions come from pdf.js's `getTextContent()` (its `transform` is the text's baseline in PDF
 * space, bottom-left origin), converted to the evidence pane's top-left origin here, independently
 * of `lineBox`, so the expectation is not computed by the helper it checks. Each box is brought
 * to points through its own `page_dims` (pdf.js's page is 612 pt wide), so a row served in layout
 * `px` lands on its text only if its `page_dims` agree with its `bbox`.
 */
import { describe, it, expect, beforeAll } from "vitest";
import { buildPdf, fixturePdfBytes, fixtureExtractionBody, FIXTURE_PAGE_COUNT } from "./promotionReviewFixture";

// pdfjs-dist 6 declares node >=22.13 and calls Promise.withResolvers, which Node 20 lacks. CI and
// the Docker builder run Node 20 (this box runs 22, so it passed here and failed on 760a313's run).
// The browser bundle is unaffected: only this test runs pdf.js under Node. Filled only if missing.
if (typeof (Promise as { withResolvers?: unknown }).withResolvers !== "function") {
  Object.defineProperty(Promise, "withResolvers", {
    configurable: true,
    writable: true,
    value: function withResolvers<T>() {
      let resolve!: (v: T | PromiseLike<T>) => void;
      let reject!: (e?: unknown) => void;
      const promise = new Promise<T>((res, rej) => {
        resolve = res;
        reject = rej;
      });
      return { promise, resolve, reject };
    },
  });
}

type Item = { str: string; transform: number[]; width: number; height: number };
let pages: Item[][] = [];
let numPages = 0;

async function textOf(bytes: ArrayBuffer): Promise<{ numPages: number; pages: Item[][] }> {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const loading = pdfjs.getDocument({ data: new Uint8Array(bytes) });
  const doc = await loading.promise;
  const out: Item[][] = [];
  for (let n = 1; n <= doc.numPages; n++) {
    const page = await doc.getPage(n);
    const tc = await page.getTextContent();
    out.push((tc.items as Item[]).filter((i) => typeof i.str === "string" && i.str.trim() !== ""));
  }
  const count = doc.numPages;
  await loading.destroy();
  return { numPages: count, pages: out };
}

beforeAll(async () => {
  ({ numPages, pages } = await textOf(fixturePdfBytes()));
}, 30_000);

describe("the fixture PDF", () => {
  it("parses, with the page count the module exports", () => {
    expect(numPages).toBe(FIXTURE_PAGE_COUNT);
    expect(numPages).toBe(2);
  });

  it("every row's box holds the text pdf.js reads for that row: its mpn AND its value", () => {
    const body = fixtureExtractionBody("sha256:x") as {
      rows: Array<{ mpn: string; extracted_value: string; evidence_ref: { page: number; bbox: number[]; units: string; page_dims: { width: number; height: number } } }>;
    };
    expect(body.rows).toHaveLength(6);
    expect(new Set(body.rows.map((r) => r.evidence_ref.units))).toEqual(new Set(["pt", "px"])); // both units are exercised
    const PAGE_PT = { width: 612, height: 792 };
    for (const row of body.rows) {
      const { page, bbox, page_dims } = row.evidence_ref;
      const k = PAGE_PT.width / page_dims.width; // page_dims units -> points
      expect(page_dims.height * k, "page_dims keeps the page's aspect").toBeCloseTo(PAGE_PT.height, 6);
      const [x0, y0, x1, y1] = bbox.map((v) => v * k);
      const inside = pages[page - 1].filter((it) => {
        const x = it.transform[4];
        const baseline = PAGE_PT.height - it.transform[5]; // to top-left origin
        return x >= x0 && x + it.width <= x1 && baseline >= y0 && baseline <= y1;
      });
      const text = inside.map((i) => i.str).join(" ");
      expect(text, `row ${row.mpn} on page ${page}`).toContain(row.mpn);
      expect(text, `row ${row.mpn} on page ${page}`).toContain(row.extracted_value);
      // and ONE line: pdf.js splits a line at its space runs (mpn / label / value), so "one line" is
      // one baseline — the rows above and below (same mpn, 16pt apart) are not inside it too
      expect(new Set(inside.map((i) => i.transform[5])).size, `row ${row.mpn} ${row.extracted_value}`).toBe(1);
    }
  });

  it("is a fresh buffer each call (pdf.js detaches what it is handed)", () => {
    const a = fixturePdfBytes();
    const b = fixturePdfBytes();
    expect(a).not.toBe(b);
    expect(new Uint8Array(a)).toEqual(new Uint8Array(b));
  });

  it("buildPdf escapes parentheses and backslashes, so a line like 'a (b) \\\\ c' still parses", async () => {
    const bytes = buildPdf([[{ text: "a (b) \\ c", x: 72, y: 700 }]]);
    const { pages: p } = await textOf(bytes.slice().buffer);
    expect(p[0].map((i) => i.str).join("")).toBe("a (b) \\ c");
  });
});
