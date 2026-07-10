import { Loader2 } from "lucide-react";
import { useLiveStages } from "./useLiveStages";

/**
 * LiveAnswerStrip — the in-list placeholder for the answer in flight,
 * pinned at the TOP of the answer list (the mock's live strip). Shows a
 * status bar (progress), STAGE n/5, and the originating question, so the
 * user sees WHERE the answer will land. The finished answer replaces it
 * as a normal row at the top when composing completes.
 *
 * Renders nothing when idle. Pending artifacts are suppressed from the
 * list rows while this is showing — this strip IS their placeholder.
 */
export function LiveAnswerStrip() {
  const { active, currentIndex, currentLabel, question, progress, total } =
    useLiveStages();

  if (!active) return null;

  return (
    <div className="rounded-lg border border-neon-blue/30 bg-neon-blue/5 p-2.5 overflow-hidden">
      <div className="flex items-center gap-2 mb-1.5">
        <Loader2 className="w-3 h-3 text-neon-blue animate-spin flex-shrink-0" />
        <span className="text-[10px] font-mono text-slate-200 truncate">
          {currentLabel}
        </span>
        <span className="ml-auto text-[9px] font-mono uppercase tracking-wider text-neon-blue/70 tabular-nums flex-shrink-0">
          Stage {currentIndex + 1}/{total}
        </span>
      </div>

      {/* Status bar */}
      <div className="h-1 rounded-full bg-slate-800/70 overflow-hidden mb-1.5">
        <div
          className="h-full bg-neon-blue/70 transition-all duration-300"
          style={{ width: `${Math.round(progress * 100)}%` }}
        />
      </div>

      {question && (
        <p className="text-[10px] font-mono text-slate-500 truncate">
          <span className="text-slate-600">Q · </span>
          {question}
        </p>
      )}
    </div>
  );
}
