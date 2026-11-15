/**
 * THE TASK QUEUE'S FRESHNESS WITHOUT A STREAM (0.4.89). The hook is mounted for real; the wire is stubbed at
 * the lowest seam (the axios adapter, as `client.responseSeal.test.ts` does), so every arm counts the REQUESTS
 * the real client sends and the real `actOnHumanTask` is what reports an act.
 *
 *  Q1  mount with a token: one GET /me/queue, one GET /me/needs_you, no /me/human_tasks, no Electric
 *      `human_task_projection` subscription.
 *  Q3  the timer: QUEUE_REFRESH_MS later a second pair; unmount, no more.
 *  Q4  after the viewer's own act succeeds: a refresh pair.
 *  Q5  visibility: visible after more than the interval refreshes; sooner does not.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { renderHook, cleanup } from "@testing-library/react";
import type { AxiosAdapter, InternalAxiosRequestConfig } from "axios";

const h = vi.hoisted(() => ({
  log: [] as string[],
  token: "tok" as string | null,
  shapes: [] as unknown[],
  serve: (_m: string, _u: string): unknown => ({}),
}));

vi.mock("axios", async (importOriginal) => {
  const mod = await importOriginal<typeof import("axios")>();
  const real = mod.default;
  const realCreate = real.create.bind(real);
  const capture: AxiosAdapter = async (config: InternalAxiosRequestConfig) => {
    const url = String(config.url).split("?")[0];
    h.log.push(`${String(config.method).toUpperCase()} ${url}`);
    return { data: h.serve(String(config.method).toUpperCase(), url), status: 200, statusText: "OK", headers: {}, config };
  };
  const wrapped = Object.assign(Object.create(real), {
    create: (cfg?: Parameters<typeof real.create>[0]) => {
      const inst = realCreate(cfg);
      inst.defaults.adapter = capture;
      return inst;
    },
  });
  return { ...mod, default: wrapped };
});
vi.mock("react-oidc-context", () => ({
  useAuth: () => ({ isAuthenticated: h.token !== null, user: h.token ? { access_token: h.token } : null }),
}));
vi.mock("@electric-sql/client", () => ({
  ShapeStream: class {
    constructor(opts: unknown) {
      h.shapes.push(opts);
    }
    subscribe() {
      return () => {};
    }
  },
}));

import { useHumanTaskSync } from "./useHumanTaskSync";
import { QUEUE_REFRESH_MS } from "@/lib/humanTaskQueue";
import { actOnHumanTask } from "@/api/client";
import { useHumanTaskStore } from "@/store/useHumanTaskStore";

const QUEUE = "GET /me/queue";
const NEEDS = "GET /me/needs_you";
const count = (op: string) => h.log.filter((l) => l === op).length;
const flush = async () => { await vi.advanceTimersByTimeAsync(0); };
const setVisibility = (state: "visible" | "hidden") => {
  Object.defineProperty(document, "visibilityState", { configurable: true, get: () => state });
  document.dispatchEvent(new Event("visibilitychange"));
};

beforeEach(() => {
  vi.useFakeTimers();
  h.log.length = 0;
  h.shapes.length = 0;
  h.token = "tok";
  h.serve = (_m, url) => {
    if (url.endsWith("/me/queue")) return { tasks: [], email: null, delegated: null };
    if (url.endsWith("/me/needs_you")) return { counts: {}, total: 0, email: null, delegated: null };
    if (url.includes("/act")) return { accepted: true };
    return {};
  };
  useHumanTaskStore.getState().reset();
});
afterEach(() => {
  cleanup();
  setVisibility("visible");
  vi.useRealTimers();
});

describe("Q1: mount reads the per-viewer queue, and only that", () => {
  it("with a token: exactly one GET /me/queue and one GET /me/needs_you; no /me/human_tasks; no Electric task shape", async () => {
    renderHook(() => useHumanTaskSync());
    await flush();
    expect(count(QUEUE)).toBe(1);
    expect(count(NEEDS)).toBe(1);
    expect(h.log.filter((l) => l.includes("human_tasks") && l.startsWith("GET"))).toEqual([]);
    expect(h.shapes.filter((o) => JSON.stringify(o).includes("human_task_" + "projection"))).toEqual([]);
    expect(useHumanTaskStore.getState().queueLoaded).toBe(true);
  });

  it("without a token: no request at all", async () => {
    h.token = null;
    renderHook(() => useHumanTaskSync());
    await vi.advanceTimersByTimeAsync(QUEUE_REFRESH_MS * 2);
    expect(h.log).toEqual([]);
  });
});

describe("Q3: the timer", () => {
  it("QUEUE_REFRESH_MS later a second pair; unmount: no more", async () => {
    const { unmount } = renderHook(() => useHumanTaskSync());
    await flush();
    expect([count(QUEUE), count(NEEDS)]).toEqual([1, 1]);
    await vi.advanceTimersByTimeAsync(QUEUE_REFRESH_MS - 1);
    expect(count(QUEUE)).toBe(1);
    await vi.advanceTimersByTimeAsync(1);
    expect([count(QUEUE), count(NEEDS)]).toEqual([2, 2]);
    unmount();
    await vi.advanceTimersByTimeAsync(QUEUE_REFRESH_MS * 3);
    expect([count(QUEUE), count(NEEDS)]).toEqual([2, 2]);
  });
});

describe("Q4: after the viewer's own act", () => {
  it("a successful act is followed by a refresh pair", async () => {
    renderHook(() => useHumanTaskSync());
    await flush();
    h.log.length = 0;
    await actOnHumanTask("t-1", "approved");
    await flush();
    expect(h.log.filter((l) => l.startsWith("POST") && l.includes("/act"))).toHaveLength(1);
    expect([count(QUEUE), count(NEEDS)]).toEqual([1, 1]);
  });

  it("a FAILED act is not followed by a refresh", async () => {
    renderHook(() => useHumanTaskSync());
    await flush();
    const serve = h.serve;
    h.serve = (m, u) => {
      if (u.includes("/act")) throw Object.assign(new Error("Request failed with status code 500"), { response: { status: 500, data: {} } });
      return serve(m, u);
    };
    h.log.length = 0;
    await expect(actOnHumanTask("t-1", "approved")).rejects.toThrow();
    await flush();
    expect([count(QUEUE), count(NEEDS)]).toEqual([0, 0]);
  });

  it("after unmount an act refreshes nothing", async () => {
    const { unmount } = renderHook(() => useHumanTaskSync());
    await flush();
    unmount();
    h.log.length = 0;
    await actOnHumanTask("t-1", "approved");
    await flush();
    expect([count(QUEUE), count(NEEDS)]).toEqual([0, 0]);
  });
});

describe("Q5: visibility", () => {
  it("hidden then visible after MORE than the interval refreshes", async () => {
    renderHook(() => useHumanTaskSync());
    await flush();
    setVisibility("hidden");
    // Stop the timer's own refreshes from muddying the count: look at the gap, not the timer.
    await vi.advanceTimersByTimeAsync(QUEUE_REFRESH_MS - 1);
    const before = count(QUEUE);
    await vi.advanceTimersByTimeAsync(1); // the timer fires here (a refresh), restarting the clock
    const afterTimer = count(QUEUE);
    expect(afterTimer).toBe(before + 1);
    // Make the last refresh older than the interval by pausing the timer path: nothing fires between.
    vi.setSystemTime(Date.now() + QUEUE_REFRESH_MS + 1);
    setVisibility("visible");
    await flush();
    expect(count(QUEUE)).toBe(afterTimer + 1);
    expect(count(NEEDS)).toBe(count(QUEUE));
  });

  it("visible again within the interval: no refresh", async () => {
    renderHook(() => useHumanTaskSync());
    await flush();
    const before = count(QUEUE);
    setVisibility("hidden");
    await vi.advanceTimersByTimeAsync(QUEUE_REFRESH_MS / 2);
    setVisibility("visible");
    await flush();
    expect(count(QUEUE)).toBe(before);
  });

  it("becoming hidden never refreshes", async () => {
    renderHook(() => useHumanTaskSync());
    await flush();
    vi.setSystemTime(Date.now() + QUEUE_REFRESH_MS * 2);
    const before = count(QUEUE);
    setVisibility("hidden");
    await flush();
    expect(count(QUEUE)).toBe(before);
  });
});
