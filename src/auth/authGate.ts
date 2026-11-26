/**
 * The sign-in gate (ruled 2026-11-25): hold API calls until a signed-in user exists, and start sign-in on a 401.
 *
 * Pure module, no React. Three parties:
 *  - the transports in `api/client.ts` ask `waitForToken` before they send, and call `requireSignIn("401")` on a 401;
 *  - `AuthProvider` registers the starter (`registerSignIn`) and reports the user (`notifyUser`);
 *  - `RequireAuth` (the one reader of the no-auth flag) declares the pass-through (`setPassThrough`).
 *
 * The gate is ACTIVE only once a starter is registered and the pass-through is off. With no provider mounted there is
 * no sign-in to wait for, so a call goes out as it always did (this is what keeps provider-less unit tests unchanged).
 */
import { config } from "@/config";

/** How long a call may wait for a signed-in user before it is refused without leaving the browser. */
export const SIGN_IN_WAIT_MS = 10_000;

/** sessionStorage key for the typed question held across the full-page sign-in redirect. */
export const SIGNIN_DRAFT_KEY = "cortex-signin-draft";

export class SignInRequiredError extends Error {
  readonly name = "SignInRequiredError";
  /** The BFF status that caused it (401), or null when no call was ever sent (the wait timed out). */
  readonly status: number | null;
  constructor(status: number | null = null, message = "Your sign-in expired — signing you in again.") {
    super(message);
    this.status = status;
  }
}

export function isSignInRequired(err: unknown): err is SignInRequiredError {
  return err instanceof SignInRequiredError;
}

type User = { access_token?: string } | null | undefined;

let starter: (() => Promise<unknown>) | null = null;
let passThrough = false;
let inFlight = false;
let draftSaver: (() => void) | null = null;
const waiters = new Set<(token: string) => void>();

/** The one reader of the stored OIDC user (the react-oidc-context sessionStorage pattern). */
export function currentToken(): string | null {
  const storageKey = `oidc.user:${config.VITE_KEYCLOAK_REALM_URL}:${config.VITE_KEYCLOAK_CLIENT_ID}`;
  let raw: string | null = null;
  try {
    raw = sessionStorage.getItem(storageKey);
  } catch {
    return null;
  }
  if (!raw) return null;
  try {
    return JSON.parse(raw)?.access_token || null;
  } catch {
    return null;
  }
}

/** True when the gate will hold calls and redirect: a starter is registered and no-auth is not in force. */
export function gateActive(): boolean {
  return starter !== null && !passThrough;
}

export function setPassThrough(on: boolean): void {
  passThrough = on;
}

export function registerSignIn(fn: (() => Promise<unknown>) | null): void {
  starter = fn;
  inFlight = false;
}

export function registerDraftSaver(fn: (() => void) | null): () => void {
  draftSaver = fn;
  return () => {
    if (draftSaver === fn) draftSaver = null;
  };
}

/** The provider reports the user on load / removal. A user with a token releases every waiting call. */
export function notifyUser(user: User): void {
  const token = user?.access_token;
  if (!token) return;
  inFlight = false;
  const held = [...waiters];
  waiters.clear();
  for (const w of held) w(token);
}

/** Start sign-in ONCE: idempotent while one is in flight. The draft is saved before the redirect. */
export function requireSignIn(reason: string): void {
  if (!gateActive() || inFlight || starter === null) return;
  inFlight = true;
  try {
    draftSaver?.();
  } catch {
    /* a draft that cannot be saved must not stop the sign-in */
  }
  console.warn(`[auth] sign-in required (${reason})`);
  starter().catch((e) => {
    console.error("[auth] sign-in start failed:", e);
    inFlight = false;
  });
}

/** A token now, or the next one the provider announces; a timeout refuses with SignInRequiredError and starts sign-in. */
export function waitForToken(timeoutMs: number = SIGN_IN_WAIT_MS): Promise<string | null> {
  if (!gateActive()) return Promise.resolve(currentToken());
  const now = currentToken();
  if (now) return Promise.resolve(now);
  return new Promise((resolve, reject) => {
    const w = (t: string) => {
      clearTimeout(timer);
      resolve(t);
    };
    const timer = setTimeout(() => {
      waiters.delete(w);
      requireSignIn("no user");
      reject(new SignInRequiredError(null));
    }, timeoutMs);
    waiters.add(w);
  });
}

/** A 401 on any transport: start sign-in (once) and hand back the error to throw. */
export function onUnauthorized(): SignInRequiredError {
  requireSignIn("401");
  return new SignInRequiredError(401);
}

// ── The typed question across the redirect ──────────────────
export function saveDraft(text: string): void {
  try {
    if (text) sessionStorage.setItem(SIGNIN_DRAFT_KEY, text);
  } catch {
    /* no persistence available */
  }
}

/** Read-and-delete: a draft is restored once. */
export function takeDraft(): string | null {
  try {
    const t = sessionStorage.getItem(SIGNIN_DRAFT_KEY);
    if (t !== null) sessionStorage.removeItem(SIGNIN_DRAFT_KEY);
    return t || null;
  } catch {
    return null;
  }
}

/** Test seam: back to the module's initial state. */
export function resetAuthGate(): void {
  starter = null;
  passThrough = false;
  inFlight = false;
  draftSaver = null;
  waiters.clear();
}
