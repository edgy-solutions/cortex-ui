/**
 * Deep links into cortex: `/case/{id}` and `/ask?q=<text>`. There is no router; this is the whole
 * vocabulary. ENUMERATED SAFE SET: only these two shapes are links, everything else is null.
 * Exact, case-sensitive path match.
 */
export type DeepLink = { kind: "case"; caseId: string } | { kind: "ask"; q: string };

const MAX_CASE_ID = 512;
const MAX_Q = 4000;

export function readDeepLink(pathname: string, search: string): DeepLink | null {
  const c = /^\/case\/([^/]+)\/?$/.exec(pathname);
  if (c) {
    let id: string;
    try {
      id = decodeURIComponent(c[1]);
    } catch {
      return null;
    }
    if (id.trim() === "" || id.length > MAX_CASE_ID) return null;
    return { kind: "case", caseId: id };
  }
  if (pathname === "/ask" || pathname === "/ask/") {
    const q = new URLSearchParams(search).get("q");
    if (q === null || q.trim() === "" || q.length > MAX_Q) return null;
    return { kind: "ask", q };
  }
  return null;
}

export function deepLinkPath(link: DeepLink): string {
  return link.kind === "case"
    ? `/case/${encodeURIComponent(link.caseId)}`
    : `/ask?q=${encodeURIComponent(link.q)}`;
}

export function returnToFor(loc: { pathname: string; search: string }): string | undefined {
  const link = readDeepLink(loc.pathname, loc.search);
  return link ? deepLinkPath(link) : undefined;
}

/** OIDC `state` comes back from the network round trip: accept only `{returnTo}` that re-parses
 *  as a same-origin deep link, and hand back the CANONICAL path, never the raw string. */
export function safeReturnTo(state: unknown): string | null {
  if (typeof state !== "object" || state === null) return null;
  const r = (state as { returnTo?: unknown }).returnTo;
  if (typeof r !== "string") return null;
  if (!r.startsWith("/") || r.startsWith("//") || r.includes("\\")) return null;
  let u: URL;
  try {
    u = new URL(r, "https://cortex.invalid");
  } catch {
    return null;
  }
  if (u.origin !== "https://cortex.invalid") return null;
  const link = readDeepLink(u.pathname, u.search);
  return link ? deepLinkPath(link) : null;
}

/**
 * THE BROKER MARKER (the architect, 2026-10-17, approved as proposed): `?idp=openddil` on either
 * link shape selects OpenDDIL's login (Keycloak's `kc_idp_hint`) and starts it without the button
 * click (`RequireAuth`). Opt-in and ENUMERATED: any other value, any other spelling, or the marker
 * on a path that is not a link is ignored, and a link without it keeps the local login, because
 * cortex cannot tell a brokered person from a local one before login.
 *
 * The marker never rides in `returnTo` (`deepLinkPath` rebuilds the link without it), and the
 * redirect URI is the bare origin, so the return trip cannot start a second login.
 */
const IDP_HINTS = ["openddil"] as const;
export type IdpHint = (typeof IDP_HINTS)[number];

export function idpHintFor(loc: { pathname: string; search: string }): IdpHint | null {
  if (!readDeepLink(loc.pathname, loc.search)) return null;
  const v = new URLSearchParams(loc.search).get("idp");
  return IDP_HINTS.find((h) => h === v) ?? null;
}

export type SigninArgs = { state: { returnTo: string }; extraQueryParams?: { kc_idp_hint: IdpHint } };

/** Argument for every `signinRedirect`: undefined off a deep link, so a plain `/` login is unchanged. */
export function signinArgs(): SigninArgs | undefined {
  const returnTo = returnToFor(window.location);
  if (returnTo === undefined) return undefined;
  const hint = idpHintFor(window.location);
  return hint ? { state: { returnTo }, extraQueryParams: { kc_idp_hint: hint } } : { state: { returnTo } };
}

/** `onSigninCallback`: strip code/state from the URL, landing on the carried deep link if safe. */
export function afterSignin(user: { state?: unknown } | undefined | void): void {
  const to = safeReturnTo(user?.state);
  window.history.replaceState({}, document.title, to ?? window.location.pathname);
}
