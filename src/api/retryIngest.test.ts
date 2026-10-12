/** `retryIngest` — POST to the retry path through the REAL axios pipeline, with NO body (not `{}`). */
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { AxiosAdapter, InternalAxiosRequestConfig } from "axios";

const { seen } = vi.hoisted(() => ({ seen: [] as InternalAxiosRequestConfig[] }));

vi.mock("axios", async (importOriginal) => {
  const mod = await importOriginal<typeof import("axios")>();
  const real = mod.default;
  const realCreate = real.create.bind(real);
  const capture: AxiosAdapter = async (config) => {
    seen.push(config);
    return { data: { ingest_id: "x", stage: "received", attempt: 2 }, status: 200, statusText: "OK", headers: {}, config };
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

import { retryIngest } from "./client";

beforeEach(() => {
  seen.length = 0;
});

describe("retryIngest", () => {
  it("POSTs the encoded retry path with NO body, and returns the data", async () => {
    const data = await retryIngest("sha256:abc");
    expect(seen).toHaveLength(1);
    expect(seen[0].method).toBe("post");
    expect(seen[0].url).toBe("/ingest/sha256%3Aabc/retry");
    expect(seen[0].data, "a body was sent; the route takes none").toBeUndefined();
    expect(data).toEqual({ ingest_id: "x", stage: "received", attempt: 2 });
  });
});
