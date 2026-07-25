/**
 * Overlay-drift RED TEST (the named seal of the bbox scale rule).
 *
 * doc-tools ships bboxes with their reference `page_dims` precisely to make this
 * testable: a box scaled to two different render sizes must track the SAME text,
 * i.e. its position as a fraction of the rendered page is invariant to the render
 * size. If someone ever "simplifies" scaleBox to draw raw pixels (dropping the
 * page_dims normalization), this goes RED.
 *
 * Run: npx tsx tests/evidence/test_bbox_scale.mts
 */
import { scaleBox, boxFraction, type Bbox, type PageDims } from "../../src/lib/bboxScale.ts";

let failures = 0;
const approx = (a: number, b: number, eps = 1e-9) => Math.abs(a - b) < eps;
function check(name: string, ok: boolean) {
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${name}`);
  if (!ok) failures++;
}

// A table element box in a 1700×2200 (200 DPI US-letter) layout.
const bbox: Bbox = [170, 440, 1530, 660];
const pageDims: PageDims = { width: 1700, height: 2200 };

// Render the page at two zooms: a small card (340 wide) and full (1700 wide).
const small = scaleBox(bbox, pageDims, { width: 340, height: 440 });
const full = scaleBox(bbox, pageDims, { width: 1700, height: 2200 });

// INVARIANT: the box as a fraction of the rendered page is identical at both zooms.
const fracSmall = {
  left: small.left / 340,
  top: small.top / 440,
  width: small.width / 340,
  height: small.height / 440,
};
const fracFull = {
  left: full.left / 1700,
  top: full.top / 2200,
  width: full.width / 1700,
  height: full.height / 2200,
};
check("left fraction tracks across zoom", approx(fracSmall.left, fracFull.left));
check("top fraction tracks across zoom", approx(fracSmall.top, fracFull.top));
check("width fraction tracks across zoom", approx(fracSmall.width, fracFull.width));
check("height fraction tracks across zoom", approx(fracSmall.height, fracFull.height));

// And the fraction equals boxFraction (the reference used to place the overlay).
const ref = boxFraction(bbox, pageDims);
check("scaleBox fraction == boxFraction (left)", approx(fracFull.left, ref.left));
check("scaleBox fraction == boxFraction (width)", approx(fracFull.width, ref.width));

// Concrete expected value: x0=170 of 1700 -> 0.1 of the page width, at 340 -> 34px.
check("small.left == 34 (170/1700 * 340)", approx(small.left, 34));
check("full.left == 170 (raw at native)", approx(full.left, 170));

console.log(failures === 0 ? "\nSEAL: GREEN" : `\nSEAL: RED (${failures} failed)`);
process.exit(failures === 0 ? 0 : 1);
