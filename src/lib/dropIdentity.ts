import type { Entitlements } from "@/api/types";

/**
 * The `on_behalf_of` a drop (upload or origin dispute) sends for the caller themself.
 *
 * The gateway (`_admit_on_behalf_of`) reads `on_behalf_of` equal to the caller's `authz_id` as a
 * self-drop and ANY other value as a delegation, refused `not_a_delegate` for a non-delegate. The
 * OIDC email equals `authz_id` only while `USER_ENTITLEMENT_CLAIM` is "email" — true in the
 * sandbox, false at work (`preferred_username`), where every drop was refused.
 *
 * - `/me/entitlements` carries `authz_id` → that, and nothing else.
 * - It carries the key but blank or not a string → null (upload disabled). The server named the
 *   key and it is unusable; the email would only be refused.
 * - It does not carry the key (a BFF older than `7a98f7bd`), or entitlements are not loaded →
 *   the email: exactly the behaviour before `authz_id` existed, so either side can ship first.
 */
export function dropIdentity(entitlements: Entitlements | null, email: string | null | undefined): string | null {
  if (entitlements && Object.prototype.hasOwnProperty.call(entitlements, "authz_id")) {
    const id: unknown = entitlements.authz_id;
    return typeof id === "string" && id.trim() !== "" ? id : null;
  }
  return email ? email : null;
}

/** Why a drop is disabled when `dropIdentity` is null. */
export const NO_DROP_IDENTITY = "No drop identity (authz_id or verified email) available — upload is disabled until one is.";
