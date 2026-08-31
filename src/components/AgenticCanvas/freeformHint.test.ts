import { readFileSync } from "node:fs";
import path from "node:path";
/**
 * THE INVITATION IS CHROME, AND IT STOPS WHEN IT STOPS BEING TRUE.
 *
 * "Freeform — yours to arrange" sat INSIDE the camera transform, at `fontSize: 22` in world
 * units, pinned to the world's bottom-right corner. Two consequences, both visible in the
 * field: it scaled with the zoom, and once the board began filling the pane it landed
 * underneath the bottom-right card — the reader saw "…ANGE" clipped behind a matrix.
 *
 * A label ABOUT the canvas is not a thing ON the canvas. It belongs in screen space beside the
 * board, at a fixed size, like every other piece of chrome.
 *
 * And it is an INVITATION: a board the reader has already arranged does not need inviting. That
 * makes `arranged` its second reader after the re-fit rule, which is the test that the flag
 * earns its place rather than existing for one caller.
 *
 * Source-level because the subject is which side of a CSS transform an element sits on, and
 * jsdom computes no transforms — a render assertion would pass on either side of the boundary
 * and prove nothing about the thing that broke.
 */
import { describe, it, expect } from "vitest";

const STAGE = readFileSync(path.join(__dirname, "GlobalCanvasStage.tsx"), "utf8");

const iTransform = STAGE.indexOf("translate(${cam.tx}px, ${cam.ty}px) scale(${cam.s})");
const iHint = STAGE.indexOf("data-freeform-hint");
const iMarquee = STAGE.indexOf("{/* Lasso marquee (viewport space). */}");

describe("the freeform hint is chrome, not world content", () => {
  it("the anchors are found — positive control", () => {
    expect(iTransform).toBeGreaterThan(0);
    expect(iHint).toBeGreaterThan(0);
    expect(iMarquee).toBeGreaterThan(0);
  });

  it("it renders OUTSIDE the camera transform", () => {
    // The marquee is the known-viewport-space neighbour: it is documented as such and is drawn
    // after the transformed container closes. Sitting alongside it is the structural claim.
    expect(iHint).toBeGreaterThan(iTransform);
    expect(Math.abs(iHint - iMarquee)).toBeLessThan(1200);
  });

  it("it carries no WORLD coordinates and no world-scale font", () => {
    const block = STAGE.slice(iHint - 400, iHint + 300);
    expect(block).not.toMatch(/fontSize:\s*2[0-9]/);
    expect(block).not.toMatch(/right:\s*44|bottom:\s*44/);
  });

  it("it stops once the board has been ARRANGED", () => {
    // An invitation to arrange, shown to someone who has arranged, is noise. This is also the
    // flag's second reader — a field with one consumer is a field waiting to drift.
    expect(STAGE).toContain("!activeCanvas?.arranged");
  });

  it("and it never shows on an EMPTY board, which has its own empty state", () => {
    // Two messages in the same corner saying different things about the same nothing.
    expect(STAGE).toMatch(/!activeCanvas\?\.arranged && activeCanvas!\.items\.length > 0/);
  });
});
