import { useEffect, useLayoutEffect, useState } from "react";

/** Kept in step with `--flip-ms` in index.css — the settle must outlast the transition. */
export const FLIP_MS = 480;

/**
 * The card's turn, as three states rather than two: flat, three-dimensional for half a second,
 * flat again.
 *
 * ── WHY THE 3D IS TEMPORARY ───────────────────────────────────────────────────────────────
 *
 * A face inside a live `preserve-3d` context is composited as a texture, and the map's content
 * is additionally scaled by `FitBox`, so the browser rasterises it once at the layer's
 * resolution and resamples that bitmap rather than re-rendering the text. It arrives soft and
 * STAYS soft, because nothing invalidates the layer. Removing the 3D once the turn is over is
 * the fix; every alternative is a guess about a particular engine's raster cache.
 *
 * ── WHY THIS IS A HOOK AND NOT TWO LINES IN THE CARD ──────────────────────────────────────
 *
 * IT WAS TWO LINES IN THE CARD, AND IT WAS WRONG, AND NOTHING COULD SEE IT. Both effects were
 * one effect with `[flipped, renderFlipped]` as its dependencies — so the moment the animation
 * frame set `renderFlipped`, React ran the cleanup, and the cleanup cleared the settle timer
 * BEFORE IT FIRED. `flipping` never went back to false; the card stayed composited; the back
 * stayed blurry. The behaviour was identical to having no fix at all.
 *
 * The seal for it had gone red, and the seal was worthless: it asserted the source CONTAINED a
 * `setTimeout`, which was true the whole time. A lifecycle defect is invisible to a source
 * assertion by construction — the code says what it intends, and the runtime does something
 * else. So the state machine lives here, where a test can run it with a clock.
 *
 * ── THE TWO EFFECTS ARE SEPARATE ON PURPOSE ───────────────────────────────────────────────
 *
 * The starter depends on the angle; the settle depends only on whether a turn is in progress.
 * Merging them re-creates the defect exactly, which is why the test below drives the whole
 * sequence rather than asserting on either half.
 */
export function useFlipState(flipped: boolean): {
  /** The angle actually rendered — lags `flipped` by one frame. */
  renderFlipped: boolean;
  /** True only while turning. Every 3D property is scoped to this. */
  flipping: boolean;
} {
  const [renderFlipped, setRenderFlipped] = useState(flipped);
  const [flipping, setFlipping] = useState(false);

  // START. `renderFlipped` lags `flipped` by one frame ON PURPOSE: the 3D context has to be in
  // the DOM BEFORE the angle changes, or the browser has no transition to run and the card
  // snaps to the other face.
  useLayoutEffect(() => {
    if (renderFlipped === flipped) return;
    setFlipping(true);
    const raf = requestAnimationFrame(() => setRenderFlipped(flipped));
    return () => cancelAnimationFrame(raf);
  }, [flipped, renderFlipped]);

  // SETTLE. Depends on `flipping` ALONE — see the header. A timer rather than `transitionend`,
  // because under `prefers-reduced-motion` there is no transition and no event, and a settle
  // that never ran would leave the card composited: soft forever, on exactly the setting chosen
  // by someone who wanted less of this rather than worse of it.
  useEffect(() => {
    if (!flipping) return;
    const settle = setTimeout(() => setFlipping(false), FLIP_MS + 40);
    return () => clearTimeout(settle);
  }, [flipping]);

  return { renderFlipped, flipping };
}
