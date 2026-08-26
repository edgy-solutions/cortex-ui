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
  // FORWARDS THE REF. The first version of this mock dropped the argument, which meant no
  // test could observe WHICH plan was being polled — the exact property that was wrong.
  fetchPlanStateVersion: (ref?: string) => fetchPlanStateVersion(ref),
  requestReevaluation: (id: string) => requestReevaluation(id),
}));

import {
  subscribePlanVersion,
  currentPlanVersion,
  currentPlanVersionOf,
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


/**
 * THE SCENARIO-BLINDNESS FIX.
 *
 * Ops apply to SCENARIOS; baseline moves only through the commit ceremony. A poller reading
 * baseline during a drag session watches a number that never changes — it reports "nothing
 * moved" forever, which is indistinguishable from a working loop over a quiet plan. That is
 * the worst shape a refresh loop can take: it cannot be told apart from success.
 */
describe("planVersion — watches the refs its subscribers name", () => {
  it("polls the NAMED ref, not baseline", async () => {
    fetchPlanStateVersion.mockResolvedValue(1);
    const off = subscribePlanVersion(() => {}, () => ["SC-DEMO"]);
    await flush();

    expect(fetchPlanStateVersion).toHaveBeenCalledWith("SC-DEMO");
    off();
  });

  it("polls baseline when a subscriber names nothing", async () => {
    // The plan of record is the honest default for a watcher that has not said otherwise.
    fetchPlanStateVersion.mockResolvedValue(1);
    const off = subscribePlanVersion(() => {});
    await flush();

    expect(fetchPlanStateVersion).toHaveBeenCalledWith(undefined);
    off();
  });

  it("polls the DISTINCT set — twelve cards on one scenario is ONE request", async () => {
    // The count-becomes-fan-out guard, preserved now that there is more than one thing to
    // watch. Watchers name refs; the poller polls the set.
    fetchPlanStateVersion.mockResolvedValue(1);
    const offs = Array.from({ length: 12 }, () =>
      subscribePlanVersion(() => {}, () => ["SC-DEMO"]),
    );
    await flush();

    expect(fetchPlanStateVersion).toHaveBeenCalledTimes(1);
    offs.forEach((off) => off());
  });

  it("polls each distinct ref once when a canvas mixes two plans", async () => {
    fetchPlanStateVersion.mockResolvedValue(1);
    const off = subscribePlanVersion(() => {}, () => ["SC-A", "SC-B", "SC-A"]);
    await flush();

    const asked = fetchPlanStateVersion.mock.calls.map((c) => c[0]).sort();
    expect(asked).toEqual(["SC-A", "SC-B"]);
    off();
  });

  it("a BUMP on a watched scenario notifies, carrying the ref", async () => {
    fetchPlanStateVersion.mockResolvedValueOnce(1).mockResolvedValue(2);
    const seen: Array<[number, string]> = [];
    const off = subscribePlanVersion((v, ref) => seen.push([v, ref]), () => ["SC-DEMO"]);
    await flush();
    expect(seen).toEqual([]); // first read is quiet

    await vi.advanceTimersByTimeAsync(15_000);
    expect(seen).toEqual([[2, "SC-DEMO"]]);
    off();
  });

  it("the first read of a NEWLY watched ref does not fire", async () => {
    // Otherwise dragging a card onto the canvas would refresh every card already on it — the
    // load-time refresh storm, arriving one card at a time instead.
    let refs = ["SC-A"];
    fetchPlanStateVersion.mockResolvedValue(5);
    const seen: string[] = [];
    const off = subscribePlanVersion((_v, ref) => seen.push(ref), () => refs);
    await flush();

    refs = ["SC-A", "SC-B"];
    await vi.advanceTimersByTimeAsync(15_000);
    expect(seen).toEqual([]);
    off();
  });

  it("re-reads its refs every tick, so a changed canvas needs no resubscribe", async () => {
    let refs = ["SC-A"];
    fetchPlanStateVersion.mockResolvedValue(1);
    const off = subscribePlanVersion(() => {}, () => refs);
    await flush();
    expect(fetchPlanStateVersion).toHaveBeenLastCalledWith("SC-A");

    refs = ["SC-B"];
    await vi.advanceTimersByTimeAsync(15_000);
    expect(fetchPlanStateVersion).toHaveBeenLastCalledWith("SC-B");
    off();
  });

  it("keeps versions PER REF — one plan's number never silences another's poll", async () => {
    // The defect this map exists to prevent: storing SC-DEMO's 3 as the shared version makes
    // the next baseline read of 3 look like no change, and the poller goes quiet.
    fetchPlanStateVersion.mockImplementation((ref?: string) =>
      Promise.resolve(ref === "SC-DEMO" ? 3 : 3),
    );
    const seen: string[] = [];
    const off = subscribePlanVersion((_v, ref) => seen.push(ref), () => ["baseline", "SC-DEMO"]);
    await flush();

    expect(currentPlanVersion()).toBe(3);
    expect(currentPlanVersionOf("SC-DEMO")).toBe(3);

    fetchPlanStateVersion.mockImplementation((ref?: string) =>
      Promise.resolve(ref === "SC-DEMO" ? 4 : 3),
    );
    await vi.advanceTimersByTimeAsync(15_000);
    // Only the scenario moved, and only the scenario is announced.
    expect(seen).toEqual(["SC-DEMO"]);
    expect(currentPlanVersion()).toBe(3);
    expect(currentPlanVersionOf("SC-DEMO")).toBe(4);
    off();
  });
});
