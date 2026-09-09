import type { Artifact } from "@/api/types";
import { lineageParentIds } from "./askFold";
import { artifactDuration } from "./formatDuration";

/**
 * HOW LONG THE ANSWER TOOK — across every hop that produced it, not just the last one.
 *
 * ── WHAT WAS WRONG ────────────────────────────────────────────────────────────────────────
 *
 * An answer that came from an ask is the product of TWO pieces of work: the turn that decided
 * it needed to ask and built the menu, and the turn that took the pick and dispatched. The row
 * reported `duration_ms` off the final artifact alone, so it showed the second leg and called
 * it the answer's time. The first leg — often the slower one, since it is the leg that did the
 * routing — was simply absent from the total.
 *
 * ── WHAT IS DELIBERATELY NOT COUNTED ──────────────────────────────────────────────────────
 *
 * THE TIME THE PERSON SPENT DECIDING. The obvious implementation is the wall clock from the
 * ask's creation to the answer's, and it would be wrong in the way that matters: it reports a
 * reader who went for coffee as a slow system. Summing each producer's OWN measurement counts
 * work and excludes deliberation, and it does so structurally rather than by trying to detect
 * and subtract an idle gap.
 *
 * So this is not "how long did that take you", it is "how much work did the mesh do". Those are
 * different questions and only the second one is a measurement anybody can act on.
 *
 * ── AND A PARTIAL SUM IS NEVER PRESENTED AS A TOTAL ───────────────────────────────────────
 *
 * Most rows in the substrate predate `duration_ms` and carry none, so a chain where only one
 * leg was measured is the common case, not an edge. Adding up what exists and printing it bare
 * would state a total that is quietly missing a leg — a wrong measurement, which this codebase
 * treats as worse than an absent one everywhere else it renders a number.
 *
 * The count of hops COVERED travels with the figure for that reason: `1 of 2 hops` is honest
 * about what it is, and it cannot be misread as the whole.
 */

/** How much work produced this answer, and how much of that work was measured. */
export interface AnswerElapsed {
  /** Summed milliseconds across the measured hops. Null when none were measured. */
  ms: number | null;
  /** Hops in the lineage chain, this artifact included. */
  hops: number;
  /** How many of them carried a measurement. */
  measured: number;
}

/**
 * A chain cannot be longer than this. Lineage comes off the wire and a cycle there — a row
 * naming itself, or two rows naming each other — would hang the render rather than draw a wrong
 * number. The visited set already breaks cycles; this bounds a long legitimate chain too, since
 * a hop count in the hundreds is a bug report, not a total worth summing.
 */
const MAX_HOPS = 8;

/**
 * Walk the lineage from this artifact back through the answers it was derived from.
 *
 * The whole chain counts, not only an ASK parent. A re-ask that produced a second ask is two
 * legs of real work by the same argument as the first, and keying on the parent's ARCHETYPE
 * would be a second definition of "a hop" that has to be kept in step with the first.
 */
export function answerElapsed(
  a: Artifact | null | undefined,
  byId: (id: string) => Artifact | undefined,
): AnswerElapsed {
  if (!a) return { ms: null, hops: 0, measured: 0 };

  const seen = new Set<string>();
  let total = 0;
  let hops = 0;
  let measured = 0;

  let cur: Artifact | undefined = a;
  while (cur && hops < MAX_HOPS && !seen.has(cur.id)) {
    seen.add(cur.id);
    hops += 1;
    // Read through the same refusal the card uses, so a negative or non-finite value is not
    // silently added into a sum that then looks plausible. `artifactDuration` returning a
    // string means the value passed; the raw number is what gets added.
    if (artifactDuration(cur.duration_ms) !== null) {
      total += cur.duration_ms as number;
      measured += 1;
    }
    const parents = lineageParentIds(cur);
    // FIRST PARENT ONLY. Lineage is already tolerant of a multi-valued field on the wire, and
    // a genuine fan-in would make "the time this took" a sum over a tree, which is a different
    // question with a different answer. Taking one path keeps this a chain; when fan-in lands,
    // this is the function that has to be told what it means, not the row.
    cur = parents.length ? byId(parents[0]) : undefined;
  }

  return { ms: measured > 0 ? total : null, hops, measured };
}

/**
 * The row's label: the figure, plus what it covers when that is not obvious.
 *
 * A single measured hop is the ordinary case and says nothing extra — a `1 hop` on every row
 * would be noise, and noise is what gets a useful marker ignored. Anything else states its
 * coverage, because those are the cases where the number alone would mislead.
 */
export function answerElapsedLabel(e: AnswerElapsed): string | null {
  const text = artifactDuration(e.ms);
  if (text === null) return null;
  if (e.hops <= 1) return text;
  if (e.measured === e.hops) return `${text} · ${e.hops} hops`;
  return `${text} · ${e.measured} of ${e.hops} hops`;
}
