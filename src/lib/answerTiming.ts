/**
 * WHAT THE LIVE STRIP SAYS ABOUT HOW LONG AN ANSWER IS TAKING.
 *
 * The wording and thresholds are the architect's (2026-11-27). With E = the served `expected_ms`
 * (the p90 of recorded answer times) and D = the served `deadline_ms`:
 *
 *   elapsed under E     → "normal": the stage and the elapsed time, no judgement
 *   E up to 2E          → "long":   "— longer than usual (usually under 1:50)"
 *   2E and over         → "stalled": "Still working after 5:03. Answers usually finish in under
 *                         1:50, so this one may be stuck." plus "The server stops waiting at 15:00."
 *                         only when D is served
 *
 * E and D are MEASUREMENTS, so they come from the producer verbatim ("a measurement belongs to the
 * producer"). With no E served, the strip shows elapsed time only and never says "longer than
 * usual". Nothing here guesses a figure.
 *
 * "Usually under" rounds E UP to the next 10 s. E is an upper figure, so rounding it down would
 * promise an answer sooner than the producer measured: a p90 of 1:43 reads "under 1:50".
 *
 * Pure, so every threshold is tested without a stream. `useLiveStages` feeds it from lane 74's
 * `answer_timing` event (#595), and `LiveAnswerStrip` draws what it returns.
 */
import { formatClock } from "@/lib/formatDuration";

export interface ServedTiming {
  /** The producer's expected answer time, ms (p90). Null or absent: not served. */
  expectedMs?: number | null;
  /** When the server stops waiting, ms from the answer's birth. Null or absent: not served. */
  deadlineMs?: number | null;
}

export type TimingLine =
  | { state: "normal" }
  | { state: "long"; suffix: string }
  | { state: "stalled"; sentence: string; deadline: string | null };

const served = (n: number | null | undefined): n is number =>
  typeof n === "number" && Number.isFinite(n) && n > 0;

/** E as the strip says it: rounded UP to the next 10 s, in m:ss. */
export function usuallyUnder(expectedMs: number): string {
  return formatClock(Math.ceil(expectedMs / 10_000) * 10_000);
}

export function timingLine(elapsedMs: number, timing?: ServedTiming | null): TimingLine {
  const e = timing?.expectedMs;
  if (!served(e) || elapsedMs < e) return { state: "normal" };
  const under = usuallyUnder(e);
  if (elapsedMs < 2 * e) {
    return { state: "long", suffix: `— longer than usual (usually under ${under})` };
  }
  const d = timing?.deadlineMs;
  return {
    state: "stalled",
    sentence: `Still working after ${formatClock(elapsedMs)}. Answers usually finish in under ${under}, so this one may be stuck.`,
    deadline: served(d) ? `The server stops waiting at ${formatClock(d)}.` : null,
  };
}
