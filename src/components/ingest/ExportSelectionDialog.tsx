/**
 * ExportSelectionDialog -- "Export as..." on the lasso bar and on the review page (architect rulings 2026-11-10; wire
 * declared by saf's #356, see `reviewExport.ts`). There is no resolve route: kinds and states come from the status rows
 * (the caller's `targets`), and the unexportable list comes from `check_only` on picking a profile, BEFORE the download.
 * The user may proceed without the unexportable ones; only the cleared ids are ever sent. Select-by-range is hidden
 * (see the comment in `reviewExport.ts`). Nothing here names a kind, a state, a profile or a column.
 */
import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import {
  profilesFor,
  readUnexportableRefusal,
  type ExportCheck,
  type ExportProfile,
  type ExportTarget,
  type Unexportable,
} from "@/lib/reviewExport";
import { checkExport, exportNotices, loadExportProfiles } from "@/lib/reviewExportSource";
import { saveBlob } from "@/lib/saveBlob";
import {
  ExportFailureLine,
  ExportProfilePicker,
  classifyExportError,
  type ExportFailure,
} from "@/components/ApprovalTask/ExportProfilePicker";

const NOT_READY_REASON = "the upload has not been accepted yet; it has no ingest id";

export function ExportSelectionDialog({
  targets,
  notReady,
  others,
  source,
  onClose,
}: {
  targets: ExportTarget[];
  notReady: { id: string; label: string }[];
  others: number;
  /** The line shown in `data-export-source`: "N selected" on the lasso, the notice's ingest id on the review page. */
  source: string;
  onClose: () => void;
}) {
  const [profiles, setProfiles] = useState<ExportProfile[] | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [check, setCheck] = useState<{ profile: string; result: ExportCheck } | null>(null);
  const [checking, setChecking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [failure, setFailure] = useState<ExportFailure | null>(null);
  const counter = useRef(0);

  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCloseRef.current();
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, []);

  useEffect(() => {
    let live = true;
    loadExportProfiles().then(
      (p) => {
        if (live) setProfiles(p);
      },
      (e: unknown) => {
        if (live) setFailure(classifyExportError(e));
      },
    );
    return () => {
      live = false;
    };
  }, []);

  const offered = profilesFor(profiles ?? [], targets);
  const profile = offered.find((p) => p.name === selected) ?? null;
  useEffect(() => {
    if (selected !== null && !offered.some((p) => p.name === selected)) setSelected(null);
  });

  const allIds = targets.map((t) => t.ingestId);

  // A later pick wins over an earlier one: only the newest check may set state.
  async function pick(name: string) {
    const p = offered.find((x) => x.name === name);
    if (!p) return;
    const mine = ++counter.current;
    setSelected(name);
    setCheck(null);
    setFailure(null);
    setDone(false);
    setChecking(true);
    try {
      const r = await checkExport(p, allIds);
      if (mine !== counter.current) return;
      setCheck({ profile: name, result: r });
      setChecking(false);
    } catch (e) {
      if (mine !== counter.current) return;
      setFailure(classifyExportError(e));
      setChecking(false);
    }
  }

  const current = check !== null && check.profile === selected ? check.result : null;
  const unexportable: Unexportable[] = current?.unexportable ?? [];
  const blocked = new Set(unexportable.map((u) => u.notice_id));
  const cleared = allIds.filter((id) => !blocked.has(id));
  const skip = notReady.length + unexportable.length;

  async function download() {
    if (!profile || current === null || cleared.length === 0) return;
    setBusy(true);
    setFailure(null);
    setDone(false);
    try {
      const file = await exportNotices(profile, cleared);
      saveBlob(file.blob, file.filename ?? `export.${profile.name}.${profile.format}`);
      setDone(true);
    } catch (e) {
      // The state changed between the check and the download: the server's rows join the shown ones. Joining, not
      // replacing: the refusal names only ids that were sent, so a replace would clear the check's rows for a retry.
      const rows = readUnexportableRefusal(e);
      if (rows !== null) {
        const added = rows.filter((r) => !blocked.has(r.notice_id));
        setCheck({ profile: profile.name, result: { ...current, unexportable: [...current.unexportable, ...added] } });
      }
      setFailure(classifyExportError(e));
    } finally {
      setBusy(false);
    }
  }

  const loading = profiles === null && failure === null;
  const state = failure
    ? failure.kind
    : busy
      ? "downloading"
      : checking
        ? "checking"
        : done
          ? "done"
          : loading
            ? "loading"
            : targets.length === 0
              ? "empty"
              : "ready";

  const kinds = [...new Set(targets.map((t) => t.kind).filter((k): k is string => k !== null))];
  const states = [...new Set(targets.map((t) => t.state).filter((k): k is string => k !== null))];
  const blockedBy = [
    kinds.length > 0 ? kinds.join(", ") : null,
    states.length > 0 ? `in ${states.join(", ")}` : null,
  ].filter((x): x is string => x !== null);

  return (
    <div
      data-overlay
      data-export-dialog={state}
      role="dialog"
      aria-label="Export as"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
    >
      <div className="w-[480px] max-w-[92vw] max-h-[85vh] overflow-y-auto flex flex-col gap-3 rounded-xl border border-neon-cyan/30 bg-slate-950/95 backdrop-blur-sm p-4 shadow-xl">
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-mono uppercase tracking-widest text-slate-400">Export as…</span>
          <button type="button" data-export-close onClick={onClose} className="text-slate-500 hover:text-rose-400" title="Close">
            <X className="w-3 h-3" />
          </button>
        </div>

        <p className="text-[11px] font-mono text-slate-300" data-export-source>
          {source}
        </p>

        {others > 0 && (
          <p className="text-[11px] font-mono text-slate-500" data-export-others={others}>
            {others} selected card(s) are not notices and are not exported here.
          </p>
        )}

        {skip > 0 && (
          <ul className="flex flex-col gap-1 text-[11px] font-mono text-amber-400/90" data-export-unexportable={skip}>
            {notReady.map((n) => (
              <li key={`nr-${n.id}`} data-unexportable={n.id} data-reason-code="">
                {n.label}: {NOT_READY_REASON}
              </li>
            ))}
            {unexportable.map((u, i) => (
              <li key={`u-${i}-${u.notice_id}`} data-unexportable={u.notice_id} data-reason-code={u.reason} data-state={u.state ?? ""}>
                {u.notice_id}: {u.reason}
                {u.state !== null ? ` (state: ${u.state})` : ""}
              </li>
            ))}
          </ul>
        )}

        {loading ? null : targets.length === 0 ? (
          <p className="text-[11px] font-mono text-slate-500" data-export-empty>
            No exportable notices in this selection.
          </p>
        ) : profiles !== null && profiles.length === 0 ? (
          <p className="text-[11px] font-mono text-slate-500" data-export-no-profile>
            No export profile is available to you.
          </p>
        ) : profiles !== null && offered.length === 0 ? (
          <p className="text-[11px] font-mono text-slate-500" data-export-no-profile>
            No export profile you hold takes {blockedBy.length > 0 ? blockedBy.join(" ") : "this selection"}.
          </p>
        ) : profiles !== null ? (
          <ExportProfilePicker profiles={offered} selected={selected} onSelect={(n) => void pick(n)} />
        ) : null}

        <button
          type="button"
          data-export-download
          disabled={!profile || current === null || cleared.length === 0 || busy || checking}
          onClick={() => void download()}
          className="self-start px-3 py-1.5 rounded border text-[11px] font-mono uppercase tracking-widest disabled:opacity-40 cursor-pointer bg-neon-cyan/10 border-neon-cyan/50 text-neon-cyan"
        >
          {busy ? "..." : `Export ${cleared.length}, skip ${skip}`}
        </button>

        {failure && <ExportFailureLine failure={failure} />}
      </div>
    </div>
  );
}
