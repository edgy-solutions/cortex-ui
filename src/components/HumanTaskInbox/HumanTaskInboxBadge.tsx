/**
 * "Tasks N" header control — a FILTER/JUMP over the timeline, not a container.
 *
 * Pending tasks are first-class timeline citizens (synthetic task-artifacts), so
 * this button no longer opens a right-side panel — it JUMPS the timeline
 * selection to the next pending task, bringing its card into view on the canvas
 * (the HUD follows). Same species as the TIME/TOPIC/TYPE/GRAPH chips: it locates
 * work in the one timeline rather than duplicating it into a second surface.
 * The pink count chip shows only when there are pending tasks.
 */
import { ClipboardCheck } from "lucide-react";
import {
  useHumanTaskStore,
  selectPendingTasks,
} from "@/store/useHumanTaskStore";
import { useCanvasStore } from "@/store/useCanvasStore";
import { taskArtifactId } from "@/lib/taskArtifact";

export function HumanTaskInboxBadge() {
  // Subscribe only to the COUNT (a stable number) — reading the pending array
  // reactively would hand React a fresh array each render (re-render loop).
  const pendingCount = useHumanTaskStore((s) => selectPendingTasks(s).length);

  const jumpNext = () => {
    const pending = selectPendingTasks(useHumanTaskStore.getState());
    if (pending.length === 0) return;
    const ids = pending.map((t) => taskArtifactId(t.id));
    const cur = useCanvasStore.getState().currentArtifactId;
    const idx = cur ? ids.indexOf(cur) : -1;
    // Cycle to the next pending task (its card comes into view; HUD follows).
    useCanvasStore.getState().setCurrentArtifact(ids[(idx + 1) % ids.length]);
  };

  return (
    <button
      onClick={jumpNext}
      disabled={pendingCount === 0}
      title={pendingCount > 0 ? "Jump to next pending task" : "No pending tasks"}
      className="relative flex items-center gap-2 px-3 py-1.5 rounded-lg border border-neon-blue/20 bg-neon-blue/5 hover:bg-neon-blue/10 disabled:opacity-50 disabled:cursor-default transition-colors cursor-pointer"
    >
      <ClipboardCheck className="w-4 h-4 text-neon-blue" />
      <span className="text-xs font-mono text-slate-300 uppercase tracking-widest">
        Tasks
      </span>
      {pendingCount > 0 && (
        <span className="ml-1 px-1.5 py-0.5 bg-neon-pink/30 border border-neon-pink/50 rounded text-[9px] leading-none text-neon-pink font-bold">
          {pendingCount}
        </span>
      )}
    </button>
  );
}
