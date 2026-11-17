import { inScope } from "@/lib/platformDomains";
import type { usePersonaStore } from "@/store/usePersonaStore";

/**
 * WHETHER A QUESTION MAY BE SENT, decided once, at send.
 *
 * Ruling, architect via Chris, 2026-11-16: "cortex: do not send a question until the entitlement
 * list has loaded; if it fails to load, say so and do not send."
 *
 * Before this, a send with no matrix loaded simply omitted the cell, and the server silently fell
 * back to the caller's default cell: an answer asked under a scope the reader never chose, with
 * nothing saying so. A LOADED matrix (even one with zero cells) is ready; a refresh failure keeps
 * the matrix, so a stale `entitlementsError` beside a matrix must not block.
 */
export type SendCell = { active_persona: string; active_domains: string[] };

export type SendReadiness =
  | { ready: true; cell: SendCell | undefined }
  | { ready: false; why: "loading" | "failed"; message: string };

type PersonaState = ReturnType<typeof usePersonaStore.getState>;
export type SendReadinessSlice = Pick<
  PersonaState,
  "entitlements" | "entitlementsError" | "selectedPersona" | "selectedDomains" | "hasEntitlements" | "domainsFor"
>;

export function sendReadiness(s: SendReadinessSlice): SendReadiness {
  if (s.entitlements === null) {
    if (s.entitlementsError) {
      return {
        ready: false,
        why: "failed",
        message: `Your entitlements did not load (${s.entitlementsError}), so nothing was sent. It retries on its own every few minutes.`,
      };
    }
    return {
      ready: false,
      why: "loading",
      message: "Your entitlements are still loading; questions can be sent once they have.",
    };
  }
  const cell: SendCell | undefined =
    s.hasEntitlements() && s.selectedPersona
      ? {
          active_persona: s.selectedPersona,
          // The pick, plus the persona's entitled platform domains (MESH, DOCS).
          active_domains: inScope(s.selectedDomains, s.domainsFor(s.selectedPersona)),
        }
      : undefined;
  return { ready: true, cell };
}
