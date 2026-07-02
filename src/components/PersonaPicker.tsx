/**
 * ADR-0026 step 5 — the picker.
 *
 * Two dependent dropdowns rendered immediately under the message
 * input. On persona change, the domain multi-select refreshes to
 * only the domains entitled to that persona for this user.
 *
 * Also renders the "Acting as" badge — always-visible signifier of
 * "what am I about to send this question as." The badge is
 * clickable/inline with the dropdowns to make the affordance
 * discoverable.
 *
 * When the user has no seeded entitlements (empty matrix), the
 * whole component renders NULL — the picker doesn't apply on the
 * legacy JWT-claim posture. That's the honest signal, not an error
 * state.
 */
import { useEffect } from "react";
import { useAuth } from "react-oidc-context";

import { fetchEntitlements } from "@/api/client";
import { usePersonaStore } from "@/store/usePersonaStore";

export function PersonaPicker() {
  const auth = useAuth();
  const {
    entitlements,
    entitlementsLoading,
    entitlementsError,
    selectedPersona,
    selectedDomains,
    setSelectedPersona,
    setSelectedDomains,
    hasEntitlements,
    domainsFor,
    personas,
    loadEntitlements,
  } = usePersonaStore();

  // Load entitlements once we have a JWT — refetch on user switch.
  useEffect(() => {
    if (!auth.isAuthenticated) return;
    const sub = auth.user?.profile?.sub;
    if (!sub) return;
    if (entitlements?.user_id === sub) return; // already loaded
    void loadEntitlements(fetchEntitlements);
  }, [auth.isAuthenticated, auth.user?.profile?.sub, entitlements?.user_id, loadEntitlements]);

  if (entitlementsLoading) {
    return (
      <div className="text-xs text-slate-500 px-2 py-1">Loading entitlements...</div>
    );
  }
  if (entitlementsError) {
    // Deliberately loud — this is authz plumbing broken; the ADR-0026
    // posture is "surface it, don't silently degrade."
    return (
      <div className="text-xs text-neon-pink px-2 py-1">
        Entitlements unavailable: {entitlementsError}
      </div>
    );
  }
  if (!hasEntitlements()) {
    // Legacy path — no picker. Server falls back to the JWT-claim
    // persona / entitled_domains from ADR-0009.
    return null;
  }

  const availablePersonas = personas();
  const availableDomains = selectedPersona ? domainsFor(selectedPersona) : [];

  return (
    <div className="flex items-center gap-3 text-xs px-2 py-2 border-t border-white/5">
      <div className="flex items-center gap-2">
        <label className="text-slate-400 tracking-wider uppercase">Persona</label>
        <select
          value={selectedPersona ?? ""}
          onChange={(e) => setSelectedPersona(e.target.value)}
          className="bg-slate-900/50 border border-neon-blue/30 text-neon-blue px-2 py-1 rounded focus:outline-none focus:border-neon-blue/70"
        >
          {availablePersonas.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>
      </div>

      <div className="flex items-center gap-2">
        <label className="text-slate-400 tracking-wider uppercase">Domain</label>
        {/* Multi-select via a chip-style toggle group so users can
            see all their entitled domains under this persona and
            pick a subset without a native multi-select's rough UX. */}
        <div className="flex gap-1 flex-wrap">
          {availableDomains.map((d) => {
            const active = selectedDomains.includes(d);
            return (
              <button
                key={d}
                type="button"
                onClick={() => {
                  if (active) {
                    // Don't allow the user to deselect the last domain
                    // — an empty domains list would send the picker
                    // into "override incomplete" 400 territory. If
                    // they want no domain filter, they pick a different
                    // persona whose grants span more.
                    if (selectedDomains.length > 1) {
                      setSelectedDomains(selectedDomains.filter((x) => x !== d));
                    }
                  } else {
                    setSelectedDomains([...selectedDomains, d]);
                  }
                }}
                className={
                  active
                    ? "px-2 py-1 rounded border border-neon-cyan/70 bg-neon-cyan/20 text-neon-cyan"
                    : "px-2 py-1 rounded border border-slate-700 bg-slate-900/50 text-slate-400 hover:border-slate-500"
                }
              >
                {d}
              </button>
            );
          })}
        </div>
      </div>

      {/* Always-visible "Acting as" badge — the ADR-0026 requirement
          for the current-context signifier. Includes provenance
          (from picker vs cache vs topaz) via the `source` flag on
          the entitlements response. */}
      <div className="ml-auto text-slate-500 tracking-wider uppercase">
        Acting as{" "}
        <span className="text-neon-blue">{selectedPersona ?? "?"}</span> ·{" "}
        <span className="text-neon-blue">{selectedDomains.join(", ") || "?"}</span>
        {entitlements && (
          <span className="ml-2 text-slate-600 normal-case tracking-normal">
            (entitlements: {entitlements.source})
          </span>
        )}
      </div>
    </div>
  );
}
