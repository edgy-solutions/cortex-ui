/**
 * MyDrops — "My drops (n)": the user's own drops, each re-fetched by id every time the panel opens.
 *
 * The cards are MOUNTED ONLY WHILE OPEN, so closing and reopening remounts them and each one
 * fetches `GET /ingest/{id}/status` afresh (the card's own mount fetch). That is the whole
 * "closing a panel never loses it" mechanism: the ids persist (`myDrops.ts`), the status never does.
 * The card is the existing `IngestStatusCard`, so promote/reject and the suggestion step are intact.
 */
import { useState } from "react";
import { useAuth } from "react-oidc-context";
import { Inbox, X } from "lucide-react";
import { IngestStatusCard } from "./IngestStatusCard";
import { readMyDrops } from "@/lib/myDrops";
import { useIngestComposerStore } from "@/store/useIngestComposerStore";

export function MyDrops() {
  const auth = useAuth();
  const owner = auth.user?.profile?.sub ?? null;
  const email = auth.user?.profile?.email ?? null;
  const [open, setOpen] = useState(false);
  // A new turn (or a purge, which empties turns) re-renders this, so the count and list follow
  // what was just recorded without a store of their own.
  useIngestComposerStore((s) => s.turns);
  const drops = readMyDrops(owner);

  return (
    <div className="relative flex-shrink-0">
      <button
        type="button"
        data-my-drops-trigger
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="h-9 px-2 rounded-xl border border-white/10 flex items-center gap-1.5 text-[11px] font-mono text-slate-400 hover:text-neon-cyan transition-colors"
      >
        <Inbox className="w-3.5 h-3.5" />
        My drops ({drops.length})
      </button>
      {open && (
        <div
          data-my-drops-panel
          className="absolute bottom-full right-0 mb-2 z-[60] w-[min(30rem,90vw)] max-h-[60vh] overflow-y-auto glass-panel p-3 border-cyan-500/20"
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] font-mono uppercase tracking-widest text-cyan-400/70">My drops</span>
            <button type="button" aria-label="Close my drops" data-my-drops-close onClick={() => setOpen(false)} className="text-slate-400 hover:text-slate-100">
              <X className="w-3 h-3" />
            </button>
          </div>
          {drops.length === 0 && (
            <p className="text-[10px] font-mono text-slate-500" data-my-drops-empty>Nothing dropped yet.</p>
          )}
          {drops.map((d) => (
            <div key={d.ingestId} data-my-drop={d.ingestId} className="mb-2">
              <div className="text-[11px] font-mono text-slate-200 truncate" data-my-drop-file>{d.filename}</div>
              <div className="text-[9px] font-mono text-slate-500">{new Date(d.droppedAt).toLocaleString()}</div>
              <IngestStatusCard ingestId={d.ingestId} onBehalfOf={email} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
