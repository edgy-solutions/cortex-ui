/**
 * IngestTurns — the ingest turns the composer has sent, rendered at the head of the left list.
 * Each is a header (filename, kind, the optional note) with the self-polling `IngestStatusCard`
 * under it (received → … → review → promoted). Newest first, matching the list's own order.
 *
 * Level-1 dedupe: a duplicate upload is a RESULT ("Already processed", neutral) — never the
 * error styling, which is reserved for a refused upload (400/403/413 `detail`, verbatim).
 */
import { useAuth } from "react-oidc-context";
import { FileText } from "lucide-react";
import { IngestStatusCard } from "./IngestStatusCard";
import { duplicatePhrase } from "@/lib/ingestWire";
import { useIngestComposerStore, type IngestTurn } from "@/store/useIngestComposerStore";

export function IngestTurns() {
  const turns = useIngestComposerStore((s) => s.turns);
  const auth = useAuth();
  const email = auth.user?.profile.email ?? null;
  if (turns.length === 0) return null;
  return (
    <div className="px-1 space-y-3 mb-3" data-ingest-turns>
      {turns.map((t) => (
        <TurnCard key={t.id} turn={t} email={email} />
      ))}
    </div>
  );
}

function TurnCard({ turn, email }: { turn: IngestTurn; email: string | null }) {
  return (
    <div className="glass-panel p-3 border-cyan-500/20" data-ingest-turn={turn.id}>
      <div className="flex items-center gap-2 text-[11px] font-mono text-slate-200" data-ingest-turn-header>
        <FileText className="w-3.5 h-3.5 text-neon-cyan/70 flex-shrink-0" />
        <span className="truncate" data-ingest-turn-file>{turn.fileName}</span>
        <span className="px-1 rounded border border-white/10 text-slate-400 uppercase text-[9px]" data-ingest-turn-kind>
          {turn.kind}
        </span>
      </div>
      {turn.text && (
        <p className="mt-1 text-xs text-slate-300" data-ingest-turn-text>
          {turn.text}
        </p>
      )}
      {turn.phase === "uploading" && (
        <p className="mt-2 text-[10px] font-mono text-slate-500" data-ingest-turn-uploading>
          Uploading…
        </p>
      )}
      {turn.phase === "error" && (
        <p className="mt-2 text-[10px] font-mono text-rose-400" data-ingest-upload-error>
          {turn.error}
        </p>
      )}
      {turn.duplicate && (
        <p className="mt-2 text-[11px] font-mono text-slate-300" data-ingest-turn-result="duplicate">
          {duplicatePhrase(turn.duplicate.message)}
        </p>
      )}
      {turn.phase === "status" && turn.ingestId && (
        <IngestStatusCard ingestId={turn.ingestId} onBehalfOf={email} duplicatePhraseDrawn={turn.duplicate !== null} />
      )}
    </div>
  );
}
