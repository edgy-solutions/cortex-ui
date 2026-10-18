import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, cleanup, screen, fireEvent, act } from "@testing-library/react";

/**
 * The broker marker's auto-start (the architect, 2026-10-17): `?idp=openddil` on a deep link
 * starts the login once, with the IdP hint, and nothing else does. A plain link keeps the button.
 * Each arm below is a condition the start must wait on or refuse.
 */
type FakeAuth = {
  isLoading: boolean;
  isAuthenticated: boolean;
  error: Error | undefined;
  activeNavigator: string | undefined;
  signinRedirect: ReturnType<typeof vi.fn>;
};
let auth: FakeAuth;
vi.mock("react-oidc-context", () => ({ useAuth: () => auth }));
const cfg = vi.hoisted(() => ({ VITE_NO_AUTH: "false" }));
vi.mock("@/config", () => ({ config: cfg }));

import { RequireAuth } from "./RequireAuth";

const go = (path: string) => window.history.replaceState({}, "", path);
const mount = () => render(<RequireAuth><div data-testid="app" /></RequireAuth>);
const flush = () => act(async () => { await Promise.resolve(); await Promise.resolve(); });
const HINTED = { state: { returnTo: "/case/C1" }, extraQueryParams: { kc_idp_hint: "openddil" } };

beforeEach(() => {
  cfg.VITE_NO_AUTH = "false";
  auth = { isLoading: false, isAuthenticated: false, error: undefined, activeNavigator: undefined, signinRedirect: vi.fn().mockResolvedValue(undefined) };
});
afterEach(() => { cleanup(); go("/"); });

describe("RequireAuth: the broker marker starts the login", () => {
  it("a marked link starts the hinted login once, with no button, and a re-render does not start another", async () => {
    go("/case/C1?idp=openddil");
    const r = mount();
    await flush();
    expect(auth.signinRedirect).toHaveBeenCalledTimes(1);
    expect(auth.signinRedirect).toHaveBeenCalledWith(HINTED);
    expect(document.querySelector('[data-auth-pending="brokered"]')).not.toBeNull();
    expect(screen.queryByText("Synchronize Identity")).toBeNull();
    auth = { ...auth };
    r.rerender(<RequireAuth><div data-testid="app" /></RequireAuth>);
    await flush();
    expect(auth.signinRedirect).toHaveBeenCalledTimes(1);
  });

  it("an /ask link with the marker starts it too, and returnTo drops the marker", async () => {
    go("/ask?q=Why&idp=openddil");
    mount();
    await flush();
    expect(auth.signinRedirect).toHaveBeenCalledWith({ state: { returnTo: "/ask?q=Why" }, extraQueryParams: { kc_idp_hint: "openddil" } });
  });

  it.each(["/case/C1", "/case/C1?idp=keycloak", "/case/C1?idp=OpenDDIL", "/?idp=openddil"])(
    "%s starts nothing and shows the button",
    async (path) => {
      go(path);
      mount();
      await flush();
      expect(auth.signinRedirect).not.toHaveBeenCalled();
      expect(screen.getByText("Synchronize Identity")).toBeTruthy();
    },
  );

  it("a plain link's button logs in locally: the link rides, no hint", async () => {
    go("/case/C1");
    mount();
    fireEvent.click(screen.getByText("Synchronize Identity"));
    expect(auth.signinRedirect).toHaveBeenCalledWith({ state: { returnTo: "/case/C1" } });
  });

  it("waits while the session is loading, then starts once it is not", async () => {
    go("/case/C1?idp=openddil");
    auth.isLoading = true;
    const r = mount();
    await flush();
    expect(auth.signinRedirect).not.toHaveBeenCalled();
    auth = { ...auth, isLoading: false };
    r.rerender(<RequireAuth><div data-testid="app" /></RequireAuth>);
    await flush();
    expect(auth.signinRedirect).toHaveBeenCalledTimes(1);
  });

  it("a login that came back with an error is NOT restarted: the error screen shows", async () => {
    go("/case/C1?idp=openddil");
    auth.error = new Error("access_denied");
    mount();
    await flush();
    expect(auth.signinRedirect).not.toHaveBeenCalled();
    expect(screen.getByText("access_denied")).toBeTruthy();
  });

  it("a navigator already in flight is not doubled", async () => {
    go("/case/C1?idp=openddil");
    auth.activeNavigator = "signinRedirect";
    mount();
    await flush();
    expect(auth.signinRedirect).not.toHaveBeenCalled();
  });

  it("an authenticated person on a marked link is not sent to log in", async () => {
    go("/case/C1?idp=openddil");
    auth.isAuthenticated = true;
    mount();
    await flush();
    expect(auth.signinRedirect).not.toHaveBeenCalled();
    expect(screen.getByTestId("app")).toBeTruthy();
  });

  it("a start that fails falls back to the button, and does not retry by itself", async () => {
    go("/case/C1?idp=openddil");
    auth.signinRedirect.mockRejectedValue(new Error("network"));
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    mount();
    await flush();
    expect(screen.getByText("Synchronize Identity")).toBeTruthy();
    expect(auth.signinRedirect).toHaveBeenCalledTimes(1);
    err.mockRestore();
  });

  it("with auth disabled, nothing starts and the app renders", async () => {
    go("/case/C1?idp=openddil");
    cfg.VITE_NO_AUTH = "true";
    mount();
    await flush();
    expect(auth.signinRedirect).not.toHaveBeenCalled();
    expect(screen.getByTestId("app")).toBeTruthy();
  });
});
