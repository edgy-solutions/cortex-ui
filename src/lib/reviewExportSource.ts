/**
 * reviewExportSource -- the seam: the fixture when `reviewExportMock` is on, else the client.
 * (Routes declared at invincible-agent 10ac02fe (#154); see `reviewExport.ts`. The resolve route and the POST
 * download are PROVISIONAL, cortex-proposed.) The status read is NOT here: it is a real route.
 */
import {
  fetchIngestExportProfiles,
  downloadIngestExport,
  downloadSelectionExport,
  resolveIngestExport,
  fetchEntitlements,
} from "@/api/client";
import { isReviewExportMockEnabled } from "./reviewExportFlag";
import {
  FIXTURE_ENTITLEMENTS,
  FIXTURE_PROVISIONAL_PROFILES,
  canExportBatch,
  fixtureExportBody,
  fixtureResolution,
  type ExportProfile,
  type ExportResolution,
  type ExportScope,
} from "./reviewExport";

export type ExportFile = { blob: Blob; filename: string | null };

export async function loadExportProfiles(): Promise<ExportProfile[]> {
  if (isReviewExportMockEnabled()) return FIXTURE_PROVISIONAL_PROFILES;
  return fetchIngestExportProfiles();
}

export async function exportOne(ingestId: string, profile: ExportProfile): Promise<ExportFile> {
  if (isReviewExportMockEnabled()) return fixtureExportBody(profile, { ingestId });
  return downloadIngestExport(ingestId, profile.name);
}

export async function resolveExport(scope: ExportScope): Promise<ExportResolution> {
  if (isReviewExportMockEnabled()) return fixtureResolution(scope);
  return resolveIngestExport(scope);
}

export async function exportSelection(profile: ExportProfile, ingestIds: string[]): Promise<ExportFile> {
  if (isReviewExportMockEnabled()) return fixtureExportBody(profile, { ingestIds });
  return downloadSelectionExport(profile.name, ingestIds);
}

export async function loadCanExportBatch(): Promise<boolean> {
  return canExportBatch(isReviewExportMockEnabled() ? FIXTURE_ENTITLEMENTS : await fetchEntitlements());
}
