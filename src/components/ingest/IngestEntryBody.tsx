/**
 * The opened body of a drop's rail entry (`INGEST` archetype, `src/lib/ingestArtifact.ts`).
 *
 * A header (filename, kind, the optional note) over the status card — what `IngestTurns` drew at the
 * head of the rail before a drop became a turn. With an ingest id the card reads the row from the
 * rail's one poller. Without one the upload has not produced a status yet, or never
 * will: still uploading, refused (the server's `detail`, verbatim), or a duplicate whose original
 * was not named — the message alone is the result.
 *
 * A duplicate is a RESULT, never the error styling (reserved for a refused upload); one that named
 * its original opens the original's status, so "original is at {stage}" reads as the card draws it.
 */
import { FileText } from "lucide-react";
import { IngestStatusCard } from "./IngestStatusCard";
import { duplicatePhrase } from "@/lib/ingestWire";
import type { IngestComponent } from "@/lib/ingestArtifact";

export function IngestEntryBody({ ingest }: { ingest: IngestComponent }) {
  return (
    <div className="glass-panel p-3 border-cyan-500/20" data-ingest-entry={ingest.ingest_id ?? ""}>
      <div className="flex items-center gap-2 text-[11px] font-mono text-slate-200" data-ingest-turn-header>
        <FileText className="w-3.5 h-3.5 text-neon-cyan/70 flex-shrink-0" />
        <span className="truncate" data-ingest-turn-file>{ingest.filename}</span>
        {ingest.kind && (
          <span className="px-1 rounded border border-white/10 text-slate-400 uppercase text-[9px]" data-ingest-turn-kind>
            {ingest.kind}
          </span>
        )}
      </div>
      {ingest.note && (
        <p className="mt-1 text-xs text-slate-300" data-ingest-turn-text>
          {ingest.note}
        </p>
      )}
      {ingest.badge === "uploading" && (
        <p className="mt-2 text-[10px] font-mono text-slate-500" data-ingest-turn-uploading>
          Uploading…
        </p>
      )}
      {ingest.error && (
        <p className="mt-2 text-[10px] font-mono text-rose-400" data-ingest-upload-error>
          {ingest.error}
        </p>
      )}
      {ingest.badge === "refused" && ingest.reason !== null && (
        <p className="mt-2 text-[10px] font-mono text-amber-400" data-ingest-refusal>
          {ingest.reason}
        </p>
      )}
      {ingest.duplicate_message !== null && (
        <p className="mt-2 text-[11px] font-mono text-slate-300" data-ingest-turn-result="duplicate">
          {duplicatePhrase(ingest.duplicate_message)}
        </p>
      )}
      {ingest.ingest_id && (
        <IngestStatusCard
          ingestId={ingest.ingest_id}
          duplicatePhraseDrawn={ingest.duplicate_message !== null}
        />
      )}
    </div>
  );
}
