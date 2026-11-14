/**
 * The 403 seam: every transport in client.ts reports a 403 through `reportForbidden`, and the caller sees exactly
 * what it saw before. Stubs sit at the lowest seam each transport already uses (axios adapter, the SSE module,
 * `globalThis.fetch`). E4 / E5 / E5-census of the entitlements-once-per-session spec.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import type { AxiosAdapter } from "axios";

const { calls, sse, thrown, adapter } = vi.hoisted(() => ({
  calls: [] as { method: string; url: string }[],
  sse: { status: 200 },
  // The one error object the axios adapter throws, so "re-rejected unchanged" is an identity check.
  thrown: { err: null as unknown },
  adapter: { status: 403 },
}));

vi.mock("axios", async (importOriginal) => {
  const mod = await importOriginal<typeof import("axios")>();
  const real = mod.default;
  const realCreate = real.create.bind(real);
  const capture: AxiosAdapter = async (config) => {
    calls.push({ method: String(config.method).toUpperCase(), url: String(config.url) });
    const err = new mod.AxiosError("failed", "ERR_BAD_REQUEST", config, null, {
      status: adapter.status,
      statusText: "x",
      data: { detail: "no" },
      headers: {},
      config,
    });
    thrown.err = err;
    throw err;
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

vi.mock("@microsoft/fetch-event-source", () => ({
  // Mirrors the library: a non-ok open is thrown into the caller's onopen, whose throw reaches onerror, whose throw rejects.
  fetchEventSource: vi.fn(
    async (_url: string, opts: { onopen: (r: Response) => Promise<void>; onerror: (e: unknown) => void }) => {
      try {
        await opts.onopen(new Response("no", { status: sse.status, headers: { "content-type": "text/plain" } }));
      } catch (e) {
        opts.onerror(e);
      }
    },
  ),
}));
vi.mock("@/lib/frontendVersion", () => ({
  isSendFrontendVersionEnabled: () => false,
  loadFrontendVersion: async () => "0123456",
}));

import * as client from "./client";
import { onForbidden } from "./forbidden";

const reported: string[] = [];
let off: () => void;
beforeEach(() => {
  calls.length = 0;
  reported.length = 0;
  thrown.err = null;
  sse.status = 200;
  adapter.status = 403;
  off = onForbidden((op) => reported.push(op));
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  off();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

/** One arm PER transport in client.ts. The census below keeps this set equal to what client.ts contains. */
const ARMS: Record<string, () => Promise<void>> = {
  axios: async () => {
    // Not /me/entitlements (that route never reports): any other declared route.
    const err = await client
      .requestFull("GET /reviews/{workflow_id}/batch", { path: { workflow_id: "w1" } } as never)
      .then(
        () => null,
        (e) => e,
      );
    expect(err, "the error is the very object the adapter threw").toBe(thrown.err);
    expect((err as { response: { status: number } }).response.status).toBe(403);
    expect(reported).toEqual(["GET /reviews/w1/batch"]);
  },
  streamInterviewResponse: async () => {
    sse.status = 403;
    const err = await client.streamInterviewResponse({ message: "m", session_id: "s" } as never, () => {}).then(
      () => null,
      (e) => e,
    );
    expect(err).toBeInstanceOf(Response);
    expect((err as Response).status).toBe(403);
    expect(reported).toEqual(["POST /interview/stream"]);
  },
  saveCanvasesUrgently: async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("no", { status: 403 })));
    await expect(client.saveCanvasesUrgently([])).resolves.toBeUndefined();
    expect(reported).toEqual(["PUT /me/canvases"]);
  },
  fetchCaseResponse: async () => {
    const res = new Response("no", { status: 403 });
    vi.stubGlobal("fetch", vi.fn(async () => res));
    await expect(client.fetchCaseResponse("c1")).resolves.toBe(res);
    expect(reported).toEqual(["GET /cases/{case_id}"]);
  },
};

describe("E5: every transport reports a 403 and leaves the caller's view unchanged", () => {
  for (const [name, arm] of Object.entries(ARMS)) it(name, arm);

  it("control: a non-403 failure reports nothing (axios)", async () => {
    adapter.status = 500;
    const err = await client
      .requestFull("GET /reviews/{workflow_id}/batch", { path: { workflow_id: "w1" } } as never)
      .then(
        () => null,
        (e) => e,
      );
    expect(err).toBe(thrown.err);
    expect(reported).toEqual([]);
  });
});

describe("E4: GET /me/entitlements never reports its own 403", () => {
  it("rejects with the same error, reports nothing, and issues exactly one request", async () => {
    const err = await client.fetchEntitlements().then(
      () => null,
      (e) => e,
    );
    expect(err).toBe(thrown.err);
    expect((err as { response: { status: number } }).response.status).toBe(403);
    expect(reported).toEqual([]);
    expect(calls).toEqual([{ method: "GET", url: "/me/entitlements" }]);
  });
});

describe("E5-census: the transports in client.ts are the arms above", () => {
  it("every function that makes an outbound call, plus the axios instance, has an arm", () => {
    const text = readFileSync(path.join(__dirname, "client.ts"), "utf8");
    const found = new Set<string>();
    let fn = "<module>";
    const TRANSPORT = /\b(fetch|fetchEventSource|sendBeacon)\(|new\s+(EventSource|XMLHttpRequest|WebSocket)\b/;
    for (const raw of text.split(/\r?\n/)) {
      const t = raw.trim();
      if (t.startsWith("*") || t.startsWith("//") || t.startsWith("/*") || t.startsWith("import ")) continue;
      const m = /^(?:export\s+)?(?:async\s+)?function\s+(\w+)/.exec(raw);
      if (m) fn = m[1];
      if (/\baxios\.create\(/.test(raw)) found.add("axios");
      if (TRANSPORT.test(raw)) found.add(fn);
    }
    // Positive control: the scan saw the sites it is meant to see, so an empty or shifted scan cannot pass as "equal".
    expect(found.size).toBeGreaterThanOrEqual(4);
    expect([...found].sort()).toEqual(Object.keys(ARMS).sort());
  });
});
