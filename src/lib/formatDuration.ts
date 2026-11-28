/**
 * How long something took, formatted for reading in a list.
 *
 * Lifted out of `useLiveStages` when the answers list became its second consumer —
 * the same move `formatAmount` made when ShortfallGrid became ChartWidget's neighbour.
 * It is for FINISHED measurements only. Both live clocks (the capsule and the answers-panel
 * strip) use `formatClock` since 2026-11-27, and `useLiveStages` no longer re-exports this.
 *
 * KNOWN DIVERGENCE, deliberately not fixed here: `ThinkingCard` carries its own
 * private `formatElapsed` with different rules — 2500ms reads "2s" there and "2.5s"
 * here, and 63s reads "1m 3s" there and "1m 03s" here. Unifying them changes a
 * shipped display, which is not a demo-week edit. Filed rather than fixed.
 */
export function formatDuration(ms: number): string {
  const s = ms / 1000;
  if (s < 10) return `${s.toFixed(1)}s`;
  if (s < 60) return `${Math.floor(s)}s`;
  const m = Math.floor(s / 60);
  const rem = Math.floor(s % 60);
  return `${m}m ${String(rem).padStart(2, "0")}s`;
}

/**
 * The duration to SHOW for an artifact, or null to show nothing.
 *
 * Absence is a first-class answer. An artifact produced before the projection
 * carried a duration has none and never will — capture-or-lose-forever — and the
 * one thing this must never do is let that read as fast. `0s` beside an answer is
 * a claim; nothing beside an answer is the honest absence of one. Same rule as
 * ShortfallGrid's "an absent cell is a gap, not a zero".
 *
 * The refusal lives here rather than at the call site so that every surface that
 * ever shows a duration inherits it, instead of each one re-deciding what a
 * missing measurement looks like.
 */
export function artifactDuration(duration_ms: number | null | undefined): string | null {
  if (typeof duration_ms !== "number") return null;
  if (!Number.isFinite(duration_ms) || duration_ms < 0) return null;
  return formatDuration(duration_ms);
}

/**
 * A running time as m:ss ("0:42", "2:10", "15:00"), for a clock that is still counting.
 *
 * The stalled-answer wording the architect approved on 2026-11-27 reads times as m:ss, so the
 * answers-panel strip and the lines that will compare it with the producer's expected time all
 * speak one form. Whole seconds only: a clock that ticks tenths reads as busier than the answer is.
 * Minutes do not roll into hours; the server stops waiting at 15:00.
 *
 * Not `formatDuration`: that one is a finished measurement in a list ("42s", "2m 10s"). Both live
 * clocks, the capsule above the prompt and the answers-panel strip, read this one, because two
 * clocks in different formats on one screen is a defect (architect, 2026-11-27).
 */
export function formatClock(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}
