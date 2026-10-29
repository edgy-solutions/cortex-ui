/**
 * accessFlag -- the two access-request flags (docs/specs/access-request-cards.md).
 *
 *   - `isAccessRequestsEnabled()`     gates the "Request access" button and the grantor's
 *     Grant / Deny card. OFF by default: ADR-0062 section 7 is Draft, so the wire they need is
 *     PROPOSED, not declared. The policy-refusal NOTICE itself is the declared wire and is never gated.
 *   - `isAccessRequestsMockEnabled()` answers `POST /access/proposals` from a fixture, no network.
 */

import { isFeatureEnabled } from "@/lib/featureFlags";

export function isAccessRequestsEnabled(): boolean {
  return isFeatureEnabled("accessRequests");
}

export function isAccessRequestsMockEnabled(): boolean {
  return isFeatureEnabled("accessRequestsMock");
}
