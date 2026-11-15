import { useMemo, useState, type ReactNode } from "react";
import { useCanvasStore } from "@/store/useCanvasStore";
import { useStageStore } from "@/store/useStageStore";
import { useIngestStatusStore } from "@/store/useIngestStatusStore";
import { lassoTargets } from "@/lib/reviewExport";
import { useCanExportSelection } from "@/lib/useCanExportSelection";
import { ExportSelectionDialog } from "@/components/ingest/ExportSelectionDialog";

/**
 * The selection actions — add to a canvas, start a new canvas, export — in ONE place, for both
 * callers: the stage's lasso and the answers list. A second copy of these handlers is how one
 * surface's "Add to" would drift from the other's. `ids` is the caller's selection in the order
 * it wants them added — or a getter, read at the moment of the act (the list's on-screen order is
 * only known after its rows render); `onDone` clears it (called after add / new, as the lasso always did).
 *
 * `onExport` is undefined when `useCanExportSelection` is false, so the bar hides the button.
 * `exportDialog` is rendered by the caller OUTSIDE the bar's own condition: the dialog outlives
 * the selection it was opened with.
 */
export function useSelectionActions(ids: string[] | (() => string[]), onDone: () => void) {
  const idsNow = () => (typeof ids === "function" ? ids() : ids);
  const artifacts = useCanvasStore((s) => s.artifacts);
  const canvases = useStageStore((s) => s.canvases);
  const addItemAuto = useStageStore((s) => s.addItemAuto);
  const createCanvas = useStageStore((s) => s.createCanvas);
  const canExport = useCanExportSelection();
  const [exportIds, setExportIds] = useState<string[] | null>(null);
  // The dialog reads kinds and states from the status rows as they stand when it opens.
  const exportParts = useMemo(
    () => (exportIds ? lassoTargets(artifacts, exportIds, useIngestStatusStore.getState().rows) : null),
    [exportIds, artifacts],
  );

  const onAdd = (canvasId: string) => {
    idsNow().forEach((id) => addItemAuto(canvasId, id));
    onDone();
  };
  const onNew = () => {
    const id = createCanvas(`Canvas ${canvases.length + 1}`, undefined, false);
    idsNow().forEach((aid) => addItemAuto(id, aid));
    onDone();
  };
  const onExport = canExport ? () => setExportIds(idsNow()) : undefined;

  const exportDialog: ReactNode =
    exportIds && exportParts ? (
      <ExportSelectionDialog
        targets={exportParts.targets}
        notReady={exportParts.notReady}
        others={exportParts.others}
        source={`${exportIds.length} selected`}
        onClose={() => setExportIds(null)}
      />
    ) : null;

  return { canvases, onAdd, onNew, onExport, exportDialog };
}
