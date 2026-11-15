import {
  STAGE_MAX_USER_SCALE,
  STAGE_MIN_SCALE,
  STAGE_SCROLL_MARGIN,
  STAGE_ZOOM_STEP,
} from "./stageConstants";

/** The camera: world-space translation plus scale. */
export type StageCam = { tx: number; ty: number; s: number };

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/**
 * The world centred in the pane at scale `s` — the placement `worldFitCam` always had, split out so a USER zoom
 * can place the board the same way at a different scale. `topInset` > 0 fits below the planning strip.
 */
export function centredCam(
  world: { w: number; h: number },
  vp: { w: number; h: number },
  isGlobal: boolean,
  topInset: number,
  s: number,
): StageCam {
  if (topInset > 0) {
    const avail = vp.h - topInset;
    return {
      tx: (vp.w - world.w * s) / 2,
      ty: topInset + Math.max(0, (avail - world.h * s) / 2 - 6),
      s,
    };
  }
  return {
    tx: (vp.w - world.w * s) / 2,
    ty: (vp.h - world.h * s) / 2 - (isGlobal ? 20 : 6),
    s,
  };
}

/** The scale that fits the world (never magnifies, never below the floor). */
export function fitScale(
  world: { w: number; h: number },
  vp: { w: number; h: number },
  isGlobal: boolean,
  topInset: number,
): number {
  const fill = isGlobal ? 0.9 : 0.97;
  const availH = topInset > 0 ? vp.h - topInset : vp.h;
  return Math.max(Math.min(Math.min(vp.w / world.w, availH / world.h) * fill, 1), STAGE_MIN_SCALE);
}

/** The largest user zoom for this fit: the one that lands on the ceiling. */
export const maxUserZoom = (fitS: number) => Math.max(1, STAGE_MAX_USER_SCALE / fitS);

/** One Zoom in / Zoom out press, kept inside [1, ceiling] so a press at either end is a no-op, never a stored overshoot. */
export function stepUserZoom(userZoom: number, dir: 1 | -1, fitS: number): number {
  const next = dir > 0 ? userZoom * STAGE_ZOOM_STEP : userZoom / STAGE_ZOOM_STEP;
  return clamp(next, 1, maxUserZoom(fitS));
}

export interface BoardPlacement {
  cam: StageCam;
  /** The fit scale (floor applied) the user zoom multiplies. */
  fitS: number;
  /** Size of the scrollable content: the pane when the board fits, the board plus margins when it overflows. */
  spacer: { w: number; h: number };
  overflowX: boolean;
  overflowY: boolean;
}

/**
 * Overview / custom camera with a user zoom: `s = clamp(fit * userZoom, floor, ceiling)`. A board that fits is
 * placed exactly as the fit places it (centred, nothing scrolls). One that overflows is placed from the spacer's
 * top-left margin — a negative `tx`/`ty` would be an offset the scroll can never reach.
 */
export function placeBoard(
  world: { w: number; h: number },
  vp: { w: number; h: number },
  isGlobal: boolean,
  topInset: number,
  userZoom: number,
): BoardPlacement {
  const fitS = fitScale(world, vp, isGlobal, topInset);
  const s = clamp(fitS * userZoom, STAGE_MIN_SCALE, STAGE_MAX_USER_SCALE);
  const base = centredCam(world, vp, isGlobal, topInset, s);
  const W = world.w * s;
  const H = world.h * s;
  const overflowX = W > vp.w;
  const overflowY = H + topInset > vp.h;
  const tx = overflowX ? STAGE_SCROLL_MARGIN : base.tx;
  const ty = overflowY ? topInset + STAGE_SCROLL_MARGIN : base.ty;
  return {
    cam: { tx, ty, s },
    fitS,
    spacer: {
      w: overflowX ? tx + W + STAGE_SCROLL_MARGIN : vp.w,
      h: overflowY ? ty + H + STAGE_SCROLL_MARGIN : vp.h,
    },
    overflowX,
    overflowY,
  };
}

/** Client point (relative to the pane's top-left) → world point, accounting for the scroll offset. */
export function clientToWorld(
  px: number,
  py: number,
  cam: StageCam,
  scroll: { x: number; y: number },
): { x: number; y: number } {
  return { x: (px + scroll.x - cam.tx) / cam.s, y: (py + scroll.y - cam.ty) / cam.s };
}

/** World rect → pane-relative rect under `cam` and `scroll` (the inverse the lasso needs). */
export function worldToPane(
  r: { x: number; y: number; w: number; h: number },
  cam: StageCam,
  scroll: { x: number; y: number },
) {
  return { x: r.x * cam.s + cam.tx - scroll.x, y: r.y * cam.s + cam.ty - scroll.y, w: r.w * cam.s, h: r.h * cam.s };
}

/** The scroll offset that puts world point `wc` at the pane centre under `cam` (caller clamps to the max). */
export function scrollForCentre(
  wc: { x: number; y: number },
  cam: StageCam,
  vp: { w: number; h: number },
): { x: number; y: number } {
  return {
    x: Math.max(0, wc.x * cam.s + cam.tx - vp.w / 2),
    y: Math.max(0, wc.y * cam.s + cam.ty - vp.h / 2),
  };
}
