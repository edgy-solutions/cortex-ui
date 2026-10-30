/** reviewExportFlag -- the two review-export flags (precedent: `ingestFlag.ts`). */
import { isFeatureEnabled } from "@/lib/featureFlags";

export function isReviewExportEnabled(): boolean {
  return isFeatureEnabled("reviewExport");
}

/** Serves the #154 routes (declared at invincible-agent 10ac02fe) and the proposed `groups` from the fixture; the status read is still made. */
export function isReviewExportMockEnabled(): boolean {
  return isFeatureEnabled("reviewExportMock");
}
