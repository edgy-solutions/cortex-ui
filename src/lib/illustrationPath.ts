/**
 * `gatewayRelativePath` — the guard that keeps `fetchIllustrationContent` (`src/api/client.ts`)
 * from ever handing axios an absolute URL. The minting wrapper attaches the caller's OIDC
 * bearer to every request it sends; if a producer-supplied `content_path` were an absolute URL
 * (same-origin or not), axios would send that bearer to WHATEVER HOST the string names. So this
 * is checked before the fetch, not after, and the function returns the path only when it is
 * unambiguously relative to the gateway's own origin.
 *
 * ENUMERATE THE SAFE SET, not the dangerous one: a path is accepted only when it passes every
 * rule below, rather than being accepted unless it matches a forbidden pattern.
 */
export function gatewayRelativePath(p: unknown): string | null {
  if (typeof p !== "string") return null;
  if (p.length === 0) return null;

  // Exactly one leading "/" — not zero (relative), not two-or-more (protocol-relative, which
  // the browser resolves against WHATEVER HOST follows the slashes).
  if (!p.startsWith("/")) return null;
  if (p.startsWith("//")) return null;

  // No backslash — some host/browser combinations treat a leading `/\` as protocol-relative too.
  if (p.includes("\\")) return null;

  // No scheme anywhere in the string (not just at the front) — a scheme embedded later is still
  // a scheme as far as a consumer that re-parses this string is concerned.
  if (p.includes("://")) return null;

  // No control characters (C0 range or DEL) — nothing that could smuggle a CR/LF or similar
  // into a header or a log line this path later travels through.
  // eslint-disable-next-line no-control-regex
  if (/[\x00-\x1f\x7f]/.test(p)) return null;

  // No ".." PATH SEGMENT — checked segment-wise (split on "/"), not substring, so a real
  // filename like "a..b" is not refused for merely containing two dots.
  if (p.split("/").includes("..")) return null;

  return p;
}
