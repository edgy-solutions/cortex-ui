/**
 * ingestFlag — the two ADR-0041 ingest UI flags.
 *
 * Backed by the runtime feature-flag registry (`src/lib/featureFlags.ts`): a localStorage
 * override checked first, falling back to the deployer's `VITE_FEATURES` runtime list.
 *
 * Two independent flags, not one:
 *   - `isIngestUiEnabled()`   gates whether the ingest panel exists at all.
 *   - `isIngestMockEnabled()` gates which transport it talks to (mock vs. real), and only
 *     matters once the UI is on — the routes it would otherwise hit do not exist yet.
 */

import { isFeatureEnabled } from "@/lib/featureFlags";

const UI_KEY = "cortex.ingest";
const MOCK_KEY = "cortex.ingestMock";

export function isIngestUiEnabled(): boolean {
  return isFeatureEnabled("ingest");
}

export function isIngestMockEnabled(): boolean {
  return isFeatureEnabled("ingestMock");
}

export function setIngestUiEnabled(on: boolean) {
  if (typeof window === "undefined") return;
  try {
    if (on) window.localStorage.setItem(UI_KEY, "1");
    else window.localStorage.removeItem(UI_KEY);
  } catch {
    /* ignore */
  }
}

export function setIngestMockEnabled(on: boolean) {
  if (typeof window === "undefined") return;
  try {
    if (on) window.localStorage.setItem(MOCK_KEY, "1");
    else window.localStorage.removeItem(MOCK_KEY);
  } catch {
    /* ignore */
  }
}
