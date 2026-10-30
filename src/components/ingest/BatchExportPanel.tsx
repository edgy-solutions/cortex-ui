/**
 * BatchExportPanel -- the batch export. Shown only with the `reviewExport` flag on AND the caller
 * holding the export grant: RULED (2026-10-30) as the Topaz-derived `capabilities` list on
 * /me/entitlements (`ingest:exportBatch`), not yet served -- see the GAP in
 * `src/lib/reviewExport.ts`. A failed entitlements read means not shown.
 */
import { useEffect, useState } from "react";
import { isReviewExportEnabled } from "@/lib/reviewExportFlag";
import type { ExportProfile } from "@/lib/reviewExport";
import { exportBatch, loadCanExportBatch, loadExportProfiles } from "@/lib/reviewExportSource";
import { saveBlob } from "@/lib/saveBlob";
import {
  ExportFailureLine,
  ExportProfilePicker,
  classifyExportError,
  type ExportFailure,
} from "@/components/ApprovalTask/ExportProfilePicker";

export function BatchExportPanel() {
  const enabled = isReviewExportEnabled();
  const [member, setMember] = useState(false);
  const [profiles, setProfiles] = useState<ExportProfile[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<ExportFailure | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!enabled) return;
    let live = true;
    (async () => {
      try {
        if (!(await loadCanExportBatch())) return;
        const list = await loadExportProfiles();
        if (!live) return;
        setProfiles(list);
        setMember(true);
      } catch {
        /* a failed read is not shown */
      }
    })();
    return () => {
      live = false;
    };
  }, [enabled]);

  if (!enabled || !member) return null;

  const profile = profiles.find((p) => p.name === selected) ?? null;
  const inverted = from !== "" && to !== "" && from > to;
  const ready = from !== "" && to !== "" && profile !== null && !inverted;

  async function download() {
    if (!profile || !ready) return;
    setBusy(true);
    setFailure(null);
    setDone(false);
    try {
      const file = await exportBatch(profile, from, to);
      saveBlob(file.blob, file.filename ?? `${from}_${to}.${profile.name}.${profile.format}`);
      setDone(true);
    } catch (e) {
      setFailure(classifyExportError(e));
    } finally {
      setBusy(false);
    }
  }

  const state = busy ? "downloading" : failure ? failure.kind : done ? "done" : profiles.length === 0 ? "empty" : "ready";

  return (
    <div className="px-3 pt-2 flex flex-col gap-2 flex-shrink-0" data-batch-export={state}>
      <span className="text-[10px] font-mono uppercase tracking-widest text-slate-400">Batch export</span>
      <div className="flex items-center gap-2 text-[11px] font-mono text-slate-300">
        <label className="flex items-center gap-1">
          From
          <input type="date" data-batch-from value={from} onChange={(e) => setFrom(e.target.value)} className="bg-slate-900/50 border border-slate-800/60 rounded px-1" />
        </label>
        <label className="flex items-center gap-1">
          To
          <input type="date" data-batch-to value={to} onChange={(e) => setTo(e.target.value)} className="bg-slate-900/50 border border-slate-800/60 rounded px-1" />
        </label>
      </div>
      {profiles.length === 0 ? (
        <p className="text-[11px] font-mono text-slate-500">No export profiles are configured.</p>
      ) : (
        <ExportProfilePicker profiles={profiles} selected={selected} onSelect={setSelected} />
      )}
      {inverted && (
        <p className="text-[11px] font-mono text-amber-400/90" data-batch-range-error>
          From is after To.
        </p>
      )}
      <button
        type="button"
        data-batch-download
        disabled={!ready || busy}
        onClick={() => void download()}
        className="self-start px-3 py-1.5 rounded border text-[11px] font-mono uppercase tracking-widest disabled:opacity-40 cursor-pointer bg-neon-cyan/10 border-neon-cyan/50 text-neon-cyan"
      >
        {busy ? "Downloading..." : "Download"}
      </button>
      {failure && <ExportFailureLine failure={failure} />}
    </div>
  );
}
