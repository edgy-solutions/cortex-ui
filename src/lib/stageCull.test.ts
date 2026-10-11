/**
 * The stage mounts what the camera can see, plus a viewport of margin, plus what is opened.
 */
import { describe, it, expect } from "vitest";
import { cullToViewport, type CullEntry } from "./stageCull";

const W = 360;
const H = 280;
const COLS = 50;
// 2,000 cards on a 50-wide grid with 400 x 320 pitch.
const ENTRIES: CullEntry[] = Array.from({ length: 2000 }, (_, i) => ({
  a: { id: `a${i}` },
  pos: { x: (i % COLS) * 400, y: Math.floor(i / COLS) * 320 },
  size: { w: W, h: H },
}));
const VP = { w: 1200, h: 700 };
const none = new Set<string>();

describe("cullToViewport", () => {
  it("mounts a bounded few of 2,000 when the viewport covers a few", () => {
    // camera at identity: the pane shows world x in [0,1200], y in [0,700]
    const kept = cullToViewport(ENTRIES, { tx: 0, ty: 0, s: 1 }, VP, none);
    expect(kept.length).toBeGreaterThan(0);
    expect(kept.length).toBeLessThan(80);
    expect(kept.length).toBeLessThan(ENTRIES.length / 20);
  });

  it("is independent of N: 10x the cards on the same grid width keeps the same count", () => {
    const big: CullEntry[] = Array.from({ length: 20000 }, (_, i) => ({
      a: { id: `b${i}` },
      pos: { x: (i % COLS) * 400, y: Math.floor(i / COLS) * 320 },
      size: { w: W, h: H },
    }));
    const a = cullToViewport(ENTRIES, { tx: 0, ty: 0, s: 1 }, VP, none).length;
    const b = cullToViewport(big, { tx: 0, ty: 0, s: 1 }, VP, none).length;
    expect(b).toBe(a);
  });

  it("follows the pan: moving the camera changes which cards mount", () => {
    const home = cullToViewport(ENTRIES, { tx: 0, ty: 0, s: 1 }, VP, none).map((e) => e.a.id);
    const panned = cullToViewport(ENTRIES, { tx: -8000, ty: -6400, s: 1 }, VP, none).map((e) => e.a.id);
    expect(panned).not.toEqual(home);
    expect(panned).not.toContain("a0");
    expect(panned).toContain("a" + (20 + 20 * COLS)); // the card at world (8000, 6400)
  });

  it("always keeps an opened card, even far off screen", () => {
    const kept = cullToViewport(ENTRIES, { tx: 0, ty: 0, s: 1 }, VP, new Set(["a1999"]));
    expect(kept.map((e) => e.a.id)).toContain("a1999");
  });

  it("an unmeasured viewport culls nothing (unknown is not 'nothing is visible')", () => {
    expect(cullToViewport(ENTRIES, { tx: 0, ty: 0, s: 1 }, { w: 0, h: 0 }, none)).toHaveLength(2000);
  });
});
