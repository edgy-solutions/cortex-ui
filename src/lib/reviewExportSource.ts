/**
 * reviewExportSource -- the seam: the fixture when `reviewExportMock` is on, else the client.
 * (Routes declared at invincible-agent 10ac02fe (#154) and 6a4175a2 (#356); see `reviewExport.ts`.) The status read is NOT here: it is a real route.
 */
import {
  fetchIngestExportProfiles,
  downloadIngestExport,
  checkNoticesExport,
  downloadNoticesExport,
  fetchEntitlements,
} from "@/api/client";
import { isReviewExportMockEnabled } from "./reviewExportFlag";
import {
  FIXTURE_ENTITLEMENTS,
  FIXTURE_PROFILES,
  canExportBatch,
  fixtureExportBody,
  fixtureCheck,
  type ExportCheck,
  type ExportProfile,
} from "./reviewExport";

export type ExportFile = { blob: Blob; filename: string | null };

export async function loadExportProfiles(): Promise<ExportProfile[]> {
  if (isReviewExportMockEnabled()) return FIXTURE_PROFILES;
  return fetchIngestExportProfiles();
}

export async function exportOne(ingestId: string, profile: ExportProfile): Promise<ExportFile> {
  if (isReviewExportMockEnabled()) return fixtureExportBody(profile, { ingestId });
  return downloadIngestExport(ingestId, profile.name);
}

export async function checkExport(profile: ExportProfile, ingestIds: string[]): Promise<ExportCheck> {
  if (isReviewExportMockEnabled()) return fixtureCheck(profile.name, ingestIds);
  return checkNoticesExport(profile.name, ingestIds);
}

export async function exportNotices(profile: ExportProfile, ingestIds: string[]): Promise<ExportFile> {
  if (isReviewExportMockEnabled()) return fixtureExportBody(profile, { ingestIds });
  return downloadNoticesExport(profile.name, ingestIds);
}

export async function loadCanExportBatch(): Promise<boolean> {
  return canExportBatch(isReviewExportMockEnabled() ? FIXTURE_ENTITLEMENTS : await fetchEntitlements());
}
