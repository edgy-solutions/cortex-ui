/**
 * Bounding-box scale rule — the SEALED CONSTANT of the evidence viewer.
 *
 * doc-tools ships every bbox WITH the page dims it is relative to (the page
 * rasterized at 200 DPI, ~1700×2200 for US-letter), specifically so the overlay
 * can be scaled correctly at any render size. The rule is: NORMALIZE against
 * `page_dims`, then scale to the rendered page size. NEVER draw the raw pixel box
 * onto a page rendered at a different DPI/zoom — that is the classic
 * overlay-drift bug (the box slides off the text as you zoom).
 *
 * bbox = [x0, y0, x1, y1] in pixels of unstructured's layout, top-left origin,
 * y increasing downward. `page_dims` = the width/height those pixels are
 * relative to. The named RED TEST (tests/evidence/test_bbox_scale.mts): render at
 * two zooms and assert the box tracks the SAME text — i.e. its position as a
 * FRACTION of the rendered page is invariant to the render size.
 */
export type Bbox = [number, number, number, number];

export interface PageDims {
  width: number;
  height: number;
}

/** A box positioned in the RENDERED page's pixel space (CSS left/top/width/height). */
export interface ScaledBox {
  left: number;
  top: number;
  width: number;
  height: number;
}

export function scaleBox(
  bbox: Bbox,
  pageDims: PageDims,
  rendered: { width: number; height: number }
): ScaledBox {
  const [x0, y0, x1, y1] = bbox;
  const sx = rendered.width / pageDims.width;
  const sy = rendered.height / pageDims.height;
  return {
    left: x0 * sx,
    top: y0 * sy,
    width: (x1 - x0) * sx,
    height: (y1 - y0) * sy,
  };
}

/** The box's position as a FRACTION of the rendered page — the invariant the
 *  overlay-drift red test asserts is constant across zoom levels. */
export function boxFraction(bbox: Bbox, pageDims: PageDims): ScaledBox {
  const [x0, y0, x1, y1] = bbox;
  return {
    left: x0 / pageDims.width,
    top: y0 / pageDims.height,
    width: (x1 - x0) / pageDims.width,
    height: (y1 - y0) / pageDims.height,
  };
}
