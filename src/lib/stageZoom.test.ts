/**
 * The stage zoom's arithmetic, pure: the floor, the user zoom, and the client→world conversions (scroll included).
 * The mounted stage is exercised in GlobalCanvasStage.zoom.test.tsx; these pin the numbers it is built from.
 */
import { describe, it, expect } from "vitest";
import { worldFitCam } from "@/components/AgenticCanvas/GlobalCanvasStage";
import { STAGE_MAX_USER_SCALE, STAGE_MIN_SCALE, STAGE_ZOOM_STEP } from "./stageConstants";
import { clientToWorld, placeBoard, scrollForCentre, stepUserZoom, worldToPane } from "./stageZoom";

const VP = { w: 1200, h: 700 };

describe("Z1: the fit has a floor", () => {
  it("a huge world fits at exactly the floor, in both branches", () => {
    expect(worldFitCam({ w: 60000, h: 40000 }, VP, true).s).toBe(STAGE_MIN_SCALE);
    expect(worldFitCam({ w: 60000, h: 40000 }, VP, false, 40).s).toBe(STAGE_MIN_SCALE);
  });
  it("a small world is unchanged: never above 1, centred", () => {
    const cam = worldFitCam({ w: 1500, h: 950 }, { w: 2600, h: 1400 }, false);
    expect(cam.s).toBe(1);
    expect(cam.tx).toBe((2600 - 1500) / 2);
  });
});

describe("Z3: the user zoom", () => {
  const world = { w: 1500, h: 950 };
  const fit = placeBoard(world, VP, false, 0, 1);
  it("userZoom 1 is the fit, exactly", () => {
    expect(fit.cam).toEqual(worldFitCam(world, VP, false));
    expect(fit.overflowX || fit.overflowY).toBe(false);
  });
  it("n steps multiply the fit by the step^n and stop at the ceiling", () => {
    let z = 1;
    for (let n = 1; n <= 8; n++) {
      z = stepUserZoom(z, 1, fit.fitS);
      const s = placeBoard(world, VP, false, 0, z).cam.s;
      expect(s).toBeCloseTo(Math.min(fit.fitS * STAGE_ZOOM_STEP ** n, STAGE_MAX_USER_SCALE), 9);
    }
    expect(placeBoard(world, VP, false, 0, z).cam.s).toBeCloseTo(STAGE_MAX_USER_SCALE, 9);
  });
  it("a press past either end is a no-op, never a stored overshoot", () => {
    expect(stepUserZoom(1, -1, fit.fitS)).toBe(1);
    const top = stepUserZoom(1e6, 1, fit.fitS);
    expect(stepUserZoom(top, 1, fit.fitS)).toBe(top);
    expect(stepUserZoom(top, -1, fit.fitS)).toBeCloseTo(top / STAGE_ZOOM_STEP, 9);
  });
});

describe("Z5/Z6: an overflowing board is placed from the margin, and conversions add the scroll", () => {
  const big = placeBoard({ w: 40000, h: 20000 }, VP, true, 0, 1);
  it("overflow: positive origin, spacer larger than the pane", () => {
    expect(big.cam.s).toBe(STAGE_MIN_SCALE);
    expect(big.cam.tx).toBeGreaterThanOrEqual(0);
    expect(big.cam.ty).toBeGreaterThanOrEqual(0);
    expect(big.spacer.w).toBeGreaterThan(VP.w);
    expect(big.spacer.h).toBeGreaterThan(VP.h);
  });
  it("clientToWorld and worldToPane are inverses and both move with the scroll", () => {
    const sc = { x: 300, y: 200 };
    const w = clientToWorld(500, 400, big.cam, sc);
    expect(w.x).toBeCloseTo((500 + 300 - big.cam.tx) / big.cam.s, 9);
    const back = worldToPane({ x: w.x, y: w.y, w: 10, h: 10 }, big.cam, sc);
    expect(back.x).toBeCloseTo(500, 9);
    expect(back.y).toBeCloseTo(400, 9);
    expect(clientToWorld(500, 400, big.cam, { x: 0, y: 0 }).x).not.toBeCloseTo(w.x, 3);
  });
});

describe("Z7: zoom keeps the pane-centre world point centred", () => {
  it("scrollForCentre puts that point at the pane centre under the new camera", () => {
    const a = placeBoard({ w: 40000, h: 20000 }, VP, true, 0, 1);
    const sc = { x: 700, y: 400 };
    const wc = clientToWorld(VP.w / 2, VP.h / 2, a.cam, sc);
    const b = placeBoard({ w: 40000, h: 20000 }, VP, true, 0, 2);
    const next = scrollForCentre(wc, b.cam, VP);
    const again = clientToWorld(VP.w / 2, VP.h / 2, b.cam, next);
    expect(Math.abs(again.x - wc.x) * b.cam.s).toBeLessThan(1);
    expect(Math.abs(again.y - wc.y) * b.cam.s).toBeLessThan(1);
  });
});
