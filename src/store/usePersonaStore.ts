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
import { isPlatformDomain, pickableDomains } from "@/lib/platformDomains";

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

  /**
   * Called on auth-ready by App — BOOTSTRAP data, deliberately not owned by the picker.
   *
   * `sleepFn` exists so tests can drive the backoff without waiting on it; production never
   * passes it.
   */
  loadEntitlements: (
    fetchFn: () => Promise<Entitlements>,
    sleepFn?: (ms: number) => Promise<void>,
  ) => Promise<void>;

  /**
   * Background refresh (timer tick, or after a 403). No matrix yet: exactly `loadEntitlements`. Matrix present:
   * one attempt, never `entitlementsLoading`, a failure keeps the matrix. Single-flight with `loadEntitlements`.
   */
  refreshEntitlements: (fetchFn: () => Promise<Entitlements>) => Promise<void>;

  /** Manual selection changes from the picker component. */
  setSelectedPersona: (persona: string) => void;
  setSelectedDomains: (domains: string[]) => void;

  /** Reset on user switch. */
  resetForSub: (sub: string | null, defaultCell?: EntitlementCell | null) => void;

  // -- derived helpers ------------------------------------------------

  /** True when the picker should render (matrix has cells). */
  hasEntitlements: () => boolean;

  /** Domains entitled to a given persona for this user. */
  domainsFor: (persona: string) => string[];

  /** All SET personas the user is entitled to (deduped). A null persona never enters. */
  personas: () => string[];

  /** Some cell has a null persona (a backend defect, shown as "unset", never selectable). */
  unsetPersona: () => boolean;

  /** Some cell with this persona has a null domain (shown as "unset", never selectable). */
  unsetDomainFor: (persona: string) => boolean;
}

/** A cell is SET when persona and domain are both strings. */
type SetCell = { persona: string; domain: string };
const isSet = (c: EntitlementCell | null | undefined): c is SetCell =>
  !!c && typeof c.persona === "string" && typeof c.domain === "string";

/**
 * Two retries after the first attempt, then a VISIBLE failure. Bounded because an unbounded
 * retry against a starved connection pool is indistinguishable from the storm it is reacting to.
 */
const ENTITLEMENT_RETRIES = 2;
const ENTITLEMENT_BACKOFF_MS = 400;
const defaultSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/**
 * How often the session owner re-reads the matrix. Entitlements are read once per session and a grant can be
 * revoked or added server-side mid-session; five minutes bounds how stale the controls can be without every
 * control that mounts paying its own request.
 */
export const ENTITLEMENTS_REFRESH_MS = 5 * 60_000;
/**
 * At most one 403-triggered refresh per this gap. A revoked grant makes several calls 403 at once; one refresh
 * answers all of them, and a persistently forbidden route must not turn the refresh into a request storm.
 */
export const ENTITLEMENTS_FORBIDDEN_MIN_GAP_MS = 10_000;

type SetFn = (partial: Partial<PersonaState>) => void;
type GetFn = () => PersonaState;

/**
 * Bumped by every `loadEntitlements`. A load is a subject's FIRST read and must never join an older request
 * (that request may belong to the previous subject); a reply whose generation is no longer current is discarded.
 */
let generation = 0;

/**
 * The one request on the wire. Module-level, NOT state: it is a handle on a promise, never persisted
 * (`partialize` is unchanged) and never rendered. While it is set, every load or refresh call is handed the
 * same promise, so N controls, a timer tick and a 403 landing together cost one `GET /me/entitlements`.
 */
let inFlight: Promise<void> | null = null;
function track(p: Promise<void>): Promise<void> {
  inFlight = p;
  const clear = () => {
    if (inFlight === p) inFlight = null;
  };
  void p.then(clear, clear);
  return p;
}

/**
 * Apply a served matrix to the store: the ONE success path of a first load and of a background refresh,
 * so the user-switch reset and the platform-domain narrowing run identically for both.
 */
function applyEntitlements(set: SetFn, get: GetFn, e: Entitlements, mode: "load" | "refresh"): void {
  const st = get();
  // If this fetch is for a DIFFERENT user than the store's
  // current owner (e.g. after a user switch), reset selection
  // to that user's default before revealing the new matrix.
  // user_id null = the owner is unknown; two nulls must never compare as "the same user",
  // so the persisted selection is never carried over.
  if (mode === "load") {
    if (e.user_id === null || st.ownerSub !== e.user_id) {
      get().resetForSub(e.user_id, isSet(e.default) ? e.default : null);
    }
  } else if (e.user_id !== null && st.ownerSub !== e.user_id) {
    // A refresh belongs to the SAME signed-in subject (the sync clears its timer on a subject change), so a
    // null id is not a different user: it must not wipe the pick. Only a real, different id resets.
    get().resetForSub(e.user_id, isSet(e.default) ? e.default : null);
  } else if (st.selectedPersona !== null && !e.cells.some((c) => isSet(c) && c.persona === st.selectedPersona)) {
    // A revoked grant: the pick is no longer entitled, so fall back to the new default.
    get().resetForSub(st.ownerSub, isSet(e.default) ? e.default : null);
  }
  set({
    entitlements: e,
    entitlementsLoading: false,
  });
  // If no selection yet (fresh session), seed from `default`.
  const firstSet = e.cells.find(isSet);
  if (get().selectedPersona === null && isSet(e.default)) {
    set({
      selectedPersona: e.default.persona,
      selectedDomains: [e.default.domain],
    });
  } else if (get().selectedPersona === null && firstSet) {
    // No SET `default` — pick the first SET cell as a starting point.
    set({
      selectedPersona: firstSet.persona,
      selectedDomains: [firstSet.domain],
    });
  }
  // A PLATFORM DOMAIN IS NEVER THE PICK. `default`, the first cell, or a selection
  // persisted before the picker hid them can all land on MESH or DOCS alone; narrow to the
  // persona's first pickable domain. Platform scope is re-added at send (inScope).
  {
    const st2 = get();
    if (st2.selectedPersona && !st2.selectedDomains.some((d) => !isPlatformDomain(d))) {
      const first = pickableDomains(st2.domainsFor(st2.selectedPersona))[0];
      if (first) set({ selectedDomains: [first] });
    }
  }
}

async function runLoad(
  set: SetFn,
  get: GetFn,
  fetchFn: () => Promise<Entitlements>,
  sleepFn: (ms: number) => Promise<void>,
  gen: number,
): Promise<void> {
  set({ entitlementsLoading: true, entitlementsError: null });
  // BOUNDED retry. A single transient — a timeout under connection starvation, a cold
  // backend — used to disable the picker for the whole session, because the caller's
  // effect had no dependency that would change afterwards. Retrying here fixes it at the
  // layer that knows the attempt failed, rather than making the effect re-fire.
  //
  // It must NOT resurrect the self-sealing trap it replaces: a TERMINAL failure still
  // sets `entitlementsError`, which the picker renders as a visible reason. Silence is
  // what made this cost a night; retries that end in silence would cost the next one.
  for (let attempt = 0; ; attempt++) {
  try {
    const e = await fetchFn();
    if (gen !== generation) return; // a newer load superseded this one: discard silently
    applyEntitlements(set, get, e, "load");
    return;
  } catch (err: any) {
    if (gen !== generation) return;
    if (attempt >= ENTITLEMENT_RETRIES) {
      set({
        entitlementsLoading: false,
        entitlementsError: err?.message ?? String(err),
      });
      return;
    }
    // Backoff, so a retry does not join the storm that caused the failure.
    await sleepFn(ENTITLEMENT_BACKOFF_MS * Math.pow(3, attempt));
  }
  }
}

/**
 * A refresh over a matrix we already hold: ONE attempt, and `entitlementsLoading` is never set (the picker
 * must not flicker on a timer). A failure KEEPS the matrix and the existing error, warns once, and leaves the
 * next trigger to retry.
 */
async function runRefresh(set: SetFn, get: GetFn, fetchFn: () => Promise<Entitlements>, gen: number): Promise<void> {
  try {
    const e = await fetchFn();
    if (gen !== generation) return;
    applyEntitlements(set, get, e, "refresh");
  } catch (err: any) {
    if (gen !== generation) return;
    console.warn("entitlements refresh failed; keeping the current matrix:", err?.message ?? String(err));
  }
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

      loadEntitlements(fetchFn, sleepFn = defaultSleep) {
        // ALWAYS a new request: a subject's first load never joins an older one (it may be the previous
        // subject's). Bumping the generation makes the older reply, when it lands, a silent no-op.
        return track(runLoad(set, get, fetchFn, sleepFn, ++generation));
      },

      refreshEntitlements(fetchFn) {
        if (inFlight) return inFlight;
        // No matrix yet: a terminally failed first load recovers through the full, visible path.
        if (get().entitlements === null) return track(runLoad(set, get, fetchFn, defaultSleep, ++generation));
        return track(runRefresh(set, get, fetchFn, generation));
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
          selectedPersona: isSet(defaultCell) ? defaultCell.persona : null,
          selectedDomains: isSet(defaultCell) ? [defaultCell.domain] : [],
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
          if (c.persona === persona && typeof c.domain === "string" && !seen.has(c.domain)) {
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
          if (typeof c.persona === "string" && !seen.has(c.persona)) {
            seen.add(c.persona);
            out.push(c.persona);
          }
        }
        return out;
      },

      unsetPersona() {
        return (get().entitlements?.cells ?? []).some((c) => c.persona === null);
      },

      unsetDomainFor(persona) {
        return (get().entitlements?.cells ?? []).some((c) => c.persona === persona && c.domain === null);
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
