/**
 * The sign-in gate at the axios seam (ruling 2026-11-25): no call leaves the browser until a signed-in user exists;
 * a 401 starts sign-in once; a 403 is untouched; no-auth mode is a pass-through.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { AxiosAdapter, InternalAxiosRequestConfig } from "axios";

const { seen, mode } = vi.hoisted(() => ({
  seen: [] as { auth: unknown }[],
  mode: { status: 200 },
}));

vi.mock("axios", async (importOriginal) => {
  const mod = await importOriginal<typeof import("axios")>();
  const real = mod.default;
  const realCreate = real.create.bind(real);
  const capture: AxiosAdapter = async (config: InternalAxiosRequestConfig) => {
    seen.push({ auth: config.headers?.Authorization });
    const res = { status: mode.status, statusText: "x", data: { detail: "x" }, headers: {}, config };
    if (mode.status >= 400) throw new mod.AxiosError("failed", "ERR_BAD_REQUEST", config, null, res);
    return res;
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
vi.mock("@/lib/frontendVersion", () => ({
  isSendFrontendVersionEnabled: () => false,
  loadFrontendVersion: async () => "0123456",
}));

import * as client from "./client";
import { onForbidden } from "./forbidden";
import { SignInRequiredError, SIGN_IN_WAIT_MS, notifyUser, registerSignIn, resetAuthGate, setPassThrough } from "@/auth/authGate";
import { config } from "@/config";

const STORAGE_KEY = `oidc.user:${config.VITE_KEYCLOAK_REALM_URL}:${config.VITE_KEYCLOAK_CLIENT_ID}`;
const call = () => client.requestFull("GET /reviews/{workflow_id}/batch", { path: { workflow_id: "w1" } } as never);
const starter = vi.fn(async () => undefined);

beforeEach(() => {
  seen.length = 0;
  mode.status = 200;
  starter.mockClear();
  sessionStorage.clear();
  resetAuthGate();
  registerSignIn(starter);
  vi.spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  resetAuthGate();
  sessionStorage.clear();
});

describe("axios calls wait for a signed-in user", () => {
  it("is not sent until a user is notified, then goes out WITH the Bearer", async () => {
    const p = call();
    await Promise.resolve();
    await new Promise((r) => setTimeout(r, 20));
    expect(seen.length, "no adapter call before the user exists").toBe(0);
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ access_token: "tok-1" }));
    notifyUser({ access_token: "tok-1" });
    await p;
    expect(seen).toEqual([{ auth: "Bearer tok-1" }]);
  });

  it("a user who never arrives: rejects SignInRequiredError, nothing sent, sign-in started once", async () => {
    vi.useFakeTimers();
    const p = call().then(
      () => null,
      (e) => e,
    );
    await vi.advanceTimersByTimeAsync(SIGN_IN_WAIT_MS + 1);
    const err = await p;
    expect(err).toBeInstanceOf(SignInRequiredError);
    expect(seen.length).toBe(0);
    expect(starter).toHaveBeenCalledTimes(1);
  });

  it("a stored user goes out at once", async () => {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ access_token: "tok-2" }));
    await call();
    expect(seen).toEqual([{ auth: "Bearer tok-2" }]);
  });
});

describe("a 401 starts sign-in", () => {
  beforeEach(() => sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ access_token: "tok" })));

  it("starts it once and rejects SignInRequiredError carrying 401", async () => {
    mode.status = 401;
    const err = await call().then(
      () => null,
      (e) => e,
    );
    expect(err).toBeInstanceOf(SignInRequiredError);
    expect((err as SignInRequiredError).status).toBe(401);
    expect(starter).toHaveBeenCalledTimes(1);
  });

  it("two concurrent 401s still start it once", async () => {
    mode.status = 401;
    const r = await Promise.allSettled([call(), call()]);
    expect(r.every((x) => x.status === "rejected")).toBe(true);
    expect(starter).toHaveBeenCalledTimes(1);
  });

  it("a 403 is unchanged: same axios error, no sign-in", async () => {
    mode.status = 403;
    const reported: string[] = [];
    const off = onForbidden((op) => reported.push(op));
    const err = await call().then(
      () => null,
      (e) => e,
    );
    expect(err).not.toBeInstanceOf(SignInRequiredError);
    expect((err as { response: { status: number } }).response.status).toBe(403);
    expect(starter).not.toHaveBeenCalled();
    off();
    expect(reported).toEqual(["GET /reviews/w1/batch"]);
  });
});

describe("no-auth mode", () => {
  it("sends at once with no header and never starts sign-in, even on a 401", async () => {
    setPassThrough(true);
    await call();
    expect(seen).toEqual([{ auth: undefined }]);
    mode.status = 401;
    const err = await call().then(
      () => null,
      (e) => e,
    );
    expect(err).not.toBeInstanceOf(SignInRequiredError);
    expect(starter).not.toHaveBeenCalled();
  });
});
