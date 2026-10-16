/**
 * WHICH PERSONA EACH WALK ROW ASKS AS. Architect ruling: "Persona-per-walk: yes. Each walk row names
 * its persona (WALK_BOB_*, WALK_ALICE_*, WALK_ERIN_*); a row without its persona's creds fails naming
 * the missing var, as the FRACAS row already does."
 *
 * Origin of truth for the role/domain: invincible-agent `docs/measurements/walk-census.yaml`. bob's
 * DEFAULT is DATA_STEWARD/[AVIATION, DOCS, MESH], so a walk that does not pick asks as the wrong persona.
 *
 * No Playwright import: the table is unit-reachable and nothing here touches a page.
 */
import type { WalkName } from "./walkEnv";

/** A user name is `WALK_<NAME>_USER` / `_PASSWORD` (creds() is generic over names). erin has no row today. */
export type WalkUser = "alice" | "bob" | "erin" | "atlantia";

export interface WalkPersona {
  user: WalkUser;
  /** Persona to pick in the picker, or null when the row needs no pick. */
  role: string | null;
  /**
   * Domains the row is scoped to. The picker is SINGLE-SELECT, so only `domains[0]` is clicked;
   * MESH and DOCS are platform domains, never offered, and stay in scope at send.
   */
  domains: readonly string[] | null;
  /** "brokered": signs in via the Keycloak identity broker (walkBroker.ts), not the local form. */
  login: "local" | "brokered";
}

export const WALK_PERSONAS = {
  pcn: {
    // The drop needs no persona pick: whatever alice does today stays.
    dropper: { user: "alice", role: null, domains: null, login: "local" },
    // census row `sustainment-which-parts-does-pcn26-182-affect` (the ask)
    asker: { user: "bob", role: "SAFETY_ENGINEER", domains: ["SUSTAINMENT"], login: "local" },
  },
  // census row `safety-haz-1003-risk-assessment`
  haz: { user: "bob", role: "SAFETY_ENGINEER", domains: ["SUSTAINMENT"], login: "local" },
  // census row `repro-failures-recorded-for-part-5530-184`
  fracas: { user: "bob", role: "SAFETY_ENGINEER", domains: ["SUSTAINMENT"], login: "local" },
  // no census row: it only checks the stale-bundle pill, so it declares a user and no pick.
  stale: { user: "bob", role: null, domains: null, login: "local" },
  // operator.atlantia holds no grant until Lane 1 seeds one: the cell is CHECKED (WALK_ATLANTIA_CELL), never pre-declared.
  broker: { user: "atlantia", role: null, domains: null, login: "brokered" },
} as const satisfies { [K in WalkName]: WalkPersona | { dropper: WalkPersona; asker: WalkPersona } };

/** The live test titles, here so a mock spec can check each says the user the table declares. */
export const WALK_TITLES = {
  haz: "HAZ walk: draft a risk assessment for HAZ-1003 as bob (live)",
  fracas: "FRACAS walk: failures for part 5530-184 as bob (live)",
  broker: "broker walk: operator.atlantia brokered login lands with a cell (live)",
} as const;
