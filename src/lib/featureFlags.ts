/**
 * featureFlags — the registry of runtime feature flags and the one reader every flag-gated
 * module should call.
 *
 * Where the value comes from: the chart's env map (`VITE_FEATURES`, a comma-separated list of
 * flag names, e.g. `"canvasExport,ingest"`) → `docker-entrypoint.sh` sanitizes it and writes it
 * into `window.__RUNTIME_CONFIG__.VITE_FEATURES` via `/config.js` → `src/config.ts`'s
 * `readRuntimeConfig` reads it live → `isFeatureEnabled` here parses and checks it.
 *
 * To add the next flag: add its name to `FEATURE_FLAGS` below, then deploy it by adding the
 * name to the chart's `VITE_FEATURES` value. No localStorage change, no entrypoint edit, no
 * chart-template change (the env map is already rendered generically).
 *
 * localStorage remains a per-browser override ONLY (`cortex.<flag>` === "1") — useful for local
 * dev or an individual operator's browser, but it is never how a flag reaches a deployment.
 */

import { readRuntimeConfig } from "@/config";

export const FEATURE_FLAGS = ["canvasExport", "ingest", "ingestMock"] as const;
export type FeatureFlag = (typeof FEATURE_FLAGS)[number];

const FLAG_SET: ReadonlySet<string> = new Set(FEATURE_FLAGS);

export function parseFeatureList(raw: string | undefined): {
  enabled: Set<FeatureFlag>;
  unknown: string[];
} {
  const enabled = new Set<FeatureFlag>();
  const unknown: string[] = [];
  const seenUnknown = new Set<string>();

  for (const rawName of (raw ?? "").split(",")) {
    const name = rawName.trim();
    if (!name) continue;
    if (FLAG_SET.has(name)) {
      enabled.add(name as FeatureFlag);
    } else if (!seenUnknown.has(name)) {
      seenUnknown.add(name);
      unknown.push(name);
    }
  }

  return { enabled, unknown };
}

// Module-level latch: warn about an unknown flag name at most once per page load. A typo in the
// chart's VITE_FEATURES must not silently do nothing, but it also must not spam the console on
// every isFeatureEnabled() call (there are three call sites today, more later).
let hasWarnedUnknown = false;

/** Test-only escape hatch so each test can assert the warning fires fresh. */
export function __resetFeatureFlagWarningForTests(): void {
  hasWarnedUnknown = false;
}

export function isFeatureEnabled(flag: FeatureFlag): boolean {
  if (typeof window !== "undefined") {
    try {
      if (window.localStorage.getItem(`cortex.${flag}`) === "1") return true;
    } catch {
      /* ignore */
    }
  }

  const { enabled, unknown } = parseFeatureList(readRuntimeConfig("VITE_FEATURES"));
  if (unknown.length > 0 && !hasWarnedUnknown) {
    hasWarnedUnknown = true;
    console.warn(
      `featureFlags: unknown flag name(s) in VITE_FEATURES: ${unknown.join(", ")}. ` +
        `Known flags: ${FEATURE_FLAGS.join(", ")}.`
    );
  }
  return enabled.has(flag);
}
