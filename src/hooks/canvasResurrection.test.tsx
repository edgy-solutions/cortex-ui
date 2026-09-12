/**
 * "I DELETE THEM ALL, REFRESH, AND THEY COME RIGHT BACK" — reported twice.
 *
 * ── WHY THE FIRST REPAIR DID NOT FIX IT ───────────────────────────────────────────────────
 *
 * A seeded board has TWO producers and the first repair guarded one.
 *
 *   the seed WATCHER   replays the answer on every load and rebuilds the board
 *   the SERVER SYNC    fetches /me/canvases and replaces local state with it
 *
 * `dismissedSeeds` stopped the watcher. `setCanvases` was a blind replace, so the server handed
 * the same board straight back on the next load — and the report was still true after a fix
 * that closed the path I happened to be reading.
 *
 * That is this repo's own recorded law: mount the guard on the POPULATION of writers, not on
 * the site you were looking at. It has now caught me on the canvas store, the interpreter call
 * sites, and a component mounted on one branch of two.
 *
 * ── AND THE SECOND CAUSE, WHICH IS THE CRUELLER ONE ───────────────────────────────────────
 *
 * The save is debounced 800ms. Delete the boards, refresh to check they are gone, and inside
 * that window the delete was never sent: the server still held them. THE RELOAD PERFORMED TO
 * VERIFY THE DELETION WAS WHAT UNDID IT — the user's own check restored the thing it was
 * checking for.
 *
 * ── WHAT THESE SEALS CANNOT DISTINGUISH ───────────────────────────────────────────────────
 *
 * They cannot tell a server copy that is STALE from one that legitimately holds a board this
 * client deleted while another device still wants it. Tombstones are local; cross-device
 * deletion is a product question nobody has ruled. What is asserted is the single-client
 * property the report is about: on THIS client, a deletion survives a reload.
 *
 * They also cannot prove the flush REACHES the server. `keepalive` behaviour on unload is not
 * reproducible in jsdom, so what is asserted is that the flush is attempted with the pending
 * change — the half that was missing entirely.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";

const fetchCanvases = vi.fn();
const saveCanvases = vi.fn();
const saveCanvasesUrgently = vi.fn();

vi.mock("@/api/client", () => ({
  fetchCanvases: (...a: unknown[]) => fetchCanvases(...a),
  saveCanvases: (...a: unknown[]) => saveCanvases(...a),
  saveCanvasesUrgently: (...a: unknown[]) => saveCanvasesUrgently(...a),
}));

import { useCanvasPersistence } from "./useCanvasPersistence";
import { useStageStore } from "@/store/useStageStore";

const seededBoard = (id: string, seed: string) => ({
  id,
  name: "Portfolio Planning",
  use: "portfolio_planning" as const,
  seededFrom: seed,
  template_id: "portfolio",
  items: [{ id: "a1", x: 0, y: 0 }],
});

/**
 * Mount and WAIT FOR HYDRATION.
 *
 * Written first as `renderHook` + `runOnlyPendingTimers`, and three tests failed for a reason
 * that had nothing to do with the fix: hydration is a PROMISE, not a timer, so `hydrated` was
 * still false, the save subscriber returned early, nothing was ever marked pending, and the
 * flush correctly found nothing to send. A fake clock does not advance a microtask queue.
 */
async function mountHydrated() {
  const r = renderHook(() => useCanvasPersistence());
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  });
  // HYDRATION WRITES TOO, and counting its write as the delete's broke two assertions. When the
  // server is empty and local is not, the load MIGRATES the local set up — a legitimate save
  // that has nothing to do with the deletion these tests are about. Cleared so the counts below
  // mean what they say.
  saveCanvases.mockClear();
  saveCanvasesUrgently.mockClear();
  return r;
}

beforeEach(() => {
  fetchCanvases.mockReset().mockResolvedValue([]);
  saveCanvases.mockReset().mockResolvedValue(undefined);
  saveCanvasesUrgently.mockReset().mockResolvedValue(undefined);
  useStageStore.setState({ canvases: [], view: "global", dismissedSeeds: [] } as never);
});
afterEach(() => vi.useRealTimers());

describe("the SERVER cannot resurrect a board the user deleted", () => {
  it("drops a tombstoned seeded board out of the server hydrate", async () => {
    // The path the first repair missed, stated directly.
    useStageStore.setState({ canvases: [seededBoard("c1", "h1")] } as never);
    useStageStore.getState().deleteCanvas("c1");
    expect(useStageStore.getState().dismissedSeeds).toEqual(["h1"]);

    // A reload: the server still holds it, because the save was debounced away or lagged.
    useStageStore.getState().setCanvases([seededBoard("c1", "h1")]);
    expect(useStageStore.getState().canvases).toEqual([]);
  });

  it("keeps a server board whose seed was NOT dismissed — the control", () => {
    // Without this, a hydrate that dropped everything would satisfy the assertion above while
    // losing every board the user has.
    useStageStore.getState().setCanvases([seededBoard("c1", "h1"), seededBoard("c2", "h2")]);
    expect(useStageStore.getState().canvases.map((c) => c.id)).toEqual(["c1", "c2"]);
  });

  it("NEVER filters a hand-built canvas, tombstone or not", () => {
    // A canvas with no seed has nothing that would recreate it, so nothing needs to stop it
    // coming back — and filtering it would silently delete work the user did by hand.
    useStageStore.setState({ dismissedSeeds: ["h1"] } as never);
    const byHand = { id: "m1", name: "By hand", items: [] };
    useStageStore.getState().setCanvases([byHand as never]);
    expect(useStageStore.getState().canvases.map((c) => c.id)).toEqual(["m1"]);
  });

  it("survives the whole round trip: delete, reload, server replies with it", async () => {
    // End to end through the real hook, which is the hop a store test cannot see.
    useStageStore.setState({ canvases: [seededBoard("c1", "h1")] } as never);
    useStageStore.getState().deleteCanvas("c1");
    fetchCanvases.mockResolvedValue([seededBoard("c1", "h1")]);

    const { unmount } = renderHook(() => useCanvasPersistence());
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(useStageStore.getState().canvases).toEqual([]);
    unmount();
  });
});

describe("a deletion reaches the server before the page goes away", () => {
  it("FLUSHES the pending change on pagehide", async () => {
    // The reload the user performs to verify the deletion was what undid it: inside the 800ms
    // debounce the delete had not been sent at all.
    useStageStore.setState({ canvases: [seededBoard("c1", "h1")] } as never);
    await mountHydrated();
    vi.useFakeTimers();

    act(() => {
      useStageStore.getState().deleteCanvas("c1");
    });
    // The debounce has NOT fired — this is the window the report lives in.
    expect(saveCanvases).not.toHaveBeenCalled();

    act(() => {
      window.dispatchEvent(new Event("pagehide"));
    });
    expect(saveCanvasesUrgently).toHaveBeenCalledTimes(1);
    expect(saveCanvasesUrgently.mock.calls[0][0]).toEqual([]);
  });

  it("flushes when the tab is HIDDEN, not merely on unload", async () => {
    // Where a long-lived session actually loses a change: backgrounded, not closed.
    useStageStore.setState({ canvases: [seededBoard("c1", "h1")] } as never);
    await mountHydrated();
    vi.useFakeTimers();
    act(() => {
      useStageStore.getState().deleteCanvas("c1");
    });

    const spy = vi.spyOn(document, "visibilityState", "get").mockReturnValue("hidden");
    act(() => {
      document.dispatchEvent(new Event("visibilitychange"));
    });
    spy.mockRestore();
    expect(saveCanvasesUrgently).toHaveBeenCalledTimes(1);
  });

  it("does NOT flush when the tab merely becomes visible", async () => {
    useStageStore.setState({ canvases: [seededBoard("c1", "h1")] } as never);
    await mountHydrated();
    vi.useFakeTimers();
    act(() => {
      useStageStore.getState().deleteCanvas("c1");
    });
    const spy = vi.spyOn(document, "visibilityState", "get").mockReturnValue("visible");
    act(() => {
      document.dispatchEvent(new Event("visibilitychange"));
    });
    spy.mockRestore();
    expect(saveCanvasesUrgently).not.toHaveBeenCalled();
  });

  it("flushes NOTHING when there is nothing pending", async () => {
    // The control that stops this becoming a request on every tab switch. A flush with no
    // pending change would write the same payload repeatedly for the life of the session.
    await mountHydrated();
    vi.useFakeTimers();
    act(() => {
      window.dispatchEvent(new Event("pagehide"));
    });
    expect(saveCanvasesUrgently).not.toHaveBeenCalled();
  });

  it("does not flush a change the debounce ALREADY sent", async () => {
    // Otherwise every page close re-sends the last save — harmless, and the kind of duplicate
    // write that makes a log unreadable when someone is trying to diagnose the next thing.
    useStageStore.setState({ canvases: [seededBoard("c1", "h1")] } as never);
    await mountHydrated();
    vi.useFakeTimers();
    act(() => {
      useStageStore.getState().deleteCanvas("c1");
    });
    act(() => {
      vi.advanceTimersByTime(900);
    });
    expect(saveCanvases).toHaveBeenCalledTimes(1);

    act(() => {
      window.dispatchEvent(new Event("pagehide"));
    });
    expect(saveCanvasesUrgently).not.toHaveBeenCalled();
  });
});
