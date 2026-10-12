import { readDefine } from "@/lib/buildVersion";

/**
 * IS THIS TAB RUNNING THE BUNDLE THAT IS SERVED NOW.
 *
 * A tab left open across a deploy keeps its OLD bundle in memory, including the old capability
 * menu. When it registers, it overwrites the new menu with the old one (measured on rev 182:
 * 46 rows, no `mesh#NoticePartSet`, and the PCN question rendered as a document). So before
 * registering, the tab asks the server which sha is served and refuses if it is not its own.
 *
 * UNDECIDABLE IS NOT STALE. A dev server, a missing stamp or an unreachable file means the
 * question cannot be answered; the caller proceeds as it always did rather than blocking
 * registration on an instrument that may simply be absent.
 */
export type Freshness =
  | { kind: "current"; sha: string }
  | { kind: "stale"; mine: string; served: string }
  | { kind: "undecidable"; reason: string };

/** PURE. `served` is the parsed body of `/version.json`; anything unexpected is undecidable. */
export function compareBundle(mine: string | null, served: unknown): Freshness {
  const m = readDefine(mine);
  if (m === null) return { kind: "undecidable", reason: "this bundle carries no sha" };
  const s =
    served !== null && typeof served === "object"
      ? readDefine((served as { git_sha?: unknown }).git_sha)
      : null;
  if (s === null) return { kind: "undecidable", reason: "served version.json carries no sha" };
  return m === s ? { kind: "current", sha: m } : { kind: "stale", mine: m, served: s };
}

/** Never throws. `no-store` because a cached answer is exactly the staleness being measured. */
export async function checkBundleFreshness(
  mine: string | null,
  fetchImpl: typeof fetch = fetch,
): Promise<Freshness> {
  try {
    // transport-exception: same-origin static asset served by nginx with no credential; not a gated service, so it bypasses the minting wrapper deliberately
    const res = await fetchImpl("/version.json", { cache: "no-store" });
    if (!res.ok) return { kind: "undecidable", reason: `version.json HTTP ${res.status}` };
    let body: unknown;
    try {
      // The vite dev server answers unknown paths with index.html, which is not JSON.
      body = JSON.parse(await res.text());
    } catch {
      return { kind: "undecidable", reason: "version.json is not JSON" };
    }
    return compareBundle(mine, body);
  } catch (err) {
    return { kind: "undecidable", reason: err instanceof Error ? err.message : String(err) };
  }
}

/** Re-check cadence for a tab that stays open. Ruled: window focus and every 5 minutes. */
export const BUNDLE_RECHECK_MS = 5 * 60_000;

/**
 * KEEP ASKING WHILE THE TAB LIVES. The only check above rides a registration attempt, and a tab
 * open across a roll makes none, so it never learns it is stale. This re-asks on window focus and
 * on a timer and reports through `onStale` — PILL ONLY, nothing reloads by itself.
 *
 * No new fetch site: it calls `checkBundleFreshness`. SINGLE-FLIGHT: a trigger that arrives while
 * a check is in flight is dropped. Does not check on start; the opening registration already did.
 * Current and undecidable stay silent (no log per tick). Returns a disposer for both triggers.
 */
export function watchBundleFreshness(opts: {
  mine: string | null;
  onStale: (mine: string, served: string) => void;
  intervalMs?: number;
  check?: (mine: string | null) => Promise<Freshness>;
  target?: Pick<Window, "addEventListener" | "removeEventListener">;
}): () => void {
  const { mine, onStale } = opts;
  const check = opts.check ?? ((m: string | null) => checkBundleFreshness(m));
  const target = opts.target ?? window;
  let inFlight = false;
  const run = async () => {
    if (inFlight) return;
    inFlight = true;
    try {
      const fresh = await check(mine);
      if (fresh.kind === "stale") onStale(fresh.mine, fresh.served);
    } catch {
      // checkBundleFreshness never throws; an injected check that does is undecidable too.
    } finally {
      inFlight = false;
    }
  };
  const onFocus = () => void run();
  target.addEventListener("focus", onFocus);
  const timer = setInterval(() => void run(), opts.intervalMs ?? BUNDLE_RECHECK_MS);
  return () => {
    target.removeEventListener("focus", onFocus);
    clearInterval(timer);
  };
}
