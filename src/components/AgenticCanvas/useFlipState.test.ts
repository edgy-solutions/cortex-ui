/**
 * THE SEAL THAT WAS WORTHLESS, REPLACED BY ONE THAT RUNS.
 *
 * The blurry back was fixed once and stayed blurry. The fix was correct in intent and broken in
 * lifecycle: the starter and the settle were ONE effect with `[flipped, renderFlipped]` as its
 * dependencies, so the moment the animation frame set `renderFlipped`, React ran the cleanup —
 * and the cleanup cleared the settle timer BEFORE IT FIRED. `flipping` never returned to false,
 * every 3D property stayed applied, and the card stayed composited. Identical behaviour to
 * having made no change at all.
 *
 * THE ASSERTION GUARDING IT HAD GONE RED AND MEANT NOTHING: it checked that the source
 * CONTAINED a `setTimeout`, which was true throughout. A lifecycle defect is invisible to a
 * source assertion by construction — the code says what it intends and the runtime does
 * something else. So this file drives the whole sequence with a clock, and the mutation that
 * proves it is worth having is the merge back into one effect.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useFlipState, FLIP_MS } from "./useFlipState";

/** rAF does not run under fake timers; drive it as a macrotask so `act` can flush it. */
let rafs: FrameRequestCallback[] = [];
beforeEach(() => {
  rafs = [];
  vi.useFakeTimers();
  vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
    rafs.push(cb);
    return rafs.length;
  });
  vi.stubGlobal("cancelAnimationFrame", (id: number) => {
    rafs[id - 1] = () => {};
  });
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

const flushFrame = () => {
  const queued = rafs.slice();
  rafs = [];
  act(() => queued.forEach((cb) => cb(0)));
};

describe("the turn ends", () => {
  it("SETTLES — this is the regression, and it survived a source-level seal", () => {
    const { result, rerender } = renderHook(({ f }) => useFlipState(f), {
      initialProps: { f: false },
    });
    expect(result.current.flipping).toBe(false);

    rerender({ f: true });
    expect(result.current.flipping, "the 3D context must exist before the angle moves").toBe(true);
    expect(result.current.renderFlipped, "the angle must lag by a frame").toBe(false);

    flushFrame();
    expect(result.current.renderFlipped).toBe(true);
    // THE BUG: the frame above changed a dependency of the merged effect, whose cleanup killed
    // the settle timer. Everything to here passed while the card stayed composited forever.
    expect(result.current.flipping, "still turning after the frame — correct").toBe(true);

    act(() => vi.advanceTimersByTime(FLIP_MS + 100));
    expect(result.current.flipping, "NEVER SETTLED — the card stays a texture").toBe(false);
    expect(result.current.renderFlipped).toBe(true);
  });

  it("settles on the way back too", () => {
    const { result, rerender } = renderHook(({ f }) => useFlipState(f), {
      initialProps: { f: true },
    });
    rerender({ f: false });
    flushFrame();
    act(() => vi.advanceTimersByTime(FLIP_MS + 100));
    expect(result.current.flipping).toBe(false);
    expect(result.current.renderFlipped).toBe(false);
  });

  it("settles after a turn that is reversed mid-flight", () => {
    // A reader who opens the map and closes it before the animation finishes must not leave the
    // card composited either — the state machine has to converge, not just complete.
    const { result, rerender } = renderHook(({ f }) => useFlipState(f), {
      initialProps: { f: false },
    });
    rerender({ f: true });
    rerender({ f: false });
    flushFrame();
    act(() => vi.advanceTimersByTime(FLIP_MS + 100));
    expect(result.current.flipping).toBe(false);
    expect(result.current.renderFlipped).toBe(false);
  });
});

describe("the turn starts correctly, so the settle is not passing for the wrong reason", () => {
  it("does nothing at all when the angle never changes", () => {
    const { result, rerender } = renderHook(({ f }) => useFlipState(f), {
      initialProps: { f: false },
    });
    rerender({ f: false });
    act(() => vi.advanceTimersByTime(FLIP_MS + 100));
    expect(result.current.flipping).toBe(false);
    expect(rafs, "a frame was scheduled for a turn that never happened").toHaveLength(0);
  });

  it("starts already-flipped without animating", () => {
    // A card mounted with the map open was not turned to; it opened there.
    const { result } = renderHook(() => useFlipState(true));
    expect(result.current.renderFlipped).toBe(true);
    expect(result.current.flipping).toBe(false);
  });

  it("holds the 3D for the whole transition, not less", () => {
    // Settling early is the other way to break it: the rotation would finish flat, which reads
    // as the card snapping the last few degrees.
    const { result, rerender } = renderHook(({ f }) => useFlipState(f), {
      initialProps: { f: false },
    });
    rerender({ f: true });
    flushFrame();
    act(() => vi.advanceTimersByTime(FLIP_MS - 1));
    expect(result.current.flipping, "settled before the transition ended").toBe(true);
  });
});
