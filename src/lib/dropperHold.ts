import { usePersonaStore } from "@/store/usePersonaStore";
import type { Attestation } from "@/api/generated/ingestV1";

/**
 * The served attestation block: `payload.attestation`, stamped at filing by
 * `promotion.attestation_block` (ingest 1.9.0, #324) and declared as `TaskPayload.attestation` from
 * 1.9.1 (#325). The card does not work out who may promote; the server names them in `excluded`, and
 * its act route refuses on that same list. No `mode` is read here: a mode this card does not know
 * cannot open a hold.
 */
export type PromotionAttestation = Attestation;

/** The payload key the producer stamps, and the list in it the card reads. The producer seal checks both spellings. */
export const ATTESTATION_FIELD = "attestation";
export const ATTESTATION_EXCLUDED = "excluded";

/**
 * Why Promote is held on the attestation alone, or null.
 *
 * - No `attestation` key, or a null one (the act route reads null as absent): no hold; the server
 *   decides at the act.
 * - A present block that is not an object, or whose `excluded` is not a list of strings: held,
 *   `attestation-unreadable` (fail closed, Lane 1 11-10).
 * - The viewer's `authz_id` in `excluded`, exact compare: held, `dropper`.
 * - Viewer unknown: no hold; the server still refuses.
 */
export function attestationHold(
  payload: unknown,
  viewerAuthzId: string | null,
): "dropper" | "attestation-unreadable" | null {
  const block = payload && typeof payload === "object" ? (payload as Record<string, unknown>)[ATTESTATION_FIELD] : undefined;
  if (block === undefined || block === null) return null;
  if (typeof block !== "object" || Array.isArray(block)) return "attestation-unreadable";
  const excluded = (block as Record<string, unknown>)[ATTESTATION_EXCLUDED];
  if (!Array.isArray(excluded) || !excluded.every((v) => typeof v === "string")) return "attestation-unreadable";
  return viewerAuthzId !== null && excluded.includes(viewerAuthzId) ? "dropper" : null;
}

/**
 * The viewer's `acted_by`: `authz_id` from /me/entitlements only. Not `useDropIdentity`, whose OIDC
 * email fallback is not `acted_by` at work. Unknown means no hold; the server still refuses.
 */
export function viewerAuthzIdOf(entitlements: { authz_id?: string | null } | null | undefined): string | null {
  const id = entitlements?.authz_id;
  return typeof id === "string" && id !== "" ? id : null;
}

export const useViewerAuthzId = (): string | null =>
  usePersonaStore((s) => viewerAuthzIdOf(s.entitlements));
