/**
 * Composer draft persistence — a typed prompt must survive an SSO re-login.
 *
 * When the silent renew fails, `auth.isAuthenticated` drops, App's isolation gate
 * flips false and the ENTIRE session surface unmounts (App.tsx) before Keycloak's
 * redirect even navigates. Whatever the user had typed dies twice over: once at
 * unmount, once at reload. The root-cause renew fix is parked; this makes the data
 * loss survivable, which is the half that is unacceptable to ship.
 *
 * Keying, and why it is NOT in USER_SCOPED_STORAGE_KEYS: the draft is keyed by the
 * OIDC `sub` so user B can never read user A's text. But `reconcileSessionOwner`
 * purges that list on owner CHANGE, and a re-login by the SAME user does not change
 * the owner — which is exactly why the draft survives. Adding the draft key to that
 * list would delete it in precisely the scenario this hook exists for. The owner is
 * read from the stamp sessionIsolation already writes, so this stays out of the auth
 * lane entirely.
 */
import { useCallback, useEffect, useRef, useState } from "react";

const OWNER_KEY = "cortex-session-owner";
const DRAFT_KEY_PREFIX = "cortex-composer-draft:";

/** Long enough that a fast typist writes once per pause, short enough to beat a redirect. */
const WRITE_DEBOUNCE_MS = 400;

export function composerDraftKey(owner: string): string {
  return DRAFT_KEY_PREFIX + owner;
}

// Every access is wrapped: private mode and blocked-storage must degrade to "no
// persistence", never take the composer down with them.
function readOwner(): string | null {
  try {
    return window.localStorage.getItem(OWNER_KEY) || null;
  } catch {
    return null;
  }
}

function readDraft(owner: string): string {
  try {
    return window.localStorage.getItem(composerDraftKey(owner)) ?? "";
  } catch {
    return "";
  }
}

function writeDraft(owner: string, value: string): void {
  try {
    if (value) window.localStorage.setItem(composerDraftKey(owner), value);
    else window.localStorage.removeItem(composerDraftKey(owner));
  } catch {
    /* no persistence available — the composer still works */
  }
}

/**
 * Owns the composer's text and mirrors it to per-user localStorage.
 * `clearDraft` is for a send that actually dispatched; an aborted or rejected
 * submit must leave the draft alone.
 */
export function useComposerDraft(): {
  value: string;
  setValue: (next: string) => void;
  clearDraft: () => void;
} {
  const [value, setValue] = useState("");
  const [owner, setOwner] = useState<string | null>(readOwner);
  const restoredFor = useRef<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latest = useRef<{ owner: string | null; value: string }>({ owner, value });

  const syncOwner = useCallback(() => {
    setOwner((prev) => {
      const now = readOwner();
      return prev === now ? prev : now;
    });
  }, []);

  // No dependency array, deliberately: mid-relogin the `sub` is briefly unknown and
  // resolves without changing any input this hook can depend on. The identical-value
  // bail-out in syncOwner keeps this from looping. The storage listener covers the
  // other direction — a sibling tab re-stamping the owner while this one sits idle.
  useEffect(syncOwner);
  useEffect(() => {
    window.addEventListener("storage", syncOwner);
    return () => window.removeEventListener("storage", syncOwner);
  }, [syncOwner]);

  useEffect(() => {
    latest.current = { owner, value };
  });

  // THE RESTORE, and the trap it has to walk around. Restoring is only safe when the
  // composer has nothing newer in it; a stale restore that clobbers a fresher draft is
  // this fix becoming the defect it was written to prevent.
  useEffect(() => {
    if (owner === null) return; // identity unknown — never restore under a placeholder key
    const previous = restoredFor.current;
    if (previous === owner) return; // already settled for this owner; do not re-seed
    restoredFor.current = owner;
    const stored = readDraft(owner);
    setValue((current) => {
      // Two known, DIFFERENT owners: an in-place account switch. The buffer holds the
      // previous user's text and carrying it over would leak A's words into B's composer.
      if (previous !== null && previous !== owner) return stored;
      // Identity merely RESOLVED (unknown -> known) — the re-login path. Anything typed
      // while it was unknown is strictly newer than what is on disk. Disk does not win.
      return current === "" ? stored : current;
    });
  }, [owner]);

  // Debounced mirror. The cleanup cancelling the previous timer IS the debounce, so a
  // held-down key costs one write per pause instead of one per character.
  useEffect(() => {
    if (owner === null) return; // a draft written under a null key is unreadable and unpurgeable
    const t = setTimeout(() => {
      timer.current = null;
      writeDraft(owner, value);
    }, WRITE_DEBOUNCE_MS);
    timer.current = t;
    return () => clearTimeout(t);
  }, [owner, value]);

  // Flush on unmount: the failed-renew path tears the surface down mid-debounce, which
  // is the exact moment worth surviving. Only a NON-EMPTY buffer is flushed — StrictMode's
  // simulated unmount would otherwise erase a just-restored draft before the remount.
  useEffect(
    () => () => {
      const { owner: o, value: v } = latest.current;
      if (o !== null && v !== "") writeDraft(o, v);
    },
    [],
  );

  const clearDraft = useCallback(() => {
    // Cancel first: a debounce still in flight would rewrite the message we just sent.
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
    setValue("");
    const o = readOwner();
    if (o !== null) writeDraft(o, "");
  }, []);

  return { value, setValue, clearDraft };
}
