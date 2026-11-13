/**
 * reviewExportSource -- the seam: the fixture when `reviewExportMock` is on, else the client.
 * (Only #356's notices routes (6a4175a2) and the #154 profiles read (10ac02fe) remain; see `reviewExport.ts`.) The status read is NOT here: it is a real route.
 */
import {
  fetchIngestExportProfiles,
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
  fixtureCheckRange,
  type ExportCheck,
  type ExportProfile,
  type ExportRange,
} from "./reviewExport";

export type ExportFile = { blob: Blob; filename: string | null };

export async function loadExportProfiles(): Promise<ExportProfile[]> {
  if (isReviewExportMockEnabled()) return FIXTURE_PROFILES;
  return fetchIngestExportProfiles();
}

export async function checkExport(profile: ExportProfile, ingestIds: string[]): Promise<ExportCheck> {
  if (isReviewExportMockEnabled()) return fixtureCheck(profile.name, ingestIds);
  return checkNoticesExport(profile.name, { notice_ids: ingestIds });
}

/** The range form (#364, behind `exportRange`): the reply carries the RESOLVED ids as `noticeIds`. */
export async function checkExportRange(profile: ExportProfile, range: ExportRange): Promise<ExportCheck> {
  if (isReviewExportMockEnabled()) return fixtureCheckRange(profile.name, range);
  return checkNoticesExport(profile.name, { range });
}

export async function exportNotices(profile: ExportProfile, ingestIds: string[]): Promise<ExportFile> {
  if (isReviewExportMockEnabled()) return fixtureExportBody(profile, { ingestIds });
  return downloadNoticesExport(profile.name, ingestIds);
}

export async function loadCanExportBatch(): Promise<boolean> {
  return canExportBatch(isReviewExportMockEnabled() ? FIXTURE_ENTITLEMENTS : await fetchEntitlements());
}
