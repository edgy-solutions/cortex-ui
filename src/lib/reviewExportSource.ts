/**
 * reviewExportSource -- the seam: the fixture when `reviewExportMock` is on, else the client.
 * (Routes declared at invincible-agent 10ac02fe (#154); see `reviewExport.ts`.) The status read is NOT here: it is a real route.
 */
import { fetchIngestExportProfiles, downloadIngestExport, downloadBatchExport, fetchEntitlements } from "@/api/client";
import { isReviewExportMockEnabled } from "./reviewExportFlag";
import {
  FIXTURE_ENTITLEMENTS,
  FIXTURE_154_PROFILES,
  canExportBatch,
  fixtureExportBody,
  type ExportProfile,
} from "./reviewExport";

export type ExportFile = { blob: Blob; filename: string | null };

export async function loadExportProfiles(): Promise<ExportProfile[]> {
  if (isReviewExportMockEnabled()) return FIXTURE_154_PROFILES;
  return fetchIngestExportProfiles();
}

export async function exportOne(ingestId: string, profile: ExportProfile): Promise<ExportFile> {
  if (isReviewExportMockEnabled()) return fixtureExportBody(profile, { ingestId });
  return downloadIngestExport(ingestId, profile.name);
}

export async function exportBatch(profile: ExportProfile, from: string, to: string): Promise<ExportFile> {
  if (isReviewExportMockEnabled()) return fixtureExportBody(profile, { from, to });
  return downloadBatchExport(profile.name, from, to);
}

export async function loadCanExportBatch(): Promise<boolean> {
  return canExportBatch(isReviewExportMockEnabled() ? FIXTURE_ENTITLEMENTS : await fetchEntitlements());
}
