import { describe, it, expect } from "vitest";
import { FALLBACK_VIEWPORT_PX, layoutOffsets, visibleRange } from "./virtualWindow";

describe("virtualWindow", () => {
  const heights = Array.from({ length: 10_000 }, () => 76);
  const { offsets, total } = layoutOffsets(heights);

  it("lays out cumulative offsets", () => {
    expect(offsets[0]).toBe(0);
    expect(offsets[3]).toBe(228);
    expect(total).toBe(760_000);
  });

  it("selects a bounded window of 10,000 and it moves with scrollTop", () => {
    const [s0, e0] = visibleRange(offsets, heights, 0, 800, 400);
    expect(s0).toBe(0);
    expect(e0 - s0).toBeLessThanOrEqual(25);
    const [s1, e1] = visibleRange(offsets, heights, 76_000, 800, 400);
    expect(s1).toBeGreaterThan(900);
    expect(e1 - s1).toBeLessThanOrEqual(25);
  });

  it("an unmeasured viewport falls back rather than rendering nothing or everything", () => {
    const [s, e] = visibleRange(offsets, heights, 0, 0, 0);
    expect(e - s).toBe(Math.ceil(FALLBACK_VIEWPORT_PX / 76));
  });

  it("an empty list is an empty window", () => {
    expect(visibleRange([], [], 0, 800, 400)).toEqual([0, 0]);
  });
});

import { anchorDelta, mergedHeight } from "./virtualWindow";
describe("measured heights", () => {
  it("offsets use the measured height when present, the estimate otherwise", () => {
    const measured = new Map([["b", 90]]);
    const heights = ["a", "b", "c"].map((k) => mergedHeight(k, measured, 50));
    expect(heights).toEqual([50, 90, 50]);
    expect(layoutOffsets(heights).offsets).toEqual([0, 50, 140]);
  });
  it("a change wholly above the view yields the scroll delta; others do not", () => {
    const above = { top: 0, oldH: 50, newH: 80 };
    const straddling = { top: 90, oldH: 50, newH: 80 };
    const below = { top: 300, oldH: 50, newH: 80 };
    expect(anchorDelta([above, straddling, below], 100)).toBe(30);
    expect(anchorDelta([{ top: 0, oldH: 80, newH: 50 }], 100)).toBe(-30);
    expect(anchorDelta([straddling, below], 100)).toBe(0);
  });
});
