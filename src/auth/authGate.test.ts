import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  SIGNIN_DRAFT_KEY,
  SignInRequiredError,
  gateActive,
  notifyUser,
  registerDraftSaver,
  registerSignIn,
  requireSignIn,
  resetAuthGate,
  saveDraft,
  takeDraft,
  waitForToken,
} from "./authGate";

const starter = vi.fn(async () => undefined);
beforeEach(() => {
  starter.mockClear();
  sessionStorage.clear();
  resetAuthGate();
  vi.spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(() => {
  vi.restoreAllMocks();
  resetAuthGate();
});

describe("the gate is active only with a registered starter", () => {
  it("no provider: waitForToken passes through and requireSignIn does nothing", async () => {
    expect(gateActive()).toBe(false);
    await expect(waitForToken(5)).resolves.toBeNull();
    requireSignIn("401");
    expect(starter).not.toHaveBeenCalled();
  });
});

describe("requireSignIn", () => {
  it("is idempotent while one is in flight, and starts again after a user arrives", () => {
    registerSignIn(starter);
    requireSignIn("401");
    requireSignIn("401");
    expect(starter).toHaveBeenCalledTimes(1);
    notifyUser({ access_token: "t" });
    requireSignIn("401");
    expect(starter).toHaveBeenCalledTimes(2);
  });

  it("waitForToken times out with SignInRequiredError and starts sign-in once", async () => {
    registerSignIn(starter);
    await expect(waitForToken(5)).rejects.toBeInstanceOf(SignInRequiredError);
    expect(starter).toHaveBeenCalledTimes(1);
  });
});

describe("the typed question across the redirect", () => {
  it("is saved BEFORE the redirect starts, restored once, and the key is removed", () => {
    const order: string[] = [];
    registerSignIn(async () => {
      order.push("redirect");
    });
    registerDraftSaver(() => {
      order.push("save");
      saveDraft("what is the exposure?");
    });
    requireSignIn("401");
    expect(order).toEqual(["save", "redirect"]);
    expect(sessionStorage.getItem(SIGNIN_DRAFT_KEY)).toBe("what is the exposure?");
    expect(takeDraft()).toBe("what is the exposure?");
    expect(sessionStorage.getItem(SIGNIN_DRAFT_KEY)).toBeNull();
    expect(takeDraft()).toBeNull();
  });

  it("an empty composer saves nothing", () => {
    saveDraft("");
    expect(sessionStorage.getItem(SIGNIN_DRAFT_KEY)).toBeNull();
  });
});
