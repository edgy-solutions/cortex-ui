import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  compareBundle,
  checkBundleFreshness,
  watchBundleFreshness,
  BUNDLE_RECHECK_MS,
  type Freshness,
} from "@/lib/bundleFreshness";

const A = "aaaaaaa1111111";
const B = "bbbbbbb2222222";

describe("compareBundle", () => {
  it("equal shas are current", () => {
    expect(compareBundle(A, { git_sha: A })).toEqual({ kind: "current", sha: A });
  });
  it("differing shas are stale and name both", () => {
    expect(compareBundle(A, { git_sha: B })).toEqual({ kind: "stale", mine: A, served: B });
  });
  it("a bundle with no sha is undecidable", () => {
    expect(compareBundle(null, { git_sha: B }).kind).toBe("undecidable");
  });
  it.each([
    ["null git_sha", { git_sha: null }],
    ["placeholder git_sha", { git_sha: "unknown" }],
    ["an html string", "<html>"],
    ["null", null],
  ])("served %s is undecidable", (_n, served) => {
    expect(compareBundle(A, served).kind).toBe("undecidable");
  });
});

const respond = (init: { ok: boolean; status?: number; body: string }) =>
  vi.fn().mockResolvedValue({ ok: init.ok, status: init.status ?? 200, text: async () => init.body });

describe("checkBundleFreshness", () => {
  it("asks for exactly /version.json with no-store", async () => {
    const f = respond({ ok: true, body: JSON.stringify({ git_sha: A }) });
    await checkBundleFreshness(A, f as unknown as typeof fetch);
    expect(f).toHaveBeenCalledWith("/version.json", { cache: "no-store" });
    expect(f).toHaveBeenCalledTimes(1);
  });
  it("matching body is current", async () => {
    const f = respond({ ok: true, body: JSON.stringify({ git_sha: A }) });
    expect((await checkBundleFreshness(A, f as unknown as typeof fetch)).kind).toBe("current");
  });
  it("differing body is stale", async () => {
    const f = respond({ ok: true, body: JSON.stringify({ git_sha: B }) });
    expect(await checkBundleFreshness(A, f as unknown as typeof fetch)).toEqual({
      kind: "stale",
      mine: A,
      served: B,
    });
  });
  it("404 is undecidable and says 404", async () => {
    const f = respond({ ok: false, status: 404, body: "" });
    const r = await checkBundleFreshness(A, f as unknown as typeof fetch);
    expect(r.kind).toBe("undecidable");
    expect(r.kind === "undecidable" && r.reason).toContain("404");
  });
  it("a non-JSON 200 (vite index.html) is undecidable", async () => {
    const f = respond({ ok: true, body: "<!doctype html><html></html>" });
    expect((await checkBundleFreshness(A, f as unknown as typeof fetch)).kind).toBe("undecidable");
  });
  it("a rejecting fetch is undecidable and does not throw", async () => {
    const f = vi.fn().mockRejectedValue(new Error("offline"));
    const r = await checkBundleFreshness(A, f as unknown as typeof fetch);
    expect(r).toEqual({ kind: "undecidable", reason: "offline" });
  });
});

describe("watchBundleFreshness", () => {
  const stale: Freshness = { kind: "stale", mine: "aaa", served: "bbb" };

  function rig(result: Freshness | Promise<Freshness> = stale) {
    const handlers = new Set<() => void>();
    const target = {
      addEventListener: vi.fn((_t: string, h: () => void) => void handlers.add(h)),
      removeEventListener: vi.fn((_t: string, h: () => void) => void handlers.delete(h)),
    };
    const check = vi.fn(() => Promise.resolve(result));
    const onStale = vi.fn();
    const focus = () => handlers.forEach((h) => h());
    return { target, check, onStale, focus, handlers };
  }
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("recheck cadence is 5 minutes", () => expect(BUNDLE_RECHECK_MS).toBe(300000));

  it("does not check at start", async () => {
    const r = rig();
    watchBundleFreshness({ mine: "aaa", onStale: r.onStale, check: r.check, target: r.target });
    await vi.advanceTimersByTimeAsync(BUNDLE_RECHECK_MS - 1);
    expect(r.check).not.toHaveBeenCalled();
  });

  it("checks once on focus", async () => {
    const r = rig();
    watchBundleFreshness({ mine: "aaa", onStale: r.onStale, check: r.check, target: r.target });
    r.focus();
    await vi.advanceTimersByTimeAsync(0);
    expect(r.check).toHaveBeenCalledTimes(1);
    expect(r.check).toHaveBeenCalledWith("aaa");
  });

  it("checks every BUNDLE_RECHECK_MS", async () => {
    const r = rig();
    watchBundleFreshness({ mine: "aaa", onStale: r.onStale, check: r.check, target: r.target });
    await vi.advanceTimersByTimeAsync(BUNDLE_RECHECK_MS);
    expect(r.check).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(BUNDLE_RECHECK_MS);
    expect(r.check).toHaveBeenCalledTimes(2);
  });

  it("stale reports (mine, served)", async () => {
    const r = rig();
    watchBundleFreshness({ mine: "aaa", onStale: r.onStale, check: r.check, target: r.target });
    r.focus();
    await vi.advanceTimersByTimeAsync(0);
    expect(r.onStale).toHaveBeenCalledWith("aaa", "bbb");
  });

  it.each<Freshness>([
    { kind: "current", sha: "aaa" },
    { kind: "undecidable", reason: "x" },
  ])("%j does not report", async (res) => {
    const r = rig(res);
    watchBundleFreshness({ mine: "aaa", onStale: r.onStale, check: r.check, target: r.target });
    r.focus();
    await vi.advanceTimersByTimeAsync(0);
    expect(r.check).toHaveBeenCalledTimes(1);
    expect(r.onStale).not.toHaveBeenCalled();
  });

  it("is single-flight: a trigger during a pending check is dropped", async () => {
    let resolve!: (f: Freshness) => void;
    const r = rig();
    r.check.mockImplementation(() => new Promise<Freshness>((res) => (resolve = res)));
    watchBundleFreshness({ mine: "aaa", onStale: r.onStale, check: r.check, target: r.target });
    r.focus();
    r.focus();
    await vi.advanceTimersByTimeAsync(0);
    expect(r.check).toHaveBeenCalledTimes(1);
    resolve(stale);
    await vi.advanceTimersByTimeAsync(0);
    r.focus();
    await vi.advanceTimersByTimeAsync(0);
    expect(r.check).toHaveBeenCalledTimes(2);
  });

  it("the disposer removes the listener and stops the interval", async () => {
    const r = rig();
    const stop = watchBundleFreshness({ mine: "aaa", onStale: r.onStale, check: r.check, target: r.target });
    stop();
    expect(r.handlers.size).toBe(0);
    r.focus();
    await vi.advanceTimersByTimeAsync(BUNDLE_RECHECK_MS * 3);
    expect(r.check).not.toHaveBeenCalled();
  });
});
