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

/**
 * `stateRef` is the SECOND argument, not the first, purely so existing subscribers written
 * as `(v) => ...` keep working. Version-then-ref reads slightly oddly and breaking every
 * caller to fix the word order would be a worse trade.
 */
type Listener = (version: number, stateRef: string) => void;

/** A subscriber plus, optionally, which refs it cares about. */
type Watcher = { fn: Listener; refs?: () => string[] };

/**
 * VERSIONS ARE PER-REF and this map is why.
 *
 * A single `current` was correct only while the one watched ref was baseline. Ops apply to
 * SCENARIOS, so a drag session watching baseline polls a number that never moves — the loop
 * reports "nothing changed" forever, which is indistinguishable from a working loop with a
 * quiet plan. Keeping one integer per ref is what makes "has MY plan moved" answerable.
 */
let versions = new Map<string, number>();
let watchers: Watcher[] = [];
let timer: ReturnType<typeof setInterval> | null = null;
let inflight = false;

/** Baseline's last observed version, or null before the first successful read. */
export function currentPlanVersion(): number | null {
  return versions.has("baseline") ? (versions.get("baseline") as number) : null;
}

/** A specific ref's last observed version, or null if never read. */
export function currentPlanVersionOf(stateRef: string): number | null {
  return versions.has(stateRef) ? (versions.get(stateRef) as number) : null;
}

/**
 * The distinct refs to poll this tick.
 *
 * DISTINCT IS THE WHOLE POINT. Watchers name refs; the poller polls the SET. Twelve cards on
 * one scenario is one request, not twelve — the count-becomes-fan-out guard, preserved now
 * that there is more than one thing to watch. Refs are re-read every tick rather than captured
 * at subscribe time, so a canvas that changes what it is showing does not need to resubscribe.
 */
function watchedRefs(): string[] {
  const set = new Set<string>();
  for (const w of watchers) {
    for (const r of w.refs?.() ?? []) if (r) set.add(r);
  }
  // A watcher that names nothing still wants to know about the plan of record.
  if (set.size === 0) set.add("baseline");
  return [...set];
}

async function poll(): Promise<void> {
  // A slow response must not stack requests behind it. Skipping a tick is correct: the next
  // one reads the same authoritative value, and a queue of overlapping polls is the storm
  // shape again in slow motion.
  if (inflight) return;
  inflight = true;
  try {
    for (const ref of watchedRefs()) {
      const v = await fetchPlanStateVersion(ref === "baseline" ? undefined : ref);
      if (typeof v !== "number" || !Number.isFinite(v)) continue;
      const previous = versions.has(ref) ? (versions.get(ref) as number) : null;
      if (previous === v) continue;
      versions.set(ref, v);
      // Only a CHANGE notifies, and only the first read of EACH ref is the quiet one. A ref
      // seen for the first time must not fire, or adding a card to the canvas would refresh
      // every card already on it.
      if (previous !== null) notify(ref, v);
    }
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
export function subscribePlanVersion(fn: Listener, refs?: () => string[]): () => void {
  const watcher: Watcher = { fn, refs };
  watchers.push(watcher);
  if (!timer) {
    timer = setInterval(poll, POLL_MS);
    void poll(); // establish the baseline immediately rather than one interval late
  }
  return () => {
    watchers = watchers.filter((w) => w !== watcher);
    if (watchers.length === 0 && timer) {
      clearInterval(timer);
      timer = null;
    }
  };
}

/**
 * Announce a change THIS CLIENT just caused, without waiting for the next tick.
 *
 * WHY THIS EXISTS AT ALL. The poller is the right mechanism for changes made ELSEWHERE, and
 * it stays. But a drag is a change this tab already knows about the moment the write returns,
 * and making the person who dragged the bar wait up to a poll interval to see the consequence
 * would read as "the drag did nothing" for fifteen seconds — the exact interpretation the beat
 * cannot afford.
 *
 * VERSIONS ARE PER-REF, so this records against the ref that actually moved. Scenario SC-DEMO
 * at version 3 says nothing about baseline; writing 3 into a shared tracker would make the next
 * baseline poll read 3, see no change and go quiet — a poller silenced by a number borrowed
 * from another plan. The map keyed by ref is what makes that impossible rather than merely
 * avoided.
 *
 * THAT LIMIT IS NOW CLOSED. This note used to end "the poller reads BASELINE, so a scenario
 * changed in another session is not seen." The poller now watches the refs the cards on the
 * canvas were actually evaluated against, so an external change to a watched scenario is seen
 * on the next tick. This function remains for the local case, where waiting a tick to see your
 * own drag is the thing that reads as "the drag did nothing".
 */
export function announcePlanChanged(stateRef: string, version: number): void {
  if (typeof version === "number" && Number.isFinite(version)) {
    versions.set(stateRef, version);
  }
  notify(stateRef, version);
}

/** Notify the watchers that care about `ref` — those naming it, and those naming nothing. */
function notify(ref: string, version: number): void {
  for (const w of [...watchers]) {
    const named = w.refs?.();
    // A watcher with no ref provider hears everything: it has not told us what it cares
    // about, and staying silent would be a guess in the direction of doing nothing.
    if (!named || named.length === 0 || named.includes(ref)) w.fn(version, ref);
  }
}

/** Test seam. Production never calls this; the poller is app-lifetime by design. */
export function __resetPlanVersion(): void {
  if (timer) clearInterval(timer);
  timer = null;
  watchers = [];
  versions = new Map();
  inflight = false;
}
