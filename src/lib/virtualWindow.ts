/**
 * virtualWindow - hand-rolled windowing for a list of items whose heights are measured (estimated until mounted).
 *
 * `layoutOffsets` turns per-item heights into cumulative offsets (O(N), once per list change).
 * `visibleRange` finds, by binary search, the half-open index range [start, end) of the items
 * that meet [scrollTop - overscan, scrollTop + viewport + overscan]. Rendering only that range
 * is what keeps the DOM at "what is on screen" whether the list holds 50 answers or 10,000.
 *
 * An unmeasured viewport (<= 0, as in jsdom or before the first layout) falls back to
 * `FALLBACK_VIEWPORT_PX` rather than to "nothing visible" or "everything visible".
 */
export const FALLBACK_VIEWPORT_PX = 800;

export function layoutOffsets(heights: readonly number[]): { offsets: number[]; total: number } {
  const offsets = new Array<number>(heights.length);
  let y = 0;
  for (let i = 0; i < heights.length; i++) {
    offsets[i] = y;
    y += heights[i]!;
  }
  return { offsets, total: y };
}

export function visibleRange(
  offsets: readonly number[],
  heights: readonly number[],
  scrollTop: number,
  viewportPx: number,
  overscanPx: number,
): [number, number] {
  const n = offsets.length;
  if (n === 0) return [0, 0];
  const vh = viewportPx > 0 ? viewportPx : FALLBACK_VIEWPORT_PX;
  const top = scrollTop - overscanPx;
  const bottom = scrollTop + vh + overscanPx;
  // first item whose bottom edge is below `top`
  let lo = 0;
  let hi = n;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (offsets[mid]! + heights[mid]! > top) hi = mid;
    else lo = mid + 1;
  }
  const start = lo;
  // first item whose top edge is at or below `bottom`
  lo = start;
  hi = n;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (offsets[mid]! >= bottom) hi = mid;
    else lo = mid + 1;
  }
  return [start, lo];
}

/** A measured height wins over the estimate; the estimate is only for never-mounted items. */
export function mergedHeight(key: string, measured: ReadonlyMap<string, number>, estimate: number): number {
  return measured.get(key) ?? estimate;
}

/** An item whose height changed from oldH to newH, with the list-relative top it had. */
export interface AnchorChange {
  top: number;
  oldH: number;
  newH: number;
}

/**
 * Scroll compensation for measured-height windowing. scrollTop is in the list's coordinates.
 * An item that lies WHOLLY above the viewport top (top + oldH <= scrollTop) pushes everything
 * below it by (newH - oldH), so the scroll container must move by the same amount to keep what
 * the reader is looking at still. Items at or below the viewport top move nothing the reader sees.
 */
export function anchorDelta(changes: readonly AnchorChange[], scrollTop: number): number {
  let d = 0;
  for (const c of changes) if (c.top + c.oldH <= scrollTop) d += c.newH - c.oldH;
  return d;
}
