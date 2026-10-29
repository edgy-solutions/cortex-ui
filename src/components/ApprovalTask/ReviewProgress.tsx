/**
 * How much of the notice a steward has covered, in three honest parts: parts LOOKED at, CHECKS still left
 * (a flag or a sample nobody has looked at), and parts only COVERED by a run (not looked at, and said so).
 * The three always sum to the parts, so the bar can never read fuller than the work done.
 */
export function ReviewProgress({ looked, left, covered, edited }: { looked: number; left: number; covered: number; edited: number }) {
  const total = looked + left + covered;
  const pct = (n: number) => (total > 0 ? `${(n / total) * 100}%` : "0%");
  return (
    <div
      className="mb-2"
      data-review-progress
      data-progress-looked={looked}
      data-progress-left={left}
      data-progress-covered={covered}
      data-progress-edited={edited}
    >
      <div className="flex h-1.5 w-full overflow-hidden rounded-full bg-white/5" aria-hidden>
        <div className="bg-cyan-400" style={{ width: pct(looked) }} data-bar="looked" />
        <div className="bg-amber-400" style={{ width: pct(left) }} data-bar="left" />
        <div className="bg-[#2F5F5B]" style={{ width: pct(covered) }} data-bar="covered" />
      </div>
      <p className="mt-1 text-[11px] font-mono text-slate-400" data-progress-text>
        looked at {looked} · checks left <span className={left > 0 ? "text-amber-400" : undefined}>{left}</span> · covered by runs {covered} · ✎ {edited} edited
      </p>
    </div>
  );
}
