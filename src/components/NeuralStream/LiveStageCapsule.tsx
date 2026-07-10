import { useLiveStages, formatElapsed } from "./useLiveStages";

/**
 * LiveStageCapsule — the COMPACT current-state indicator pinned just
 * above the prompt (replaces the verbose ThinkingCard). A dot-train +
 * current stage label + live elapsed seconds, over a thin progress bar.
 * Only present while a turn is in flight.
 */
export function LiveStageCapsule() {
  const { active, stages, currentIndex, currentLabel, elapsedMs, progress, total } =
    useLiveStages();

  if (!active) return null;

  return (
    <div className="relative px-6 py-2 border-t border-glass-border flex items-center gap-3 flex-shrink-0">
      {/* Dot-train */}
      <div className="flex items-center gap-1.5">
        {stages.map((s, i) => {
          const done = s.status === "done";
          const isCurrent = i === currentIndex;
          const failed = s.status === "error";
          const incomplete = s.status === "incomplete";
          return (
            <span
              key={s.kind}
              className={`rounded-full transition-all ${
                isCurrent
                  ? "w-2 h-2 bg-neon-blue animate-pulse-neon"
                  : done
                  ? "w-1.5 h-1.5 bg-neon-green/80"
                  : failed
                  ? "w-1.5 h-1.5 bg-rose-500/80"
                  : incomplete
                  ? "w-1.5 h-1.5 bg-amber-400/70"
                  : "w-1.5 h-1.5 border border-slate-600/60"
              }`}
              title={s.label}
            />
          );
        })}
      </div>

      {/* Current stage label */}
      <span className="text-[10px] font-mono text-slate-300 truncate">
        {currentLabel}
      </span>

      {/* Elapsed seconds + stage position */}
      <span className="ml-auto flex items-center gap-2 flex-shrink-0">
        <span className="text-[10px] font-mono text-neon-cyan/70 tabular-nums">
          {formatElapsed(elapsedMs)}
        </span>
        <span className="text-[9px] font-mono text-slate-500 tabular-nums">
          {currentIndex + 1}/{total}
        </span>
      </span>

      {/* Thin progress bar along the bottom edge. */}
      <span className="absolute bottom-0 left-0 h-[2px] bg-neon-blue/70 transition-all duration-300"
        style={{ width: `${Math.round(progress * 100)}%` }}
      />
    </div>
  );
}
