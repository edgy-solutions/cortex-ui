/**
 * HITL Slice 2 — header badge that opens the HumanTask inbox.
 *
 * Sits in the Layout header. The pending count comes from the Electric-fed
 * store (the browser only receives THIS user's tasks — replication-layer
 * per-user isolation), so a non-approver simply never has a count. Always
 * rendered as the inbox entry point; the pink count chip shows only when there
 * are pending tasks.
 */
import { ClipboardCheck } from "lucide-react";
import {
  useHumanTaskStore,
  selectPendingTasks,
} from "@/store/useHumanTaskStore";

export function HumanTaskInboxBadge() {
  const pendingCount = useHumanTaskStore((s) => selectPendingTasks(s).length);
  const setInboxOpen = useHumanTaskStore((s) => s.setInboxOpen);

  return (
    <button
      onClick={() => setInboxOpen(true)}
      title="Human task inbox"
      className="relative flex items-center gap-2 px-3 py-1.5 rounded-lg border border-neon-blue/20 bg-neon-blue/5 hover:bg-neon-blue/10 transition-colors cursor-pointer"
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
