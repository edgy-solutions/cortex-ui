/**
 * "Needs you N" header control — beside Tasks, counted the same way: a JUMP over the timeline to the
 * next drop parked at `awaiting_kind` (the read could not tell PCN from PDN). Amber, like its rail row.
 * It also owns the toast for a row ENTERING that stage, mounted once with the header.
 */
import { useEffect } from "react";
import { CircleHelp } from "lucide-react";
import { toast } from "sonner";
import { useCanvasStore } from "@/store/useCanvasStore";
import { useIngestStatusStore } from "@/store/useIngestStatusStore";
import { ingestComponentFrom } from "@/lib/ingestArtifact";
import { enteredAwaitingKind, needsYouArtifactIds } from "@/lib/needsYou";

function useNeedsYouToast() {
  useEffect(
    () =>
      useIngestStatusStore.subscribe((state, prev) => {
        for (const id of enteredAwaitingKind(prev.rows, state.rows)) {
          const art = useCanvasStore.getState().artifacts.find((a) => ingestComponentFrom(a)?.ingest_id === id);
          toast.warning("Needs you: what kind is this?", {
            id: `needs-you:${id}`,
            description: art?.summary,
            action: {
              label: "Pick",
              onClick: () => {
                if (art) useCanvasStore.getState().setCurrentArtifact(art.id);
              },
            },
          });
        }
      }),
    [],
  );
}

export function NeedsYouBadge() {
  useNeedsYouToast();
  // A NUMBER, not the id array: a fresh array each render would loop.
  const count = useCanvasStore((s) => needsYouArtifactIds(s.artifacts).length);

  const jumpNext = () => {
    const ids = needsYouArtifactIds(useCanvasStore.getState().artifacts);
    if (ids.length === 0) return;
    const cur = useCanvasStore.getState().currentArtifactId;
    const idx = cur ? ids.indexOf(cur) : -1;
    useCanvasStore.getState().setCurrentArtifact(ids[(idx + 1) % ids.length]);
  };

  return (
    <button
      onClick={jumpNext}
      disabled={count === 0}
      title={count > 0 ? "Jump to the next drop that needs its kind picked" : "Nothing needs you"}
      data-needs-you-count={count}
      className="relative flex items-center gap-2 px-3 py-1.5 rounded-lg border border-neon-blue/20 bg-neon-blue/5 hover:bg-neon-blue/10 disabled:opacity-50 disabled:cursor-default transition-colors cursor-pointer"
    >
      <CircleHelp className="w-4 h-4 text-amber-400" />
      <span className="text-xs font-mono text-slate-300 uppercase tracking-widest">Needs you</span>
      {count > 0 && (
        <span className="ml-1 px-1.5 py-0.5 bg-amber-500/30 border border-amber-500/50 rounded text-[9px] leading-none text-amber-300 font-bold">
          {count}
        </span>
      )}
    </button>
  );
}
