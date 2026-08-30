/**
 * Session isolation — one browser must never show user A's data to user B.
 *
 * The Electric answer shape + the HITL task projection are BOTH server-scoped to
 * the caller's JWT sub, so a fresh, correctly-reset session only ever RECEIVES
 * the caller's own rows. The leak is client-side: when the authenticated subject
 * changes WITHOUT a full page reset (silent-renew, in-place OIDC callback, or a
 * re-login in the same tab), the previous user's in-memory stores survive —
 * useCanvasStore's artifacts (answers), the task set, the canvas boards — and
 * render until the new user's (empty) server snapshot finally reconciles them
 * away. That "flash then clear" is a cross-user disclosure, however brief.
 *
 * Fix: stamp the browser with the current owner; when it changes, PURGE every
 * user-scoped store + its persisted cache before anything repopulates or paints.
 */
import { useCanvasStore } from "@/store/useCanvasStore";
import { useHumanTaskStore } from "@/store/useHumanTaskStore";
import { useStageStore } from "@/store/useStageStore";
import { useAnswerPanelStore } from "@/store/useAnswerPanelStore";
import { useEvidenceStore } from "@/store/useEvidenceStore";
import { useInterviewStore } from "@/store/useInterviewStore";

const OWNER_KEY = "cortex-session-owner";

/** Persisted-store localStorage keys that hold user-scoped data. */
const USER_SCOPED_STORAGE_KEYS = ["cortex-answers-panel-v1", "cortex-stage"];

/**
 * Stores this purge deliberately does NOT touch, each with the argument for why it is
 * safe. Declaration only — nothing here changes what the purge does.
 *
 * The point is that "not purged" stops being a state a store can drift into unnoticed.
 * sessionIsolation.test.ts asserts every `use*Store` on disk is either named in the purge
 * body above or listed here, so a new store forces a decision instead of inheriting one.
 * An entry here is a claim someone can review and disagree with; an omission was never
 * visible enough to disagree with.
 */
export const PURGE_EXEMPT_STORES: Record<string, string> = {
  usePresentationStore:
    "Holds NO user data. Three booleans describing how the shell is arranged right now — " +
    "full screen, and whether each rail is pinned. Nothing in it is derived from an answer, " +
    "a board or an identity, so there is nothing for the next caller to see. It is also not " +
    "persisted, so an owner change starts it at its defaults anyway. Purging it would be " +
    "harmless and would say, falsely, that it carried something worth wiping.",
  usePersonaStore:
    "Isolates itself by a different mechanism, verified: it persists to sessionStorage " +
    "(not localStorage, so this key list has no remit over it), deliberately does NOT " +
    "persist the fetched entitlement matrix, and carries its own `ownerSub` guard that " +
    "resets the selection when entitlements arrive for a different sub. Purging it here " +
    "would duplicate that guard in a second place, which is how the two drift apart.",
};

/**
 * Wipe every user-scoped store (in-memory) and its persisted cache. Called on an
 * owner change so no prior-user answer/task/board can render in this session.
 * The server-backed collections (answers via Electric, tasks via the projection,
 * boards via the canvas sync) then rehydrate from the NEW caller's own data.
 */
export function purgeUserScopedState(): void {
  try {
    useCanvasStore.setState({ artifacts: [], currentArtifactId: null });
    useHumanTaskStore.setState({ tasks: [] });
    useStageStore.setState({ canvases: [] });
    useAnswerPanelStore.setState({ pins: [] });
    useEvidenceStore.getState().dismiss();
    // Conversation content: A's questions and the agent's answers to them. Nothing
    // renders `messages` today (the answer-first redesign left MessageBubble unmounted),
    // but "safe because a component is dead" is folklore-as-protection — revive the
    // thread and A's transcript paints for B. Registered rather than exempted.
    //
    // `reset()` rather than a hand-listed setState: it spreads the store's own
    // initialState, so a field added later is purged without anyone remembering to come
    // back here — the same drift this module's completeness guard exists to refuse. It
    // deliberately preserves `groundingDisplayMode`, a device-scoped display toggle
    // rather than user content.
    useInterviewStore.getState().reset();
    for (const k of USER_SCOPED_STORAGE_KEYS) {
      try { window.localStorage.removeItem(k); } catch { /* ignore */ }
    }
  } catch (e) {
    console.warn("[isolation] purge failed", e);
  }
}

/**
 * Compare the current authenticated owner to the last one this browser saw.
 * On a mismatch (including the first observation, defensively) purge user-scoped
 * state, then stamp the new owner. Returns true if a purge ran.
 */
export function reconcileSessionOwner(owner: string): boolean {
  let prev: string | null = null;
  try { prev = window.localStorage.getItem(OWNER_KEY); } catch { /* ignore */ }
  if (prev === owner) return false;
  // Different (or unknown) owner holds this browser's caches — wipe before use.
  purgeUserScopedState();
  try { window.localStorage.setItem(OWNER_KEY, owner); } catch { /* ignore */ }
  return true;
}
