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

/** Argument for every `signinRedirect`: undefined off a deep link, so a plain `/` login is unchanged. */
export function signinArgs(): { state: { returnTo: string } } | undefined {
  const returnTo = returnToFor(window.location);
  return returnTo === undefined ? undefined : { state: { returnTo } };
}

/** `onSigninCallback`: strip code/state from the URL, landing on the carried deep link if safe. */
export function afterSignin(user: { state?: unknown } | undefined | void): void {
  const to = safeReturnTo(user?.state);
  window.history.replaceState({}, document.title, to ?? window.location.pathname);
}
