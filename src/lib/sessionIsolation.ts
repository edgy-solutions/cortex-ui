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

const OWNER_KEY = "cortex-session-owner";

/** Persisted-store localStorage keys that hold user-scoped data. */
const USER_SCOPED_STORAGE_KEYS = ["cortex-answers-panel-v1", "cortex-stage"];

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
