/**
 * "Tasks N" header control — a FILTER/JUMP over the timeline, not a container.
 *
 * Pending tasks are first-class timeline citizens (synthetic task-artifacts), so
 * this button no longer opens a right-side panel — it JUMPS the timeline
 * selection to the next pending task, bringing its card into view on the canvas
 * (the HUD follows). Same species as the TIME/TOPIC/TYPE/GRAPH chips: it locates
 * work in the one timeline rather than duplicating it into a second surface.
 * The pink count chip is the SERVED total (`/me/needs_you`), shown only when it is above zero and only
 * once the first snapshot has landed (before that nothing is known: no number, not 0). A failed refresh is
 * shown, never a silently stale count; a served delegation mark is shown, never hidden.
 */
import { ClipboardCheck } from "lucide-react";
import {
  useHumanTaskStore,
  selectPendingTasks,
} from "@/store/useHumanTaskStore";
import { useCanvasStore } from "@/store/useCanvasStore";
import { taskArtifactId } from "@/lib/taskArtifact";

export function HumanTaskInboxBadge() {
  // Subscribe only to stable primitives/objects (reading the pending array reactively would hand React a
  // fresh array each render: re-render loop). The jump below reads the LIST; the number is the served total.
  const pendingCount = useHumanTaskStore((s) => selectPendingTasks(s).length);
  const loaded = useHumanTaskStore((s) => s.queueLoaded);
  const error = useHumanTaskStore((s) => s.queueError);
  const needsYou = useHumanTaskStore((s) => s.needsYou);
  const delegated = useHumanTaskStore((s) => s.delegated);

  const jumpNext = () => {
    const pending = selectPendingTasks(useHumanTaskStore.getState());
    if (pending.length === 0) return;
    const ids = pending.map((t) => taskArtifactId(t.id));
    const cur = useCanvasStore.getState().currentArtifactId;
    const idx = cur ? ids.indexOf(cur) : -1;
    // Cycle to the next pending task (its card comes into view; HUD follows).
    useCanvasStore.getState().setCurrentArtifact(ids[(idx + 1) % ids.length]);
  };

  const total = loaded && needsYou ? needsYou.total : null;
  // Kinds exactly as served, in served order: cortex names none of them.
  const perKind = needsYou ? Object.entries(needsYou.counts).map(([k, n]) => `${k} ${n}`).join(", ") : "";
  const base =
    pendingCount > 0 ? "Jump to next pending task" : total === null ? "Tasks not loaded yet" : "No pending tasks";
  const title = [
    base,
    perKind !== "" ? perKind : null,
    delegated ? `Delegated: read on behalf of ${delegated.delegator}` : null,
    error !== null ? `Task queue unavailable: ${error}` : null,
  ]
    .filter((x): x is string => x !== null)
    .join(" — ");

  return (
    <button
      onClick={jumpNext}
      disabled={pendingCount === 0}
      title={title}
      data-queue-error={error !== null ? "" : undefined}
      data-delegated={delegated ? "" : undefined}
      className="relative flex items-center gap-2 px-3 py-1.5 rounded-lg border border-neon-blue/20 bg-neon-blue/5 hover:bg-neon-blue/10 disabled:opacity-50 disabled:cursor-default transition-colors cursor-pointer"
    >
      <ClipboardCheck className="w-4 h-4 text-neon-blue" />
      <span className="text-xs font-mono text-slate-300 uppercase tracking-widest">
        Tasks
      </span>
      {error !== null ? (
        <span className="ml-1 px-1.5 py-0.5 bg-amber-500/20 border border-amber-500/50 rounded text-[9px] leading-none text-amber-400 font-bold">
          unavailable
        </span>
      ) : (
        total !== null &&
        total > 0 && (
          <span className="ml-1 px-1.5 py-0.5 bg-neon-pink/30 border border-neon-pink/50 rounded text-[9px] leading-none text-neon-pink font-bold">
            {total}
          </span>
        )
      )}
      {delegated && (
        <span className="ml-1 text-[9px] leading-none text-slate-400 font-mono">for {delegated.delegator}</span>
      )}
    </button>
  );
}
