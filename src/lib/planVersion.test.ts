import { readFileSync } from "node:fs";
import path from "node:path";
/**
 * Three properties, each one a defect this repo has already paid for once.
 *
 *  1. ONE poller regardless of subscriber count. A per-instance watcher on GLOBAL state is the
 *     fan-out species swept for on 2026-08-25 — the last instance issued ~70 simultaneous
 *     requests and took cortex-bff off the service mesh. A version endpoint whose answer is
 *     identical for every card is exactly that shape.
 *  2. A version BUMP triggers a re-request. Without this the loop is decoration.
 *  3. A failed re-request changes nothing. The card keeps its previous evaluation AND its
 *     previous stamp, because the old numbers really were true as of the old time.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

const fetchPlanStateVersion = vi.fn();
const requestReevaluation = vi.fn();
vi.mock("@/api/client", () => ({
  fetchPlanStateVersion: () => fetchPlanStateVersion(),
  requestReevaluation: (id: string) => requestReevaluation(id),
}));

import {
  subscribePlanVersion,
  currentPlanVersion,
  __resetPlanVersion,
} from "./planVersion";

/**
 * Flush pending microtasks under FAKE timers. A real `setTimeout(0)` never fires here — the
 * timers are mocked — so the first version of this hung every test at the 5s ceiling.
 */
const flush = () => vi.advanceTimersByTimeAsync(0);

beforeEach(() => {
  vi.useFakeTimers();
  fetchPlanStateVersion.mockReset();
  requestReevaluation.mockReset();
  __resetPlanVersion();
});

afterEach(() => {
  __resetPlanVersion();
  vi.useRealTimers();
});

describe("planVersion — one poller, however many watchers", () => {
  it("TWENTY subscribers issue ONE request per tick, not twenty", async () => {
    // The count-becomes-fan-out guard. Subscriber count must change the number of CALLBACKS
    // and never the number of requests.
    fetchPlanStateVersion.mockResolvedValue(1);
    const offs = Array.from({ length: 20 }, () => subscribePlanVersion(() => {}));
    await flush();

    expect(fetchPlanStateVersion).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(15_000);
    expect(fetchPlanStateVersion).toHaveBeenCalledTimes(2);

    offs.forEach((off) => off());
  });

  it("STOPS polling when the last subscriber leaves", async () => {
    // An app-lifetime interval nobody listens to is a request loop with no reader.
    fetchPlanStateVersion.mockResolvedValue(1);
    const off = subscribePlanVersion(() => {});
    await flush();
    const afterStart = fetchPlanStateVersion.mock.calls.length;
    off();

    await vi.advanceTimersByTimeAsync(60_000);
    expect(fetchPlanStateVersion).toHaveBeenCalledTimes(afterStart);
  });

  it("does not STACK requests when one is slow", async () => {
    // Overlapping polls are the storm shape in slow motion. Skipping a tick is correct — the
    // next one reads the same authoritative value.
    let release: (v: number) => void = () => {};
    fetchPlanStateVersion.mockImplementation(
      () => new Promise<number>((r) => (release = r)),
    );
    const off = subscribePlanVersion(() => {});
    await flush();

    await vi.advanceTimersByTimeAsync(45_000);
    expect(fetchPlanStateVersion).toHaveBeenCalledTimes(1);

    release(1);
    off();
  });
});

describe("planVersion — a change notifies, a first read does not", () => {
  it("the FIRST successful read establishes a baseline WITHOUT firing", async () => {
    // Otherwise every card re-requests on load for a version that never moved — a refresh
    // storm triggered by opening the page.
    fetchPlanStateVersion.mockResolvedValue(7);
    const seen: number[] = [];
    const off = subscribePlanVersion((v) => seen.push(v));
    await flush();

    expect(currentPlanVersion()).toBe(7);
    expect(seen).toEqual([]);
    off();
  });

  it("a BUMP notifies every subscriber exactly once", async () => {
    fetchPlanStateVersion.mockResolvedValueOnce(7).mockResolvedValue(8);
    const a: number[] = [];
    const b: number[] = [];
    const offA = subscribePlanVersion((v) => a.push(v));
    const offB = subscribePlanVersion((v) => b.push(v));
    await flush();

    await vi.advanceTimersByTimeAsync(15_000);
    expect(a).toEqual([8]);
    expect(b).toEqual([8]);

    offA();
    offB();
  });

  it("an UNCHANGED version notifies nobody", async () => {
    fetchPlanStateVersion.mockResolvedValue(7);
    const seen: number[] = [];
    const off = subscribePlanVersion((v) => seen.push(v));
    await flush();
    await vi.advanceTimersByTimeAsync(45_000);

    expect(seen).toEqual([]);
    off();
  });

  it("a FAILED read is not a version change", async () => {
    // We do not know whether anything moved, so we say nothing. Treating an error as a bump
    // would refresh every card on every network blip.
    fetchPlanStateVersion.mockResolvedValueOnce(7).mockRejectedValue(new Error("down"));
    const seen: number[] = [];
    const off = subscribePlanVersion((v) => seen.push(v));
    await flush();
    await vi.advanceTimersByTimeAsync(45_000);

    expect(seen).toEqual([]);
    expect(currentPlanVersion()).toBe(7); // the last KNOWN version, not cleared
    off();
  });
});

describe("the refresh triggers rather than writes", () => {
  const SRC = readFileSync(path.join(__dirname, "useLiveViewRefresh.ts"), "utf8");

  it("the source is read — positive control", () => {
    expect(SRC).toContain("export function useLiveViewRefresh");
  });

  it("NEVER writes rendered_output or valid_as_of — those are Electric's", () => {
    // The prohibition is what forces this to be a trigger instead of a second write path. A
    // client that patched rows would be recomputing by another name, and the card's stamp
    // would then assert a freshness no evaluation produced.
    expect(SRC).not.toContain("updateArtifact");
    expect(SRC).not.toMatch(/rendered_output\s*[:=]/);
    expect(SRC).not.toMatch(/valid_as_of\s*[:=]/);
  });

  it("swallows a failed re-request rather than clearing the card", () => {
    // A failed refresh leaves the previous evaluation AND its stamp. The old numbers really
    // were true as of the old time; blanking would discard a valid answer to report a
    // transport problem.
    expect(SRC).toMatch(/requestReevaluation\(id\)\.catch\(\(\) => \{\}\)/);
  });

  it("is mounted ONCE in App, not per card", () => {
    const app = readFileSync(path.join(__dirname, "../App.tsx"), "utf8");
    expect(app).toContain("useLiveViewRefresh()");
    // The card tree must not reach for it — that would be the fan-out species again.
    for (const f of ["../components/AgenticCanvas/StageCard.tsx"]) {
      expect(readFileSync(path.join(__dirname, f), "utf8")).not.toContain("useLiveViewRefresh");
    }
  });
});
