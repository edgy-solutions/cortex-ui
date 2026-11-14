import { useEffect, useRef } from "react";
import { useAuth } from "react-oidc-context";
import { fetchEntitlements } from "@/api/client";
import { onForbidden } from "@/api/forbidden";
import {
  usePersonaStore,
  ENTITLEMENTS_REFRESH_MS,
  ENTITLEMENTS_FORBIDDEN_MIN_GAP_MS,
} from "@/store/usePersonaStore";

/**
 * Entitlements are SESSION BOOTSTRAP, so they are fetched here — on auth-ready, at the top of
 * the tree — rather than by the picker that displays them.
 *
 * The picker mounts deep inside the answer surface, so owning the fetch there meant the request
 * deciding whether a user may choose a persona went out AFTER the card tree rendered, behind
 * however many artifacts the session had accumulated. Under HTTP/1.1 the browser caps ~6
 * connections per origin and Electric holds two of them open for its live shapes, so on a
 * session with dozens of cards the request could sit unsent until it timed out — and the picker,
 * having no dependency that would change afterwards, stayed inert for the rest of the session.
 *
 * This is the correct ordering on the merits, not a workaround: bootstrap data should not queue
 * behind card data in any protocol. HTTP/2 multiplexing (which the TLS-terminating venue gets
 * for free) makes the old ordering survivable rather than correct.
 *
 * The same owner keeps the matrix fresh, so no control has to: a timer re-reads it every
 * ENTITLEMENTS_REFRESH_MS, and a 403 anywhere in the client (a grant that changed) triggers one
 * refresh, throttled. Controls READ the store; none of them fetch.
 */
export function useEntitlementsSync() {
  const auth = useAuth();
  const sub = auth.user?.profile?.sub ?? null;
  const loadEntitlements = usePersonaStore((s) => s.loadEntitlements);
  const refreshEntitlements = usePersonaStore((s) => s.refreshEntitlements);
  const loadedFor = useRef<string | null>(null);
  useEffect(() => {
    if (!auth.isAuthenticated || !sub) return;
    // Keyed on the SUBJECT rather than on a boolean: a user switch must re-fetch, and a failed
    // attempt must not be mistaken for a completed one. The store bounds its own retries and
    // surfaces a terminal failure through the picker's visible error state.
    if (loadedFor.current === sub) return;
    loadedFor.current = sub;
    void loadEntitlements(fetchEntitlements);
  }, [auth.isAuthenticated, sub, loadEntitlements]);

  // The refresh triggers live exactly as long as this subject's authenticated session: sign-out,
  // a subject change and unmount all clear both, and a new subject starts fresh (own gap clock).
  useEffect(() => {
    if (!auth.isAuthenticated || !sub) return;
    const refresh = () => void refreshEntitlements(fetchEntitlements);
    const timer = setInterval(refresh, ENTITLEMENTS_REFRESH_MS);
    let lastForbiddenAt = -Infinity;
    const unsubscribe = onForbidden(() => {
      const now = Date.now();
      if (now - lastForbiddenAt < ENTITLEMENTS_FORBIDDEN_MIN_GAP_MS) return;
      lastForbiddenAt = now;
      refresh();
    });
    return () => {
      clearInterval(timer);
      unsubscribe();
    };
  }, [auth.isAuthenticated, sub, refreshEntitlements]);
}

