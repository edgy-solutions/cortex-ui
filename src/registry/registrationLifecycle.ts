/**
 * A REGISTRATION THAT CAN BE RE-ASSERTED — without becoming a poll.
 *
 * ── WHAT WAS WRONG WITH ONCE-PER-SESSION ──────────────────────────────────────────────────
 *
 * The hook it replaces latched on a boolean:
 *
 *     if (!auth.isAuthenticated || registeredRef.current) return;
 *     registeredRef.current = true;
 *
 * Once-per-session is the RIGHT COST when the substrate is stable, and it is the wrong
 * ASSUMPTION against a substrate that can be wiped underneath it. A nuclear prime drops the
 * collection holding every `rendersAs` row; the engines restart and re-post theirs; cortex's
 * are gone until someone reloads the tab, and nothing inside the session can put them back —
 * no route change, no reconnect, no refetch re-posts. See `menuPresence.ts` for the mechanism
 * end to end.
 *
 * ── THE TRIGGER IS EVIDENCE, NOT A TIMER ──────────────────────────────────────────────────
 *
 * The server already tells us, on every answer, whether it holds a menu for this caller. That
 * answer is the trigger. With a stable substrate this machine fires ZERO extra requests for the
 * life of the session — there is no interval, no heartbeat, nothing to tune. It costs one POST
 * per observed wipe, which is the same cost the reload was paying, minus the reload.
 *
 * ── THE PART THAT NEEDED DECIDING: WHY A BACKOFF AT ALL ───────────────────────────────────
 *
 * Because a re-assertion can fail to fix it, and then the trigger repeats forever. If the POST
 * is rejected — an expired token, a server that accepts the rows and does not persist them —
 * EVERY subsequent answer still says `default-menu`, and an unguarded machine turns one wipe
 * into a request per answer. That is the poll we were avoiding, arrived at from the other side.
 *
 * So: at most one re-assertion in flight, and a cooldown that DOUBLES while the evidence keeps
 * saying the menu is missing, to a cap. A wipe that a single POST repairs costs one POST. A
 * wipe that no POST can repair costs a handful, then one every five minutes, and it stays
 * visible in the console rather than silently hammering.
 *
 * ── AND WHY THE BACKOFF RESETS ────────────────────────────────────────────────────────────
 *
 * An answer stamped `registered` is PROOF the substrate is working and our row is on it. A
 * session that recovered must not carry a penalty from an earlier wipe: the human primes more
 * than once, and the second wipe deserves the same prompt recovery as the first. Healthy
 * evidence clears both the interval and the clock, so the next wipe re-asserts immediately.
 */
import { serverHasNoMenuForUs, serverHasOurMenu } from "./menuPresence";

/** First cooldown after a re-assertion. Long enough to let the POST and an answer settle. */
export const BASE_COOLDOWN_MS = 15_000;
/** The ceiling. A wipe nothing can repair costs one request per this interval, and no more. */
export const MAX_COOLDOWN_MS = 300_000;

export interface LifecycleState {
  /** Has the once-per-session registration been started yet. */
  opened: boolean;
  /** Is a POST in flight right now. */
  inFlight: boolean;
  /** How many times the menu has been observed missing AFTER we registered. */
  reassertions: number;
  /** The interval that must pass before another re-assertion is allowed. */
  cooldownMs: number;
}

export interface RegistrationLifecycle {
  /** True exactly once per session, for the initial registration. */
  shouldOpen(): boolean;
  /** The caller has started a POST — initial or re-assertion. */
  attemptStarted(): void;
  /** The POST settled. `ok` false does not itself schedule a retry; evidence does. */
  attemptSettled(ok: boolean): void;
  /**
   * Feed one answer's `presentation_provenance`. Returns true when the caller should re-post
   * the registration NOW.
   */
  observe(raw: unknown): boolean;
  state(): LifecycleState;
}

/** The shape this reads off an artifact. Structural, so a test needs no full `Artifact`. */
export interface ProvenanceCarrier {
  id?: string;
  rendered_output?: { presentation_provenance?: unknown } | null;
}

/**
 * Feed a batch of artifacts to the lifecycle. True when the caller should re-post.
 *
 * EXTRACTED SO IT CAN BE ASSERTED. Left inline in `App.tsx` the substantive parts — the field
 * path and the seen-set — would have been reachable only by mounting the whole authenticated
 * tree, and this repo has twice shipped a defect that lived in wiring the tests never reached:
 * three of five `<SemanticInterpreter>` call sites left unthreaded, and a section mounted on the
 * one branch that never renders. What stays in the hook is the subscription and nothing else.
 *
 * EACH ARTIFACT IS EVIDENCE EXACTLY ONCE. A wiped answer stays in the list after the repair;
 * re-reading it would re-trigger once per cooldown against a menu that is already back.
 *
 * EVERY new artifact is observed, and the results are OR-ed into a SINGLE re-post. Returning
 * early on the first trigger would have been tidier and would have thrown away evidence: a batch
 * carrying both a stale wiped answer and a fresh healthy one must still record the healthy one,
 * because that is what clears the backoff. Several wiped answers in one batch are one fact —
 * one missing menu — so the caller posts once regardless of how many said so.
 */
export function observeArtifactsForMenuLoss(
  artifacts: readonly ProvenanceCarrier[],
  seen: Set<string>,
  lifecycle: RegistrationLifecycle,
): boolean {
  let reassert = false;
  for (const a of artifacts) {
    const id = a?.id;
    if (!id || seen.has(id)) continue;
    seen.add(id);
    if (lifecycle.observe(a.rendered_output?.presentation_provenance)) reassert = true;
  }
  return reassert;
}

export function createRegistrationLifecycle(opts: {
  frontendId: string;
  now: () => number;
  baseCooldownMs?: number;
  maxCooldownMs?: number;
}): RegistrationLifecycle {
  const { frontendId, now } = opts;
  const base = opts.baseCooldownMs ?? BASE_COOLDOWN_MS;
  const max = opts.maxCooldownMs ?? MAX_COOLDOWN_MS;

  let opened = false;
  let inFlight = false;
  let reassertions = 0;
  let cooldownMs = base;
  /** When the last attempt STARTED. Null means nothing is holding the next one back. */
  let lastAttemptAt: number | null = null;

  return {
    shouldOpen() {
      if (opened || inFlight) return false;
      opened = true;
      return true;
    },

    attemptStarted() {
      inFlight = true;
      lastAttemptAt = now();
    },

    attemptSettled(ok: boolean) {
      inFlight = false;
      // A REJECTED POST DOES NOT SCHEDULE A RETRY HERE. Retrying on failure alone would fire
      // against a server that is merely down, with no evidence anything is actually missing —
      // and the evidence path already covers the case that matters, because a menu that never
      // landed keeps producing `default-menu` answers. `ok` is taken so the failure is a state
      // this machine has SEEN rather than one it cannot represent.
      void ok;
    },

    observe(raw: unknown) {
      if (serverHasOurMenu(raw, frontendId)) {
        // PROOF OF HEALTH. Clear the penalty and the clock so the next wipe — and there will be
        // a next wipe — recovers as promptly as the first did.
        reassertions = 0;
        cooldownMs = base;
        lastAttemptAt = null;
        return false;
      }

      if (!serverHasNoMenuForUs(raw, frontendId)) return false;

      // The menu is missing. Everything below is the loop guard, not the decision.
      if (inFlight) return false;
      if (!opened) {
        // Evidence arrived before the session ever registered — nothing has been asserted yet,
        // so there is nothing to RE-assert. `shouldOpen` owns that first POST.
        return false;
      }
      if (lastAttemptAt !== null && now() - lastAttemptAt < cooldownMs) return false;

      reassertions += 1;
      // Doubled BEFORE the attempt, so a re-assertion that does not take is already paying the
      // longer interval by the time the next answer arrives.
      cooldownMs = Math.min(cooldownMs * 2, max);
      // THE DECISION STARTS THE CLOCK, not the POST that follows it.
      //
      // Found by a test, not by reading: a batch carrying three stale wiped answers called this
      // three times with the clock unmoved, and each one passed the cooldown check because the
      // last attempt was ten minutes ago. One wipe burned the backoff to eight times its base
      // before a single request went out — so the recovery this exists to make PROMPT would have
      // been the slowest part of it, and only in the case where the canvas already had answers
      // on it, which is every real case.
      //
      // Stamping the decision here makes the several answers what they are: one missing menu.
      lastAttemptAt = now();
      return true;
    },

    state() {
      return { opened, inFlight, reassertions, cooldownMs };
    },
  };
}
