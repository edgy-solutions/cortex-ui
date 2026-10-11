import { readRuntimeConfig } from "@/config";
import { buildVersion, readDefine } from "@/lib/buildVersion";

/**
 * frontend_version ON THE ASK — the identity this bundle carries, sent with /interview/stream.
 *
 * WHY THE BAKED SHA, NOT THE SERVED ONE. The registration (`App.tsx`) carries
 * `buildVersion().git_sha`. A keyed registry must select THIS TAB's menu, so the ask names the
 * same identity. `/version.json` is only a cross-check: a tab left open across a deploy has a
 * different baked sha than the one now served, and the ask must still name the bundle in memory.
 *
 * FLAG. `VITE_SEND_FRONTEND_VERSION`, default OFF, only the exact string "true" turns it on.
 * The platform discards the field until `InterviewRequest` declares it (see the honour-condition
 * arm in frontendVersion.test.ts), so flipping the default is gated on that.
 */
export const SEND_FRONTEND_VERSION_DEFAULT = false;

export function isSendFrontendVersionEnabled(): boolean {
  const raw = readRuntimeConfig("VITE_SEND_FRONTEND_VERSION").trim();
  return raw === "" ? SEND_FRONTEND_VERSION_DEFAULT : raw === "true";
}

async function readServedSha(fetchImpl: typeof fetch): Promise<string | null> {
  try {
    // transport-exception: same-origin static asset served by nginx with no credential (same as bundleFreshness); not a gated service
    const res = await fetchImpl("/version.json", { cache: "no-store" });
    if (!res.ok) return null;
    const body: unknown = JSON.parse(await res.text());
    if (body === null || typeof body !== "object") return null;
    return readDefine((body as { git_sha?: unknown }).git_sha);
  } catch {
    return null;
  }
}

let memo: Promise<string> | null = null;

/** Test-only: forget the memoised promise so each test starts a fresh page load. */
export function __resetFrontendVersionForTests(): void {
  memo = null;
}

/** Reads /version.json ONCE per page load. Never throws. */
export function loadFrontendVersion(fetchImpl: typeof fetch = fetch): Promise<string> {
  if (memo) return memo;
  memo = (async () => {
    const baked = buildVersion().git_sha;
    const served = await readServedSha(fetchImpl);
    if (baked !== null) {
      if (served !== null && served !== baked) {
        console.warn(
          `frontendVersion: served /version.json sha ${served} differs from this bundle's ${baked}; sending the bundle's own`,
        );
      }
      return baked;
    }
    return served ?? "unstamped";
  })();
  return memo;
}
