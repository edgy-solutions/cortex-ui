/**
 * ReviewExportAs -- "Export as..." on the review page, for the notice under review. Shown only when the `reviewExport`
 * flag is on and the caller holds `ingest:exportBatch` (the notices route's first gate). Two ways to know a profile
 * lists the notice:
 *  - the notice's state is READ (the `stage` the status route serves, through `useDocument`) and a served profile
 *    lists it in `exportable_states`;
 *  - the reviewer path: `GET /ingest/{id}/status` answers ONLY the submitter or `on_behalf_of` (anyone else gets a
 *    plain 404, so the store marks `notFound` and the row never arrives), and a reviewer holding the task reads only
 *    the extraction and the source, neither of which carries the state. With the row unreadable we ask the server the
 *    rule itself: `check_only` per candidate profile, and a profile is admitted when it names this notice in none of
 *    its `unexportable`. A check that fails admits nothing: an unknown answer is not a yes.
 * The dialog names the notice by its number (else `drop <12 hex>`), never its hash. A failed profile read renders
 * nothing. No state name is spelled here.
 */
import { useEffect, useState } from "react";
import { useDocument } from "@/lib/useDocument";
import { useCanExportSelection } from "@/lib/useCanExportSelection";
import { profilesFor, type ExportProfile, type ExportTarget } from "@/lib/reviewExport";
import { ingestLeadLine } from "@/lib/ingestArtifact";
import { checkExport, loadExportProfiles } from "@/lib/reviewExportSource";
import { useIngestStatusStore } from "@/store/useIngestStatusStore";
import { ExportSelectionDialog } from "@/components/ingest/ExportSelectionDialog";

export function ReviewExportAs({ ingestId, noticeId }: { ingestId: string; /** Display only: the number when the row is unreadable. */ noticeId?: string | null }) {
  const can = useCanExportSelection();
  const { row } = useDocument(ingestId);
  const unreadable = useIngestStatusStore((s) => s.notFound[ingestId] === true);
  const state = typeof row?.stage === "string" ? row.stage : null;
  const kind = row?.content_kind ?? null;
  const [profiles, setProfiles] = useState<ExportProfile[] | null>(null);
  const [admitted, setAdmitted] = useState<string[] | null>(null);
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

  const reviewerPath = state === null && unreadable;
  useEffect(() => {
    if (!can || !reviewerPath || profiles === null) return;
    let live = true;
    const candidates = profilesFor(profiles, [{ ingestId, kind: null, state: null, label: "" }]);
    // A check that rejects (network, 5xx) admits nothing for that profile: an unknown answer is not a yes.
    Promise.all(
      candidates.map((p) =>
        checkExport(p, [ingestId]).then(
          (c) => (c.unexportable.some((u) => u.notice_id === ingestId) ? null : p.name),
          () => null,
        ),
      ),
    ).then((names) => {
      if (live) setAdmitted(names.filter((n): n is string => n !== null));
    });
    return () => {
      live = false;
      setAdmitted(null);
    };
  }, [can, reviewerPath, profiles, ingestId]);

  if (!can || profiles === null) return null;
  const label = ingestLeadLine("", { notice_id: row?.notice_id ?? noticeId ?? null, ingest_id: ingestId });
  let offeredNames: string[] | undefined;
  if (state !== null) {
    if (profilesFor(profiles, [{ ingestId, kind, state, label }]).length === 0) return null;
  } else {
    if (!reviewerPath || admitted === null || admitted.length === 0) return null;
    offeredNames = admitted;
  }
  const target: ExportTarget = { ingestId, kind, state, label };

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
        <ExportSelectionDialog targets={[target]} notReady={[]} others={0} source={label} admitted={offeredNames} onClose={() => setOpen(false)} />
      )}
    </>
  );
}
