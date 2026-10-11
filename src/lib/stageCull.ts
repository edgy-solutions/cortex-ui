/**
 * stageCull - which stage cards are worth mounting for the current camera.
 *
 * The camera is `translate(tx, ty) scale(s)` on a world-space board, so the visible world
 * rectangle is [-tx/s, (vw - tx)/s] by [-ty/s, (vh - ty)/s]. A card is kept when its footprint
 * intersects that rectangle grown by `margin` viewports on every side (so a pan reveals cards that
 * are already mounted), and ALWAYS when its id is in `keepIds` (the opened / focused / selected
 * cards, which must never vanish under the reader).
 *
 * A viewport that has not been measured (0 x 0, as in jsdom or before the first ResizeObserver
 * callback) culls nothing: unknown is not "nothing is visible".
 */
export interface Cam {
  tx: number;
  ty: number;
  s: number;
}

export interface CullEntry {
  a: { id: string };
  pos: { x: number; y: number };
  size: { w: number; h: number };
}

export function cullToViewport<T extends CullEntry>(
  entries: readonly T[],
  cam: Cam,
  vp: { w: number; h: number },
  keepIds: ReadonlySet<string>,
  margin = 1,
): T[] {
  if (!(vp.w > 0) || !(vp.h > 0) || !(cam.s > 0)) return entries.slice();
  const mx = (vp.w / cam.s) * margin;
  const my = (vp.h / cam.s) * margin;
  const left = -cam.tx / cam.s - mx;
  const top = -cam.ty / cam.s - my;
  const right = (vp.w - cam.tx) / cam.s + mx;
  const bottom = (vp.h - cam.ty) / cam.s + my;
  return entries.filter(
    (e) =>
      keepIds.has(e.a.id) ||
      (e.pos.x < right && e.pos.x + e.size.w > left && e.pos.y < bottom && e.pos.y + e.size.h > top),
  );
}
