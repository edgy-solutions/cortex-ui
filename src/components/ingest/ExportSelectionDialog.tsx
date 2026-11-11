/**
 * ExportSelectionDialog -- "Export as..." on the lasso bar (architect rulings 2026-11-10; see `reviewExport.ts`).
 * It resolves the selection to its notices, lists what cannot be exported and why BEFORE the download, and offers
 * only the profiles that accept EVERY content kind present. The user may proceed without the unexportable ones; only
 * the resolved notices are ever sent. "Select by range" replaces the resolution with a date range's. Nothing here
 * names a kind, a profile or a column: they are all read from what the server serves.
 */
import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import type { Artifact } from "@/api/types";
import {
  profilesAccepting,
  selectionNotices,
  type ExportProfile,
  type ExportResolution,
  type ExportScope,
} from "@/lib/reviewExport";
import { exportSelection, loadExportProfiles, resolveExport } from "@/lib/reviewExportSource";
import { saveBlob } from "@/lib/saveBlob";
import {
  ExportFailureLine,
  ExportProfilePicker,
  classifyExportError,
  type ExportFailure,
} from "@/components/ApprovalTask/ExportProfilePicker";

type Mode = { kind: "ids" } | { kind: "range"; from: string; to: string };
type Row = { key: string; ref: string; reason: string; code: string | null; dataKey: string };

const NOT_READY_REASON = "the upload has not been accepted yet; it has no ingest id";

export function ExportSelectionDialog({
  artifacts,
  selection,
  onClose,
}: {
  artifacts: Artifact[];
  selection: string[];
  onClose: () => void;
}) {
  const [part] = useState(() => selectionNotices(artifacts, selection));
  const [profiles, setProfiles] = useState<ExportProfile[] | null>(null);
  const [resolution, setResolution] = useState<ExportResolution | null>(
    part.ingestIds.length > 0 ? null : { notices: [], unexportable: [] },
  );
  const [mode, setMode] = useState<Mode>({ kind: "ids" });
  const [selected, setSelected] = useState<string | null>(null);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
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

  // A later resolve (a range) wins over an earlier one: only the newest request may set state.
  async function resolve(scope: ExportScope, next: Mode) {
    const mine = ++counter.current;
    setFailure(null);
    setDone(false);
    try {
      const r = await resolveExport(scope);
      if (mine !== counter.current) return;
      setResolution(r);
      setMode(next);
    } catch (e) {
      if (mine !== counter.current) return;
      setFailure(classifyExportError(e));
    }
  }

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
    if (part.ingestIds.length > 0) void resolve({ ingestIds: part.ingestIds }, { kind: "ids" });
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once, on mount
  }, []);

  const notices = resolution?.notices ?? [];
  const kinds = [...new Set(notices.map((n) => n.content_kind))];
  const offered = profilesAccepting(profiles ?? [], kinds);
  const profile = offered.find((p) => p.name === selected) ?? null;
  useEffect(() => {
    if (selected !== null && !offered.some((p) => p.name === selected)) setSelected(null);
  });

  // Client-known drops (id mode only) come first, then the server's list.
  const rows: Row[] = [
    ...(mode.kind === "ids"
      ? part.notReady.map((n) => ({ key: `nr-${n.id}`, ref: n.label, reason: NOT_READY_REASON, code: null, dataKey: n.id }))
      : []),
    ...(resolution?.unexportable ?? []).map((u, i) => ({
      key: `u-${i}`,
      ref: u.notice_id ?? u.ingest_id ?? "unknown",
      reason: u.reason,
      code: u.reason_code,
      dataKey: u.ingest_id ?? u.notice_id ?? "unknown",
    })),
  ];
  const skip = rows.length;

  const inverted = from !== "" && to !== "" && from > to;
  const loading = resolution === null || (profiles === null && failure === null);
  const state = failure
    ? failure.kind
    : busy
      ? "downloading"
      : done
        ? "done"
        : loading
          ? "loading"
          : notices.length === 0
            ? "empty"
            : "ready";

  async function download() {
    if (!profile || notices.length === 0) return;
    setBusy(true);
    setFailure(null);
    setDone(false);
    try {
      const file = await exportSelection(profile, notices.map((n) => n.ingest_id));
      saveBlob(file.blob, file.filename ?? `export.${profile.name}.${profile.format}`);
      setDone(true);
    } catch (e) {
      setFailure(classifyExportError(e));
    } finally {
      setBusy(false);
    }
  }

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
          {mode.kind === "range" ? `range ${mode.from} to ${mode.to}` : `${selection.length} selected`}
        </p>

        {mode.kind === "ids" && part.others > 0 && (
          <p className="text-[11px] font-mono text-slate-500" data-export-others={part.others}>
            {part.others} selected card(s) are not notices and are not exported here.
          </p>
        )}

        <div className="flex flex-col gap-1" data-export-range>
          <div className="flex items-center gap-2 text-[11px] font-mono text-slate-300">
            <label className="flex items-center gap-1">
              From
              <input type="date" data-range-from value={from} onChange={(e) => setFrom(e.target.value)} className="bg-slate-900/50 border border-slate-800/60 rounded px-1" />
            </label>
            <label className="flex items-center gap-1">
              To
              <input type="date" data-range-to value={to} onChange={(e) => setTo(e.target.value)} className="bg-slate-900/50 border border-slate-800/60 rounded px-1" />
            </label>
            <button
              type="button"
              data-range-apply
              disabled={from === "" || to === "" || inverted}
              onClick={() => void resolve({ from, to }, { kind: "range", from, to })}
              className="px-2 py-1 rounded border text-[10px] font-mono uppercase tracking-widest disabled:opacity-40 cursor-pointer border-slate-600/60 text-slate-300"
            >
              Select by range
            </button>
          </div>
          {inverted && (
            <p className="text-[11px] font-mono text-amber-400/90" data-range-error>
              From is after To.
            </p>
          )}
        </div>

        {skip > 0 && (
          <ul className="flex flex-col gap-1 text-[11px] font-mono text-amber-400/90" data-export-unexportable={skip}>
            {rows.map((r) => (
              <li key={r.key} data-unexportable={r.dataKey} data-reason-code={r.code ?? ""}>
                {r.ref}: {r.reason}
                {r.code ? ` (${r.code})` : ""}
              </li>
            ))}
          </ul>
        )}

        {loading ? null : notices.length === 0 ? (
          <p className="text-[11px] font-mono text-slate-500" data-export-empty>
            No exportable notices in this selection.
          </p>
        ) : profiles !== null && profiles.length === 0 ? (
          <p className="text-[11px] font-mono text-slate-500" data-export-no-profile>
            No export profile is available to you.
          </p>
        ) : profiles !== null && offered.length === 0 ? (
          <p className="text-[11px] font-mono text-slate-500" data-export-no-profile>
            No export profile accepts every kind selected: {kinds.join(", ")}.
          </p>
        ) : profiles !== null ? (
          <ExportProfilePicker profiles={offered} selected={selected} onSelect={setSelected} />
        ) : null}

        <button
          type="button"
          data-export-download
          disabled={!profile || notices.length === 0 || busy}
          onClick={() => void download()}
          className="self-start px-3 py-1.5 rounded border text-[11px] font-mono uppercase tracking-widest disabled:opacity-40 cursor-pointer bg-neon-cyan/10 border-neon-cyan/50 text-neon-cyan"
        >
          {busy ? "..." : `Export ${notices.length}${skip > 0 ? `, skip ${skip}` : ""}`}
        </button>

        {failure && <ExportFailureLine failure={failure} />}
      </div>
    </div>
  );
}
