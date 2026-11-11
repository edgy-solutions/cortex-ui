/**
 * ReviewExportAs -- "Export as..." on the review page, for the notice under review. Shown only when the `reviewExport`
 * flag is on, the caller holds `ingest:exportBatch` (the notices route's first gate), the notice's state is KNOWN (the
 * `stage` the status route serves, read through `useDocument`) and at least one served profile lists that state in its
 * `exportable_states`. A failed profile read renders nothing. No state name is spelled here.
 */
import { useEffect, useState } from "react";
import { useDocument } from "@/lib/useDocument";
import { useCanExportSelection } from "@/lib/useCanExportSelection";
import { profilesFor, type ExportProfile, type ExportTarget } from "@/lib/reviewExport";
import { loadExportProfiles } from "@/lib/reviewExportSource";
import { ExportSelectionDialog } from "@/components/ingest/ExportSelectionDialog";

export function ReviewExportAs({ ingestId }: { ingestId: string }) {
  const can = useCanExportSelection();
  const { row } = useDocument(ingestId);
  const state = typeof row?.stage === "string" ? row.stage : null;
  const kind = row?.content_kind ?? null;
  const [profiles, setProfiles] = useState<ExportProfile[] | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!can) return;
    let live = true;
    loadExportProfiles().then(
      (p) => {
        if (live) setProfiles(p);
      },
      () => {
        if (live) setProfiles(null);
      },
    );
    return () => {
      live = false;
    };
  }, [can]);

  if (!can || state === null || profiles === null) return null;
  const target: ExportTarget = { ingestId, kind, state };
  if (profilesFor(profiles, [target]).length === 0) return null;

  return (
    <>
      <button
        type="button"
        data-review-export-as
        onClick={() => setOpen(true)}
        className="mt-2 px-3 py-1.5 rounded border text-[11px] font-mono uppercase tracking-widest cursor-pointer bg-neon-cyan/10 border-neon-cyan/50 text-neon-cyan"
      >
        Export as…
      </button>
      {open && (
        <ExportSelectionDialog targets={[target]} notReady={[]} others={0} source={ingestId} onClose={() => setOpen(false)} />
      )}
    </>
  );
}
