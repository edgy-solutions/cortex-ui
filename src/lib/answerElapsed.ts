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
 * The count of artifacts COVERED travels with the figure for that reason: `1 of 2 measured` is
 * honest about what it is, and it cannot be misread as the whole.
 *
 * ── WHAT THE CHAIN COUNTS IS ARTIFACTS, NOT HOPS ─────────────────────────────────────────
 *
 * This walk counts the artifacts in the lineage chain. It once called them "hops", and the footer
 * printed `7m 35s · 4 hops`; perf's census (11-08) showed that read as engine hops and as a wall
 * clock, and it is neither. The footer now shows separately labelled numbers (`answerFooter`):
 * `work` (this sum), `artifacts` (this count), and `wall clock` and `hops`, which only the server
 * can measure and which are drawn only once it serves them.
 */

/** How much work produced this answer, and how much of that work was measured. */
export interface AnswerElapsed {
  /** Summed milliseconds across the measured artifacts. Null when none were measured. */
  ms: number | null;
  /** Artifacts in the lineage chain, this one included. */
  artifacts: number;
  /** How many of them carried a measurement. */
  measured: number;
}

/**
 * A chain cannot be longer than this. Lineage comes off the wire and a cycle there — a row
 * naming itself, or two rows naming each other — would hang the render rather than draw a wrong
 * number. The visited set already breaks cycles; this bounds a long legitimate chain too, since
 * a chain in the hundreds is a bug report, not a total worth summing.
 */
const MAX_CHAIN = 8;

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
  if (!a) return { ms: null, artifacts: 0, measured: 0 };

  const seen = new Set<string>();
  let total = 0;
  let artifacts = 0;
  let measured = 0;

  let cur: Artifact | undefined = a;
  while (cur && artifacts < MAX_CHAIN && !seen.has(cur.id)) {
    seen.add(cur.id);
    artifacts += 1;
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

  return { ms: measured > 0 ? total : null, artifacts, measured };
}

/**
 * What only the server can measure about an answer: the wall clock from the first request to the
 * final render, and the engine hops it took. Perf serves these (field names to follow); until then
 * every caller passes `NOT_SERVED` and neither number is drawn.
 */
export interface ServedAnswerTiming {
  wallClockMs: number | null;
  hops: number | null;
}

export const NOT_SERVED: ServedAnswerTiming = { wallClockMs: null, hops: null };

/** One labelled number in the answer footer. `key` is stable for tests and data attributes. */
export interface FooterNumber {
  key: "work" | "wall-clock" | "hops" | "artifacts";
  label: string;
  value: string;
  title: string;
}

/**
 * The answer footer: each number separately labelled, each drawn only when it exists.
 *
 * - `work`: the summed producer time. When some artifacts carry no measurement, the value says how
 *   many it covers, so a partial sum is never read as the total.
 * - `wall clock`, `hops`: served, never derived here. A served value that is not a usable number is
 *   dropped the way an absent one is.
 * - `artifacts`: the lineage chain's length, always known for a real artifact.
 *
 * No artifact, no footer: a served timing has nothing to annotate.
 */
export function answerFooter(e: AnswerElapsed, served: ServedAnswerTiming = NOT_SERVED): FooterNumber[] {
  if (e.artifacts === 0) return [];
  const out: FooterNumber[] = [];
  const work = artifactDuration(e.ms);
  if (work !== null) {
    const partial = e.measured < e.artifacts;
    out.push({
      key: "work",
      label: "work",
      value: partial ? `${work} (${e.measured} of ${e.artifacts} measured)` : work,
      title: partial
        ? `Summed producer time over the ${e.measured} of ${e.artifacts} artifacts that recorded one; not a wall clock`
        : "Summed producer time across the answer's artifacts; not a wall clock",
    });
  }
  const wall = artifactDuration(served.wallClockMs);
  if (wall !== null) {
    out.push({ key: "wall-clock", label: "wall clock", value: wall, title: "First request to final render, as the server measured it" });
  }
  const hops = served.hops;
  if (typeof hops === "number" && Number.isInteger(hops) && hops >= 0) {
    out.push({ key: "hops", label: "hops", value: String(hops), title: "Engine hops, as the server counted them" });
  }
  if (e.artifacts > 0) {
    out.push({ key: "artifacts", label: "artifacts", value: String(e.artifacts), title: "Artifacts in this answer's lineage chain" });
  }
  return out;
}
