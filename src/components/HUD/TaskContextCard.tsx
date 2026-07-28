import { motion } from "framer-motion";
import { ClipboardCheck } from "lucide-react";
import { useCurrentArtifact } from "@/store/useCanvasStore";
import { taskKindTitle } from "@/lib/taskKindRegistry";
import { formatRequestedBy } from "@/lib/requestedBy";

/**
 * HUD context for a selected TASK — the same contract the HUD gives an answer
 * (context for the foregrounded card), just the task's facts: what queue it's
 * on, who requested it, the notice + part count once the review batch is loaded,
 * and its pending/resolved state. Renders nothing for non-task artifacts, so the
 * HUD swaps content on selection without an overlay war.
 */
export function TaskContextCard() {
  const current = useCurrentArtifact();
  const task = current?.task_ref;
  if (!task) return null;

  // Notice + part count come from the loaded review batch (if this is a grouped
  // review and its batch has been fetched); absent otherwise.
  const comp = current?.rendered_output?.components?.[0] as
    | { archetype?: string; batch?: { notice_type?: string; notice_id?: string; items?: unknown[] } }
    | undefined;
  const batch = comp?.archetype === "GROUPED_REVIEW" ? comp.batch : undefined;

  const rows: Array<[string, string | null]> = [
    ["audience", task.audience || null],
    ["requested by", task.requestedBy ? formatRequestedBy(task.requestedBy) : null],
    ["subject", task.subjectRef],
    ["notice", batch?.notice_id ? `${batch.notice_type ?? ""} ${batch.notice_id}`.trim() : null],
    ["parts", batch?.items ? String(batch.items.length) : null],
  ];

  const pending = task.task_state === "pending";

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      className="glass-panel p-3 border-pink-500/20"
    >
      <div className="flex items-center gap-2 mb-3">
        <ClipboardCheck className="w-3.5 h-3.5 text-neon-pink" />
        <span className="text-[10px] font-mono uppercase tracking-[0.2em] text-neon-pink/80 flex-1">
          Task Context
        </span>
        <span
          className={`px-1.5 py-0.5 rounded text-[8px] font-mono font-bold uppercase tracking-wider border ${
            pending
              ? "text-pink-300 border-pink-500/40 bg-pink-500/10"
              : "text-slate-400 border-white/10 bg-white/5"
          }`}
        >
          {pending ? "pending" : task.task_state}
        </span>
      </div>

      <p className="text-[11px] font-mono text-slate-200 mb-3">{taskKindTitle(task.kind)}</p>

      <div className="space-y-1.5">
        {rows
          .filter(([, v]) => v)
          .map(([k, v]) => (
            <div key={k} className="flex flex-col gap-0.5">
              <span className="text-[8px] font-mono uppercase tracking-widest text-slate-500">
                {k}
              </span>
              <span className="text-[10px] font-mono text-slate-300 break-all">{v}</span>
            </div>
          ))}
      </div>
    </motion.div>
  );
}
