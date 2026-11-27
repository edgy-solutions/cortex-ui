/**
 * No card shows the old "Refused (401)" wording (ruled 2026-11-26). Every site that builds a line from a failed
 * call to an authenticated route asks `signInLine` FIRST. This file is the pure sites; the rendered ones sit in
 * `signInWording.render.test.tsx`. Each site has a 401 arm (as the site really receives it) and a 403 arm that
 * still reads the served refusal.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import axios from "axios";
import { SIGN_IN_LINE, SignInRequiredError, registerSignIn, resetAuthGate, signInLine } from "./authGate";
import { classifyExportError } from "@/components/ApprovalTask/ExportProfilePicker";
import { actFailureFallback, actRefusal } from "@/lib/reviewRowEdits";
import { reviewRouteFailure } from "@/lib/promotionReview";
import { readAskableRefusal } from "@/lib/askableMeasures";
import { fetchCase } from "@/lib/cases";
import { config } from "@/config";

const SENTENCE = "Your sign-in expired — signing you in again.";
const axios401 = { isAxiosError: true, response: { status: 401, data: { detail: "Not authenticated" } } };
const axios403 = (detail: unknown) => ({ isAxiosError: true, response: { status: 403, data: { detail } } });

describe("signInLine", () => {
  it("is the SignInRequiredError message for the interceptor's rejection, with or without a status", () => {
    expect(signInLine(new SignInRequiredError(401))).toBe(SENTENCE);
    expect(signInLine(new SignInRequiredError(null))).toBe(SENTENCE);
    expect(SIGN_IN_LINE).toBe(SENTENCE);
  });
  it("is the same sentence for a bare 401 Response and an axios-style 401", () => {
    expect(signInLine(new Response("", { status: 401 }))).toBe(SENTENCE);
    expect(signInLine(axios401)).toBe(SENTENCE);
  });
  it("is null for every other status, a plain Error and a non-error", () => {
    expect(signInLine(new Response("", { status: 403 }))).toBeNull();
    expect(signInLine(axios403("x"))).toBeNull();
    expect(signInLine({ response: { status: "401" } })).toBeNull();
    expect(signInLine(new Error("401"))).toBeNull();
    expect(signInLine(null)).toBeNull();
    expect(signInLine(undefined)).toBeNull();
    expect(signInLine("401")).toBeNull();
  });
});

describe("export failure (ExportProfilePicker / ExportSelectionDialog)", () => {
  it("a 401 reads as sign-in, whether it arrives as the interceptor's error or an axios 401", () => {
    expect(classifyExportError(new SignInRequiredError(401))).toEqual({ kind: "signin" });
    expect(classifyExportError(axios401)).toEqual({ kind: "signin" });
  });
  it("a 403 is still the served refusal", () => {
    expect(classifyExportError(axios403({ error: "not_entitled" }))).toMatchObject({ kind: "refused", status: 403 });
  });
});

describe("grouped-review refusals (actRefusal / actFailureFallback: GroupedReviewTable toasts)", () => {
  it("a 401 reads as sign-in, never 'no status' or 'HTTP 401'", () => {
    expect(actRefusal(new SignInRequiredError(401))).toEqual({ title: SENTENCE });
    expect(actRefusal({ response: { status: 401, data: { detail: [{ loc: ["body", "x"], msg: "bad" }] } } })).toEqual({ title: SENTENCE });
    expect(actFailureFallback("Resolve", new SignInRequiredError(401))).toBe(SENTENCE);
    expect(actFailureFallback("Reject", axios401)).toBe(SENTENCE);
  });
  it("a 403 keeps the old lines", () => {
    expect(actFailureFallback("Resolve", axios403("x"))).toBe("Resolve failed (HTTP 403)");
    expect(actRefusal({ response: { status: 403, data: { detail: [{ loc: ["body", "x"], msg: "bad" }] } } })?.title).toBe(
      "Refused by the platform (403): x: bad",
    );
  });
});

describe("review routes (reviewRouteFailure: PromotionReviewCard, PdfEvidencePane)", () => {
  it("a 401 reads as sign-in on both routes", () => {
    for (const route of ["extraction", "source"] as const) {
      expect(reviewRouteFailure(new SignInRequiredError(401), route)).toBe(SENTENCE);
      expect(reviewRouteFailure(axios401, route)).toBe(SENTENCE);
    }
  });
  it("a 403 keeps the entitlement line", () => {
    expect(reviewRouteFailure(axios403({ error: "x" }), "source")).toMatch(/not entitled to this task's source \(403 x\)/);
  });
});

describe("askable measures refusal (readAskableRefusal)", () => {
  it("a 401 is the sign-in sentence as the reason, not 'unreachable' and not 'refused this (401)'", () => {
    expect(readAskableRefusal(new SignInRequiredError(401))).toEqual({ status: 401, code: null, reason: SENTENCE });
    expect(readAskableRefusal(axios401)).toEqual({ status: 401, code: null, reason: SENTENCE });
  });
  it("a 403 keeps the served reason", () => {
    expect(readAskableRefusal(axios403({ error: "cell_not_entitled", message: "not yours" }))).toEqual({
      status: 403,
      code: "cell_not_entitled",
      reason: "not yours",
    });
  });
});

describe("fetchCase (raw fetch)", () => {
  const KEY = `oidc.user:${config.VITE_KEYCLOAK_REALM_URL}:${config.VITE_KEYCLOAK_CLIENT_ID}`;
  const starter = vi.fn(async () => undefined);
  beforeEach(() => {
    sessionStorage.setItem(KEY, JSON.stringify({ access_token: "tok" }));
    starter.mockClear();
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    sessionStorage.clear();
    resetAuthGate();
  });
  it("a bare 401 Response is sign_in_required, never http_401; sign-in starts once", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 401 })));
    // no gate: the line is shown, and nothing can be started
    expect(await fetchCase("c1")).toEqual({ ok: false, reason: "sign_in_required" });
    expect(starter).not.toHaveBeenCalled();
    // gate active: the transport starts sign-in and throws; fetchCase reads the throw, and a repeat starts nothing more
    registerSignIn(starter);
    expect(await fetchCase("c1")).toEqual({ ok: false, reason: "sign_in_required" });
    expect(await fetchCase("c1")).toEqual({ ok: false, reason: "sign_in_required" });
    expect(starter).toHaveBeenCalledTimes(1);
  });
  it("a 403 is still http_403", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 403 })));
    expect(await fetchCase("c1")).toEqual({ ok: false, reason: "http_403" });
  });
});

describe("client.ts: fetchBffVersion and the shared status line", () => {
  const get = vi.fn();
  beforeEach(() => {
    get.mockReset();
    vi.spyOn(axios, "create").mockReturnValue({
      get,
      post: vi.fn(),
      put: vi.fn(),
      delete: vi.fn(),
      interceptors: { request: { use: vi.fn() }, response: { use: vi.fn() } },
    } as never);
    vi.resetModules();
  });
  afterEach(() => vi.restoreAllMocks());

  it("fetchBffVersion: a 401 is signin; a 500 is still the status", async () => {
    const { fetchBffVersion } = await import("@/api/client");
    const { SignInRequiredError: Fresh } = await import("./authGate"); // resetModules: the class client.ts sees
    get.mockRejectedValueOnce(axios401);
    expect(await fetchBffVersion()).toEqual({ kind: "signin" });
    get.mockRejectedValueOnce(new Fresh(401));
    expect(await fetchBffVersion()).toEqual({ kind: "signin" });
    get.mockRejectedValueOnce({ isAxiosError: true, response: { status: 500, data: {} } });
    expect(await fetchBffVersion()).toEqual({ kind: "error", status: 500 });
  });

  it("fetchDataModuleFigures (throwStatusLine): a 401 throws the sentence, a 403 keeps '<status> <text>'", async () => {
    const { fetchDataModuleFigures } = await import("@/api/client");
    get.mockRejectedValueOnce({ isAxiosError: true, response: { status: 401, statusText: "Unauthorized", data: {} } });
    await expect(fetchDataModuleFigures("u")).rejects.toThrow(SENTENCE);
    get.mockRejectedValueOnce({ isAxiosError: true, response: { status: 403, statusText: "Forbidden", data: {} } });
    await expect(fetchDataModuleFigures("u")).rejects.toThrow("403 Forbidden");
  });

  it("fetchAskableMeasures: a 401 is a refused read carrying the sentence", async () => {
    const { fetchAskableMeasures } = await import("@/api/client");
    const { SignInRequiredError: Fresh } = await import("./authGate");
    get.mockRejectedValueOnce(new Fresh(401));
    expect(await fetchAskableMeasures()).toEqual({ kind: "refused", refusal: { status: 401, code: null, reason: SENTENCE } });
  });
});
