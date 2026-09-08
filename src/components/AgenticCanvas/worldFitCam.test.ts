/**
 * A FIT SHRINKS TO FIT. IT NEVER MAGNIFIES.
 *
 * "When I click the view canvas link, it will bring up the canvas but it's zoomed into super
 * large."
 *
 * The overview camera was the ONLY branch with no bound on scale — the focused card and the
 * grouped-cluster branches both clamp. So whenever the world was smaller than the pane, the
 * "fit" faithfully magnified to fill it, and every card was drawn past the size it was designed
 * at. A seeded board hits this every time: `customWorld` floors a small board at 1500x950, a
 * wide pane is much bigger than that, and the result lands near 170%.
 *
 * The distinction the tests pin: fitting means everything is VISIBLE, not that the pane is
 * FULL. Empty margin around a correctly-sized board is the honest answer when the board is
 * smaller than the room it has — enlarging the cards shows the same board worse, not more of it.
 */
import { describe, it, expect } from "vitest";
import { worldFitCam } from "./GlobalCanvasStage";

/** The pane a maximised window gives a custom canvas, roughly. */
const WIDE = { w: 2600, h: 1400 };
/** What `customWorld` floors a small seeded board to. */
const SMALL_BOARD = { w: 1500, h: 950 };

describe("the world fit never magnifies", () => {
  it("a small board in a wide pane draws at natural size, not blown up", () => {
    // The reported defect, in numbers: unclamped this is min(2600/1500, 1400/950) * 0.97 ≈ 1.42,
    // and with the pane the screenshot was taken at, closer to 1.7.
    const cam = worldFitCam(SMALL_BOARD, WIDE, false);
    expect(cam.s).toBe(1);
  });

  it("holds however much bigger the pane gets", () => {
    // The property rather than the case. A rule that merely subtracted a constant, or clamped
    // at some larger number, would pass the test above on one pane and fail on the next.
    for (const w of [1600, 2600, 4000, 8000]) {
      expect(worldFitCam(SMALL_BOARD, { w, h: 1400 }, false).s).toBeLessThanOrEqual(1);
    }
  });

  it("still SHRINKS when the world is bigger than the pane — the control", () => {
    // Without this a camera hard-coded to 1 would pass every assertion above while making the
    // global overview useless: a wall of cards would sit at natural size and mostly off-screen.
    const cam = worldFitCam({ w: 8000, h: 5000 }, WIDE, true);
    expect(cam.s).toBeLessThan(1);
    expect(cam.s).toBeGreaterThan(0);
  });

  it("scales by the SMALLER ratio, so the long axis is not cropped", () => {
    // A world that is wide and short in a pane that is narrow and tall must fit by WIDTH.
    // Fitting by the larger ratio would push the sides out of view — everything visible is the
    // whole contract of a fit.
    const cam = worldFitCam({ w: 6000, h: 1000 }, { w: 1200, h: 3000 }, false);
    expect(cam.s).toBeCloseTo((1200 / 6000) * 0.97, 5);
  });

  it("centres what it draws", () => {
    // With the scale clamped, the leftover room becomes margin. If it were not split evenly the
    // board would sit against one edge, which reads as a layout bug rather than as a small board.
    const cam = worldFitCam(SMALL_BOARD, WIDE, false);
    const drawnW = SMALL_BOARD.w * cam.s;
    expect(cam.tx).toBeCloseTo((WIDE.w - drawnW) / 2, 5);
    expect(cam.tx).toBeGreaterThan(0);
  });

  it("keeps the two panes' different margins", () => {
    // The global overview is a wall of cards with the dock overlapping its lower edge, so it
    // keeps more air; a custom board was laid out to the pane on purpose and does not need it.
    const big = { w: 8000, h: 5000 };
    expect(worldFitCam(big, WIDE, true).s).toBeLessThan(worldFitCam(big, WIDE, false).s);
  });
});
