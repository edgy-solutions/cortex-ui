/**
 * useCanExportSelection -- whether the lasso bar offers "Export as...". Shown only with the `reviewExport` flag on
 * AND the caller holding the export capability (`canExportBatch`, read through `loadCanExportBatch`). A failed read
 * means not shown, never a door that refuses.
 */
import { useEffect, useState } from "react";
import { isReviewExportEnabled } from "@/lib/reviewExportFlag";
import { loadCanExportBatch } from "@/lib/reviewExportSource";

export function useCanExportSelection(): boolean {
  const enabled = isReviewExportEnabled();
  const [can, setCan] = useState(false);
  useEffect(() => {
    if (!enabled) return;
    let live = true;
    loadCanExportBatch().then(
      (v) => {
        if (live) setCan(v);
      },
      () => {
        if (live) setCan(false);
      },
    );
    return () => {
      live = false;
    };
  }, [enabled]);
  return enabled && can;
}
