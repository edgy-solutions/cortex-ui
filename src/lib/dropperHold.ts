import { usePersonaStore } from "@/store/usePersonaStore";

/**
 * Mirror of the BFF's `_excluded_attesters` (`src/iagent/promotion.py`): the ids that may not attest
 * the origin of their own drop. The server refuses `promoted` from them with
 * `dropper_cannot_attest_origin` (403), so the card must not offer a button that can only be refused.
 * Exact string compare, no trim, no case folding, as the server does. A legacy string `dropped_by`
 * excludes nobody.
 */
export function excludedAttesters(payload: unknown): Set<string> {
  const dropped =
    payload && typeof payload === "object" ? (payload as Record<string, unknown>).dropped_by : undefined;
  if (!dropped || typeof dropped !== "object" || Array.isArray(dropped)) return new Set();
  const d = dropped as Record<string, unknown>;
  return new Set([d.authz_id, d.on_behalf_of].filter((v): v is string => typeof v === "string" && v !== ""));
}

export function viewerIsDropper(payload: unknown, viewerAuthzId: string | null): boolean {
  return viewerAuthzId !== null && excludedAttesters(payload).has(viewerAuthzId);
}

/**
 * The viewer's `acted_by`: `authz_id` from /me/entitlements only. Not `useDropIdentity`, whose OIDC
 * email fallback is not `acted_by` at work. Unknown means no hold; the server still refuses.
 */
export function viewerAuthzIdOf(entitlements: { authz_id?: string } | null | undefined): string | null {
  const id = entitlements?.authz_id;
  return typeof id === "string" && id !== "" ? id : null;
}

export const useViewerAuthzId = (): string | null =>
  usePersonaStore((s) => viewerAuthzIdOf(s.entitlements));
