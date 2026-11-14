/**
 * Entitlements are read once per session and refreshed on a timer or after a 403, never by the control that
 * mounts. E1..E3 and E6..E10 of the spec (E4/E5 are in src/api/forbidden.test.ts, against the real client).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, render, cleanup, act } from "@testing-library/react";

const fetchEntitlements = vi.fn();
const fetchIngestExportProfiles = vi.fn();
vi.mock("@/api/client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/api/client")>()),
  fetchEntitlements: (...a: unknown[]) => fetchEntitlements(...a),
  fetchIngestExportProfiles: (...a: unknown[]) => fetchIngestExportProfiles(...a),
}));
const auth = vi.hoisted(() => ({
  isAuthenticated: true,
  user: { profile: { sub: "u1" } } as { profile: { sub: string } } | null,
}));
vi.mock("react-oidc-context", () => ({ useAuth: () => auth }));

import {
  usePersonaStore,
  ENTITLEMENTS_REFRESH_MS,
  ENTITLEMENTS_FORBIDDEN_MIN_GAP_MS,
} from "@/store/usePersonaStore";
import { useEntitlementsSync } from "@/hooks/useEntitlementsSync";
import { useCanExportSelection } from "@/lib/useCanExportSelection";
import { reportForbidden } from "@/api/forbidden";
import { ReviewExportAs } from "@/components/ApprovalTask/ReviewExportAs";
import type { Entitlements } from "@/api/types";

const CAP = "ingest:exportBatch";
const matrix = (over: Record<string, unknown> = {}, caps: string[] = [CAP]) =>
  ({ user_id: "u1", source: "topaz", default: null, cells: [], capabilities: caps, ...over }) as unknown as Entitlements;
const flush = () =>
  act(async () => {
    await vi.advanceTimersByTimeAsync(0);
  });
const advance = (ms: number) =>
  act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
const noSleep = async () => {};
const sel = () => {
  const s = usePersonaStore.getState();
  return { ownerSub: s.ownerSub, selectedPersona: s.selectedPersona, selectedDomains: s.selectedDomains };
};

const RESET = {
  entitlements: null,
  entitlementsLoading: false,
  entitlementsError: null,
  selectedPersona: null,
  selectedDomains: [],
  ownerSub: null,
};
beforeEach(() => {
  window.localStorage.clear();
  window.localStorage.setItem("cortex.reviewExport", "1");
  usePersonaStore.setState(RESET as never);
  auth.isAuthenticated = true;
  auth.user = { profile: { sub: "u1" } };
  fetchEntitlements.mockReset();
  fetchIngestExportProfiles.mockReset().mockResolvedValue([]);
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
  window.localStorage.clear();
});

describe("E1: the control reads the store, never the wire", () => {
  it("E1: a matrix with the capability: 3 mounts and a ReviewExportAs, 0 fetches, all true", () => {
    usePersonaStore.setState({ entitlements: matrix() });
    const hooks = [1, 2, 3].map(() => renderHook(() => useCanExportSelection()));
    expect(hooks.map((h) => h.result.current)).toEqual([true, true, true]);
    render(<ReviewExportAs ingestId="sha256:abc" />);
    expect(fetchEntitlements).not.toHaveBeenCalled();
  });
  it("E1b: a matrix without the capability: all false, 0 fetches", () => {
    usePersonaStore.setState({ entitlements: matrix({}, ["other:cap"]) });
    const hooks = [1, 2, 3].map(() => renderHook(() => useCanExportSelection()));
    expect(hooks.map((h) => h.result.current)).toEqual([false, false, false]);
    render(<ReviewExportAs ingestId="sha256:abc" />);
    expect(fetchEntitlements).not.toHaveBeenCalled();
  });
  it("E1c: reviewExportMock on, store null: true from the fixture, 0 fetches", () => {
    window.localStorage.setItem("cortex.reviewExportMock", "1");
    const hooks = [1, 2, 3].map(() => renderHook(() => useCanExportSelection()));
    expect(hooks.map((h) => h.result.current)).toEqual([true, true, true]);
    expect(fetchEntitlements).not.toHaveBeenCalled();
  });
});

describe("the session owner drives the refresh", () => {
  beforeEach(() => vi.useFakeTimers());

  it("E2: 1 call on mount; one more per ENTITLEMENTS_REFRESH_MS; none after unmount", async () => {
    fetchEntitlements.mockResolvedValue(matrix());
    const h = renderHook(() => useEntitlementsSync());
    await flush();
    expect(fetchEntitlements).toHaveBeenCalledTimes(1);
    await advance(ENTITLEMENTS_REFRESH_MS);
    expect(fetchEntitlements).toHaveBeenCalledTimes(2);
    h.unmount();
    await advance(ENTITLEMENTS_REFRESH_MS * 2);
    expect(fetchEntitlements).toHaveBeenCalledTimes(2);
  });

  it("E2b: sign-out clears the timer and the 403 listener", async () => {
    fetchEntitlements.mockResolvedValue(matrix());
    const h = renderHook(() => useEntitlementsSync());
    await flush();
    auth.isAuthenticated = false;
    h.rerender();
    await advance(ENTITLEMENTS_REFRESH_MS);
    reportForbidden("X");
    await flush();
    expect(fetchEntitlements).toHaveBeenCalledTimes(1);
  });

  it("E3: a 403 inside the gap is dropped; one past the gap refreshes again", async () => {
    fetchEntitlements.mockResolvedValue(matrix());
    renderHook(() => useEntitlementsSync());
    await flush();
    expect(fetchEntitlements).toHaveBeenCalledTimes(1);
    reportForbidden("X");
    await flush(); // the first refresh settles ...
    reportForbidden("X"); // ... so only the throttle, not single-flight, can drop this one
    await flush();
    expect(fetchEntitlements).toHaveBeenCalledTimes(2);
    await advance(ENTITLEMENTS_FORBIDDEN_MIN_GAP_MS + 1);
    reportForbidden("X");
    await flush();
    expect(fetchEntitlements).toHaveBeenCalledTimes(3);
  });

  it("E8: a 403 arrives, the refresh drops the capability: the mounted control turns false", async () => {
    fetchEntitlements.mockResolvedValueOnce(matrix()).mockResolvedValueOnce(matrix({}, []));
    renderHook(() => useEntitlementsSync());
    const control = renderHook(() => useCanExportSelection());
    await flush();
    expect(control.result.current).toBe(true);
    reportForbidden("X");
    await flush();
    expect(control.result.current).toBe(false);
  });

  it("E10: a terminally failed first load (null matrix, error set); the timer tick succeeds and clears it", async () => {
    fetchEntitlements
      .mockRejectedValueOnce(new Error("down"))
      .mockRejectedValueOnce(new Error("down"))
      .mockRejectedValueOnce(new Error("down"))
      .mockResolvedValue(matrix());
    renderHook(() => useEntitlementsSync());
    const control = renderHook(() => useCanExportSelection());
    await advance(5000); // through the bounded retries
    expect(fetchEntitlements).toHaveBeenCalledTimes(3);
    expect(usePersonaStore.getState().entitlements).toBeNull();
    expect(usePersonaStore.getState().entitlementsError).toBe("down");
    expect(control.result.current).toBe(false);
    await advance(ENTITLEMENTS_REFRESH_MS);
    expect(usePersonaStore.getState().entitlements).not.toBeNull();
    expect(usePersonaStore.getState().entitlementsError).toBeNull();
    expect(control.result.current).toBe(true);
  });
});

describe("the store's refresh", () => {
  it("E6: a failing refresh keeps the matrix, never raises loading, leaves the error; the next success replaces it", async () => {
    const m1 = matrix();
    usePersonaStore.setState({ entitlements: m1, entitlementsError: "prior" });
    const loadingSeen: boolean[] = [];
    const unsub = usePersonaStore.subscribe((s) => loadingSeen.push(s.entitlementsLoading));
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    await usePersonaStore.getState().refreshEntitlements(async () => {
      throw new Error("down");
    });
    expect(usePersonaStore.getState().entitlements).toBe(m1);
    expect(usePersonaStore.getState().entitlementsError).toBe("prior");
    expect(warn).toHaveBeenCalledTimes(1);
    const m2 = matrix({}, []);
    await usePersonaStore.getState().refreshEntitlements(async () => m2);
    unsub();
    expect(usePersonaStore.getState().entitlements).toBe(m2);
    expect(loadingSeen.includes(true)).toBe(false);
  });

  it("E7: a refresh during an in-flight load joins it: one wire call, same promise, both settle", async () => {
    let release!: (e: Entitlements) => void;
    const gate = new Promise<Entitlements>((r) => (release = r));
    const fetchA = vi.fn(() => gate);
    const fetchB = vi.fn(async () => matrix());
    const p1 = usePersonaStore.getState().loadEntitlements(fetchA, noSleep);
    const p2 = usePersonaStore.getState().refreshEntitlements(fetchB);
    expect(p2).toBe(p1);
    release(matrix());
    await Promise.all([p1, p2]);
    expect(fetchA).toHaveBeenCalledTimes(1);
    expect(fetchB).not.toHaveBeenCalled();
    expect(usePersonaStore.getState().entitlements).not.toBeNull();
  });

  it("E9: a refresh for a different user resets the selection exactly as a first load does", async () => {
    const other = matrix({ user_id: "u2", default: { persona: "pA", domain: "dA" }, cells: [{ persona: "pA", domain: "dA" }] });
    // reference: the same matrix as a FIRST load on a store owned by nobody
    await usePersonaStore.getState().loadEntitlements(async () => other, noSleep);
    const ref = sel();
    expect(ref).toEqual({ ownerSub: "u2", selectedPersona: "pA", selectedDomains: ["dA"] });
    // now a store holding user u1's matrix and selection, refreshed with u2's
    usePersonaStore.setState({
      entitlements: matrix({ cells: [{ persona: "old", domain: "dOld" }] }),
      ownerSub: "u1",
      selectedPersona: "old",
      selectedDomains: ["dOld"],
    });
    await usePersonaStore.getState().refreshEntitlements(async () => other);
    expect(sel()).toEqual(ref);
  });
});

describe("a subject's first load never joins an older request", () => {
  const deferred = () => {
    let resolve!: (e: Entitlements) => void;
    const promise = new Promise<Entitlements>((r) => (resolve = r));
    return { promise, resolve };
  };
  const mA = () => matrix({ user_id: "A", cells: [{ persona: "pa", domain: "da" }], default: { persona: "pa", domain: "da" } });
  const mB = () => matrix({ user_id: "B", cells: [{ persona: "pb", domain: "db" }], default: { persona: "pb", domain: "db" } });

  for (const order of ["B first, then A", "A first, then B"] as const) {
    it(`E11: A's refresh in flight, B's load starts: two wire calls; ${order}: the store holds B`, async () => {
      usePersonaStore.setState({ entitlements: matrix({ user_id: "A" }), ownerSub: "A" });
      const a = deferred();
      const b = deferred();
      const fetchA = vi.fn(() => a.promise);
      const fetchB = vi.fn(() => b.promise);
      const pA = usePersonaStore.getState().refreshEntitlements(fetchA);
      const pB = usePersonaStore.getState().loadEntitlements(fetchB, noSleep);
      expect(pB).not.toBe(pA);
      expect(fetchA).toHaveBeenCalledTimes(1);
      expect(fetchB).toHaveBeenCalledTimes(1);
      const mb = mB();
      if (order === "B first, then A") {
        b.resolve(mb);
        await pB;
        a.resolve(mA());
        await pA;
      } else {
        a.resolve(mA());
        await pA;
        b.resolve(mb);
        await pB;
      }
      expect(usePersonaStore.getState().entitlements).toBe(mb);
      expect(usePersonaStore.getState().ownerSub).toBe("B");
    });
  }
});

describe("a refresh is the same subject's", () => {
  const withPick = (extra: Record<string, unknown> = {}) =>
    usePersonaStore.setState({
      entitlements: matrix({ user_id: "u1", cells: [{ persona: "P", domain: "d" }, { persona: "Q", domain: "d" }] }),
      ownerSub: "u1",
      selectedPersona: "P",
      selectedDomains: ["d"],
      ...extra,
    } as never);

  it("E12: a refresh answering user_id null, P still entitled: the selection is unchanged", async () => {
    withPick();
    await usePersonaStore.getState().refreshEntitlements(async () =>
      matrix({ user_id: null, cells: [{ persona: "P", domain: "d" }, { persona: "Q", domain: "d" }] }),
    );
    expect(sel()).toEqual({ ownerSub: "u1", selectedPersona: "P", selectedDomains: ["d"] });
  });

  it("E13: a refresh (same user_id) where P is gone: the selection is the new default", async () => {
    withPick();
    await usePersonaStore.getState().refreshEntitlements(async () =>
      matrix({ user_id: "u1", cells: [{ persona: "Q", domain: "dq" }], default: { persona: "Q", domain: "dq" } }),
    );
    expect(sel()).toEqual({ ownerSub: "u1", selectedPersona: "Q", selectedDomains: ["dq"] });
  });
});
