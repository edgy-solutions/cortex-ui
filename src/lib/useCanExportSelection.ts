/**
 * useCanExportSelection -- whether the lasso bar offers "Export as...". Shown only with the `reviewExport` flag on
 * AND the caller holding the export capability (`canExportBatch`). It READS THE STORE and never the wire: the
 * session owner (`useEntitlementsSync`) loads and refreshes the matrix once for everyone, so a control that mounts
 * costs no request. No matrix yet (or a failed first load) is false -- not shown, never a door that refuses.
 */
import { isReviewExportEnabled, isReviewExportMockEnabled } from "@/lib/reviewExportFlag";
import { FIXTURE_ENTITLEMENTS, canExportBatch } from "@/lib/reviewExport";
import { usePersonaStore } from "@/store/usePersonaStore";

export function useCanExportSelection(): boolean {
  const stored = usePersonaStore((s) => s.entitlements);
  const source = isReviewExportMockEnabled() ? FIXTURE_ENTITLEMENTS : stored;
  return isReviewExportEnabled() && canExportBatch(source);
}
