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
