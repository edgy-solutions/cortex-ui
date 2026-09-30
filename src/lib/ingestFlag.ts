/**
 * ingestFlag — the two ADR-0041 ingest UI flags.
 *
 * Same pattern as `isMockGroundingEnabled` (src/lib/mockGroundingEmitter.ts): a localStorage
 * override checked first, falling back to a Vite env var, defaulting OFF, every storage access
 * wrapped in try/catch because a private window or blocked site data must not crash the read.
 *
 * Two independent flags, not one:
 *   - `isIngestUiEnabled()`   gates whether the ingest panel exists at all.
 *   - `isIngestMockEnabled()` gates which transport it talks to (mock vs. real), and only
 *     matters once the UI is on — the routes it would otherwise hit do not exist yet.
 */

const UI_KEY = "cortex.ingest";
const MOCK_KEY = "cortex.ingestMock";

function envVar(name: string): string | undefined {
  return (import.meta as unknown as { env?: Record<string, string> }).env?.[name];
}

export function isIngestUiEnabled(): boolean {
  if (typeof window !== "undefined") {
    try {
      if (window.localStorage.getItem(UI_KEY) === "1") return true;
    } catch {
      /* ignore */
    }
  }
  const envVal = envVar("VITE_INGEST_UI");
  return envVal === "true";
}

export function isIngestMockEnabled(): boolean {
  if (typeof window !== "undefined") {
    try {
      if (window.localStorage.getItem(MOCK_KEY) === "1") return true;
    } catch {
      /* ignore */
    }
  }
  const envVal = envVar("VITE_INGEST_MOCK");
  return envVal === "true";
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
