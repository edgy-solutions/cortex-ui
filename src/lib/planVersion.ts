import { fetchPlanStateVersion } from "@/api/client";

/**
 * The plan's `state_version`, watched ONCE for the whole app.
 *
 * ADR-0042 §4 splits a live view three ways — content is state-master, arrangement is
 * UI-master, freshness is per evaluation — and OQ1 wires the trigger: the invalidation
 * travels, the card pulls the recomputation. This module is the travelling half.
 *
 * ── ONE POLLER, N SUBSCRIBERS ────────────────────────────────────────────────────────────
 *
 * The obvious implementation is a `useEffect` in each card that polls the version. That is the
 * defect this repo removed from `useMeshConfig` yesterday, rebuilt on purpose: a per-instance
 * fetch of GLOBAL state turns artifact count into request fan-out, and a session with seventy
 * cards issues seventy pollers against an endpoint whose answer is identical for all of them.
 * The last time that happened it took cortex-bff off the service mesh.
 *
 * So the poller is module-level and reference-counted: it starts on the first subscriber and
 * stops on the last. Subscriber count changes the number of CALLBACKS, never the number of
 * requests.
 *
 * ── WHAT THIS DOES NOT DO ────────────────────────────────────────────────────────────────
 *
 * It does not fetch content, and it must not grow the ability to. A version is a signal that
 * something changed; the recomputation is a verb that runs where verbs run (ADR-0042 §3).
 */

const POLL_MS = 15_000;

type Listener = (version: number) => void;

let current: number | null = null;
let listeners: Listener[] = [];
let timer: ReturnType<typeof setInterval> | null = null;
let inflight = false;

/** The last version this client observed, or null before the first successful read. */
export function currentPlanVersion(): number | null {
  return current;
}

async function poll(): Promise<void> {
  // A slow response must not stack requests behind it. Skipping a tick is correct: the next
  // one reads the same authoritative value, and a queue of overlapping polls is the storm
  // shape again in slow motion.
  if (inflight) return;
  inflight = true;
  try {
    const v = await fetchPlanStateVersion();
    if (typeof v !== "number" || !Number.isFinite(v)) return;
    if (current !== null && v === current) return;
    const previous = current;
    current = v;
    // Only a CHANGE notifies. The first successful read establishes the baseline without
    // firing, or every card would re-request on load for a version that never moved.
    if (previous !== null) for (const fn of [...listeners]) fn(v);
  } catch {
    // A failed version read is not a version change. Staying quiet leaves every card showing
    // its last evaluation with its own stamp, which is the honest state: we do not know
    // whether anything moved.
  } finally {
    inflight = false;
  }
}

/**
 * Subscribe to version CHANGES. Returns an unsubscribe.
 *
 * The first subscriber starts the poller; the last one to leave stops it. Nothing here is
 * per-card except the callback.
 */
export function subscribePlanVersion(fn: Listener): () => void {
  listeners.push(fn);
  if (!timer) {
    timer = setInterval(poll, POLL_MS);
    void poll(); // establish the baseline immediately rather than one interval late
  }
  return () => {
    listeners = listeners.filter((l) => l !== fn);
    if (listeners.length === 0 && timer) {
      clearInterval(timer);
      timer = null;
    }
  };
}

/** Test seam. Production never calls this; the poller is app-lifetime by design. */
export function __resetPlanVersion(): void {
  if (timer) clearInterval(timer);
  timer = null;
  listeners = [];
  current = null;
  inflight = false;
}
