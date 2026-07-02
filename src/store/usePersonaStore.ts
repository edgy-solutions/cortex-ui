/**
 * ADR-0026 step 5 — persona/domain picker store.
 *
 * Holds the caller's Topaz-resolved (persona, domain) entitlement
 * matrix and the currently-selected cell. The cell travels with
 * every chat request via `active_persona` + `active_domains` on
 * `InterviewRequest` — per-prompt authoritative per ADR-0026's
 * "picker attached to prompt, not session-locked" requirement.
 *
 * Storage:
 *   * Session-sticky in `sessionStorage` keyed by `sub` so page
 *     reload preserves the last-picked cell within a session.
 *   * When a fresh JWT arrives with a different `sub` (user switch),
 *     the state resets to that user's default.
 *
 * Selection semantics:
 *   * `selectedPersona` = single value from `entitlements.cells`.
 *   * `selectedDomains` = subset of the domains entitled to the
 *     selected persona. Multi-select allowed when a persona spans
 *     multiple domains for this user.
 *   * On `setSelectedPersona`, `selectedDomains` is auto-populated
 *     with THE persona's entitled domains (all of them). The user
 *     can then narrow via the domain multi-select.
 *
 * Empty state: when `entitlements.cells` is empty (user has no
 * seeded entitlements — legacy cluster, or unseeded user), the
 * picker HIDES ITSELF; the input area shows without a picker;
 * chat requests omit `active_persona` / `active_domains` and the
 * server falls back to the legacy JWT-claim path. This is the
 * honest "you're on the legacy posture" signal, not an error.
 */
import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

import type { Entitlements, EntitlementCell } from "@/api/types";

interface PersonaState {
  // Fetched from GET /me/entitlements on login.
  entitlements: Entitlements | null;
  entitlementsLoading: boolean;
  entitlementsError: string | null;

  // Current picker selection (per-session sticky).
  selectedPersona: string | null;
  selectedDomains: string[];

  // Sub of the user these selections belong to. When the JWT sub
  // changes (login as a different user), the store resets.
  ownerSub: string | null;

  // -- actions --------------------------------------------------------

  /** Called on login by AuthProvider (or first mount that has a JWT). */
  loadEntitlements: (fetchFn: () => Promise<Entitlements>) => Promise<void>;

  /** Manual selection changes from the picker component. */
  setSelectedPersona: (persona: string) => void;
  setSelectedDomains: (domains: string[]) => void;

  /** Reset on user switch. */
  resetForSub: (sub: string, defaultCell?: EntitlementCell | null) => void;

  // -- derived helpers ------------------------------------------------

  /** True when the picker should render (matrix has cells). */
  hasEntitlements: () => boolean;

  /** Domains entitled to a given persona for this user. */
  domainsFor: (persona: string) => string[];

  /** All personas the user is entitled to (deduped). */
  personas: () => string[];
}

export const usePersonaStore = create<PersonaState>()(
  persist(
    (set, get) => ({
      entitlements: null,
      entitlementsLoading: false,
      entitlementsError: null,
      selectedPersona: null,
      selectedDomains: [],
      ownerSub: null,

      async loadEntitlements(fetchFn) {
        set({ entitlementsLoading: true, entitlementsError: null });
        try {
          const e = await fetchFn();
          const st = get();
          // If this fetch is for a DIFFERENT user than the store's
          // current owner (e.g. after a user switch), reset selection
          // to that user's default before revealing the new matrix.
          if (st.ownerSub !== e.user_id) {
            get().resetForSub(e.user_id, e.default);
          }
          set({
            entitlements: e,
            entitlementsLoading: false,
          });
          // If no selection yet (fresh session), seed from `default`.
          if (get().selectedPersona === null && e.default !== null) {
            set({
              selectedPersona: e.default.persona,
              selectedDomains: [e.default.domain],
            });
          } else if (get().selectedPersona === null && e.cells.length > 0) {
            // No `default` — pick the first cell as a starting point.
            set({
              selectedPersona: e.cells[0].persona,
              selectedDomains: [e.cells[0].domain],
            });
          }
        } catch (err: any) {
          set({
            entitlementsLoading: false,
            entitlementsError: err?.message ?? String(err),
          });
        }
      },

      setSelectedPersona(persona) {
        // Auto-populate selectedDomains with everything entitled
        // under this persona; user can narrow via the multi-select.
        const domains = get().domainsFor(persona);
        set({ selectedPersona: persona, selectedDomains: domains });
      },

      setSelectedDomains(domains) {
        set({ selectedDomains: domains });
      },

      resetForSub(sub, defaultCell) {
        set({
          ownerSub: sub,
          selectedPersona: defaultCell?.persona ?? null,
          selectedDomains: defaultCell ? [defaultCell.domain] : [],
        });
      },

      hasEntitlements() {
        const e = get().entitlements;
        return !!e && e.cells.length > 0;
      },

      domainsFor(persona) {
        const cells = get().entitlements?.cells ?? [];
        const seen = new Set<string>();
        const out: string[] = [];
        for (const c of cells) {
          if (c.persona === persona && !seen.has(c.domain)) {
            seen.add(c.domain);
            out.push(c.domain);
          }
        }
        return out;
      },

      personas() {
        const cells = get().entitlements?.cells ?? [];
        const seen = new Set<string>();
        const out: string[] = [];
        for (const c of cells) {
          if (!seen.has(c.persona)) {
            seen.add(c.persona);
            out.push(c.persona);
          }
        }
        return out;
      },
    }),
    {
      name: "cortex-persona-selection",
      // Session-scoped (not localStorage) so multiple concurrent
      // browser sessions can have independent selections and the
      // selection resets on browser close. Deliberate — long-lived
      // localStorage sticky was a common source of "why is my UI
      // acting as X, I never picked X" confusion.
      storage: createJSONStorage(() => sessionStorage),
      // Don't persist the fetched matrix — always re-fetch on login
      // so a stale matrix from a previous session's user can't
      // survive into a new session.
      partialize: (state) => ({
        selectedPersona: state.selectedPersona,
        selectedDomains: state.selectedDomains,
        ownerSub: state.ownerSub,
      }),
    },
  ),
);
