/**
 * `fetchCase` — the REAL function, with `globalThis.fetch` stubbed at the HTTP level (so the
 * URL, method and headers it actually sends are what is asserted, not a mock of the function).
 * Fixtures: `cases.fixtures.ts` — producer-test-derived or hand-built, NOT a live capture.
 */
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { config } from "@/config";
import { fetchCase, readWorkflowCasePayload } from "./cases";
import {
  CASE_ID,
  CASE_PAYLOAD_INVALID_HAND_BUILT,
  CASE_PAYLOAD_PRODUCER_TEST_DERIVED,
} from "./cases.fixtures";

const TOKEN = "tok-abc";
const STORAGE_KEY = `oidc.user:${config.VITE_KEYCLOAK_REALM_URL}:${config.VITE_KEYCLOAK_CLIENT_ID}`;

function stubFetch(status: number, body: unknown, rawBody?: string) {
  const fn = vi.fn(async (_url: unknown, _init?: unknown) =>
    new Response(rawBody ?? JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json" },
    }),
  );
  vi.stubGlobal("fetch", fn);
  return fn;
}

beforeEach(() => {
  sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ access_token: TOKEN }));
});
afterEach(() => {
  vi.unstubAllGlobals();
  sessionStorage.clear();
});

describe("fetchCase — the request it sends", () => {
  it("GETs {API}/cases/{encoded id} with the caller's bearer", async () => {
    const fn = stubFetch(200, CASE_PAYLOAD_PRODUCER_TEST_DERIVED);
    await fetchCase("case/1 x");
    expect(fn).toHaveBeenCalledTimes(1);
    const [url, init] = fn.mock.calls[0] as [string, RequestInit & { headers: Record<string, string> }];
    expect(url).toBe(`${config.VITE_API_URL}/cases/${encodeURIComponent("case/1 x")}`);
    expect(url).toContain("case%2F1%20x");
    expect(init.method).toBe("GET");
    expect(init.headers.Authorization).toBe(`Bearer ${TOKEN}`);
    expect(init.headers["X-Trace-Id"]).toBeTruthy();
    expect(init.headers["X-Session-Id"]).toBeTruthy();
  });
});

describe("fetchCase — each outcome", () => {
  it("200 + a readable body → ok, payload carried verbatim", async () => {
    stubFetch(200, CASE_PAYLOAD_PRODUCER_TEST_DERIVED);
    expect(await fetchCase(CASE_ID)).toEqual({ ok: true, payload: CASE_PAYLOAD_PRODUCER_TEST_DERIVED });
  });

  it("200 + an invalid body → invalid_case_payload, with a detail naming what is wrong", async () => {
    stubFetch(200, CASE_PAYLOAD_INVALID_HAND_BUILT);
    const r = await fetchCase(CASE_ID);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.reason).toBe("invalid_case_payload");
      expect("detail" in r && r.detail).toMatch(/instances\[0\]\.definition is not an object/);
    }
  });

  it("200 + a non-JSON body → invalid_case_payload", async () => {
    stubFetch(200, null, "<html>");
    const r = await fetchCase(CASE_ID);
    expect(r).toEqual({ ok: false, reason: "invalid_case_payload", detail: "body is not JSON" });
  });

  it("404 → not_found (absent and not-entitled are one answer)", async () => {
    stubFetch(404, { detail: "case not found" });
    expect(await fetchCase(CASE_ID)).toEqual({ ok: false, reason: "not_found" });
  });

  it("503 → runner_unavailable", async () => {
    stubFetch(503, { detail: { error: "runner_unavailable" } });
    expect(await fetchCase(CASE_ID)).toEqual({ ok: false, reason: "runner_unavailable" });
  });

  it("500 → http_500", async () => {
    stubFetch(500, { detail: "boom" });
    expect(await fetchCase(CASE_ID)).toEqual({ ok: false, reason: "http_500" });
  });
});

describe("readWorkflowCasePayload", () => {
  it("accepts the producer-test-derived payload", () => {
    expect(readWorkflowCasePayload(CASE_PAYLOAD_PRODUCER_TEST_DERIVED).ok).toBe(true);
  });
  it("refuses null, an array, and a payload without instances", () => {
    expect(readWorkflowCasePayload(null).ok).toBe(false);
    expect(readWorkflowCasePayload([]).ok).toBe(false);
    expect(readWorkflowCasePayload({ subject_ref: "c" }).ok).toBe(false);
  });
});

describe("a live capture", () => {
  it.todo("a live GET /cases capture — ask Lane 1 for one on rev ≥177");
});
