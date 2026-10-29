/**
 * reviewExportSource -- the seam: the fixture when `reviewExportMock` is on, else the client.
 * (PROPOSED routes; see `reviewExport.ts`.) The status read is NOT here: it is a real route.
 */
import { fetchIngestExportProfiles, downloadIngestExport, downloadBatchExport, fetchEntitlements } from "@/api/client";
import { isReviewExportMockEnabled } from "./reviewExportFlag";
import {
  AP_GROUP,
  PROPOSED_FIXTURE_GROUPS,
  PROPOSED_FIXTURE_PROFILES,
  canExportBatch,
  fixtureExportBody,
  type ExportProfile,
} from "./reviewExport";

export type ExportFile = { blob: Blob; filename: string | null };

export async function loadExportProfiles(): Promise<ExportProfile[]> {
  if (isReviewExportMockEnabled()) return PROPOSED_FIXTURE_PROFILES;
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
  if (isReviewExportMockEnabled()) return PROPOSED_FIXTURE_GROUPS.includes(AP_GROUP);
  return canExportBatch(await fetchEntitlements());
}
