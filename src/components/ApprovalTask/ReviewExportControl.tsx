/**
 * ReviewExportControl -- export on a COMPLETED review card (`stage === "promoted"` on the real
 * status row, read through `useDocument`: the one ingest poller, never a fetch of its own). Profiles come from the server's list (declared at invincible-agent 10ac02fe (#154); see
 * `src/lib/reviewExport.ts`). Renders nothing unless the `reviewExport` flag is on, and nothing
 * (not even a marker) until the status read says promoted.
 */
import { useEffect, useState } from "react";
import { useDocument } from "@/lib/useDocument";
import { isReviewExportEnabled } from "@/lib/reviewExportFlag";
import { isExportStage, type ExportProfile } from "@/lib/reviewExport";
import { exportOne, loadExportProfiles } from "@/lib/reviewExportSource";
import { saveBlob } from "@/lib/saveBlob";
import { ExportFailureLine, ExportProfilePicker, classifyExportError, type ExportFailure } from "./ExportProfilePicker";

type Phase = "gate" | "loading" | "ready" | "downloading" | "done" | "empty" | "refused" | "failed";

export function ReviewExportControl({ ingestId }: { ingestId: string }) {
  const enabled = isReviewExportEnabled();
  const [phase, setPhase] = useState<Phase>("gate");
  const [profiles, setProfiles] = useState<ExportProfile[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [failure, setFailure] = useState<ExportFailure | null>(null);

  // The stage comes from the shared status store (documents.test.tsx's census: one poller).
  const { row } = useDocument(ingestId);
  const promoted = isExportStage(row?.stage);

  useEffect(() => {
    if (!enabled) return;
    let live = true;
    setPhase("gate");
    (async () => {
      if (!promoted) return;
      setPhase("loading");
      try {
        const list = await loadExportProfiles();
        if (!live) return;
        setProfiles(list);
        setPhase(list.length === 0 ? "empty" : "ready");
      } catch (e) {
        if (!live) return;
        setFailure(classifyExportError(e));
        setPhase("failed");
      }
    })();
    return () => {
      live = false;
    };
  }, [enabled, promoted]);

  if (!enabled || phase === "gate") return null;

  const profile = profiles.find((p) => p.name === selected) ?? null;

  async function download() {
    if (!profile) return;
    setPhase("downloading");
    setFailure(null);
    try {
      const file = await exportOne(ingestId, profile);
      saveBlob(file.blob, file.filename ?? `${ingestId}.${profile.name}.${profile.format}`);
      setPhase("done");
    } catch (e) {
      const f = classifyExportError(e);
      setFailure(f);
      setPhase(f.kind);
    }
  }

  return (
    <div className="mt-3 flex flex-col gap-2" data-review-export={phase}>
      <span className="text-[10px] font-mono uppercase tracking-widest text-slate-400">Export</span>
      {phase === "loading" && <p className="text-[11px] font-mono text-slate-500">Loading export profiles...</p>}
      {phase === "empty" && <p className="text-[11px] font-mono text-slate-500">No export profiles are configured.</p>}
      {profiles.length > 0 && <ExportProfilePicker profiles={profiles} selected={selected} onSelect={setSelected} />}
      {profiles.length > 0 && (
        <button
          type="button"
          data-export-download
          disabled={!profile || phase === "downloading"}
          onClick={() => void download()}
          className="self-start px-3 py-1.5 rounded border text-[11px] font-mono uppercase tracking-widest disabled:opacity-40 cursor-pointer bg-neon-cyan/10 border-neon-cyan/50 text-neon-cyan"
        >
          {phase === "downloading" ? "Downloading..." : "Download"}
        </button>
      )}
      {failure && (phase === "refused" || phase === "failed") && <ExportFailureLine failure={failure} />}
    </div>
  );
}
