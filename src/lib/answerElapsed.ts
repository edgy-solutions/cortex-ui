import type { Artifact } from "@/api/types";
import { isAsk, lineageParentIds } from "./askFold";
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
 *
 * ── 2026-11-19: THE FOOTER SHOWS THIS ANSWER'S TIME, NOT THE CHAIN'S ─────────────────────
 *
 * Perf found that the footer's `work` figure summed every artifact in the lineage chain, so a
 * follow-up showed minutes when the answer itself took ~85 s. Ruling (2026-11-19): "the footer
 * shows the time of this answer. A chain total, if shown at all, is labelled as a total and sits
 * apart from it." And: "For an answer reached through an ask card, 'this answer's time' is the
 * last step alone, with the ask's time shown beside it and labelled."
 *
 * So `work` is gone. The footer leads with `this answer` (the artifact's own duration_ms) and,
 * when the first lineage parent is an ask, `ask` beside it. The chain sum survives only as
 * `chain total`, in its own "total" group, drawn only when the chain holds more than this answer
 * plus its ask.
 *
 * ── 2026-11-20: THE FIRST INTENT CALL IS PART OF THE TIME ────────────────────────────────
 *
 * The producer's artifact clock starts AFTER the BFF's `/route_intent` model call returns, so
 * `duration_ms` leaves that call out (6.5-10.3 s per answer). Architect order (11-19): count the
 * first intent call in the footer time. Cortex adds the SERVED `intent_ms` to the artifact's
 * `duration_ms`; it never times anything itself. Absent (or invalid) `intent_ms` means the figure
 * is unchanged, and an `intent_ms` without a valid `duration_ms` is never an answer's time.
 */

/** How much work produced this answer, and how much of that work was measured. */
export interface AnswerElapsed {
  /** Summed milliseconds across the measured artifacts. Null when none were measured. */
  ms: number | null;
  /** Artifacts in the lineage chain, this one included. */
  artifacts: number;
  /** How many of them carried a measurement. */
  measured: number;
  /** This artifact's OWN valid duration_ms; null when not measured. */
  ownMs: number | null;
  /** Whether the first lineage parent is an ask card. */
  hasAskParent: boolean;
  /** That ask's own valid duration_ms; null when it has none (or there is no ask parent). */
  askMs: number | null;
  /** The valid served intent_ms added into `ownMs`; null when none was added. */
  ownIntentMs: number | null;
  /** The valid served intent_ms added into `askMs`; null when none was added. */
  askIntentMs: number | null;
}

/** A served intent time, accepted by the same refusal as a duration; null otherwise. */
function validIntent(a: Artifact): number | null {
  return artifactDuration(a.intent_ms) !== null ? (a.intent_ms as number) : null;
}

/**
 * An artifact's own time: duration_ms plus its served intent_ms when both are valid, duration_ms
 * alone when the intent is not, and null when duration_ms is not valid (intent alone is never a
 * time).
 */
function ownTime(a: Artifact): number | null {
  if (artifactDuration(a.duration_ms) === null) return null;
  return (a.duration_ms as number) + (validIntent(a) ?? 0);
}

/** The intent part that ownTime added, or null. */
function addedIntent(a: Artifact): number | null {
  return artifactDuration(a.duration_ms) === null ? null : validIntent(a);
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
  if (!a) return { ms: null, artifacts: 0, measured: 0, ownMs: null, hasAskParent: false, askMs: null, ownIntentMs: null, askIntentMs: null };

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
    const t = ownTime(cur);
    if (t !== null) {
      total += t;
      measured += 1;
    }
    const parents = lineageParentIds(cur);
    // FIRST PARENT ONLY. Lineage is already tolerant of a multi-valued field on the wire, and
    // a genuine fan-in would make "the time this took" a sum over a tree, which is a different
    // question with a different answer. Taking one path keeps this a chain; when fan-in lands,
    // this is the function that has to be told what it means, not the row.
    cur = parents.length ? byId(parents[0]) : undefined;
  }

  const first = lineageParentIds(a)[0];
  const parent = first ? byId(first) : undefined;
  const hasAskParent = !!parent && parent.id !== a.id && isAsk(parent);
  return {
    ms: measured > 0 ? total : null,
    artifacts,
    measured,
    ownMs: ownTime(a),
    hasAskParent,
    askMs: hasAskParent ? ownTime(parent!) : null,
    ownIntentMs: addedIntent(a),
    askIntentMs: hasAskParent ? addedIntent(parent!) : null,
  };
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
  key: "this" | "ask" | "wall-clock" | "hops" | "chain-total" | "artifacts";
  label: string;
  value: string;
  title: string;
  /** `answer`: about this answer. `total`: the chain, drawn apart from it. */
  group: "answer" | "total";
}

/**
 * The answer footer: each number separately labelled, each drawn only when it exists.
 *
 * - `this answer`: the artifact's own duration; absent when unmeasured, never a `0s`.
 * - `ask`: the ask card's own duration, only when the first lineage parent is an ask and measured.
 * - `wall clock`, `hops`: served, never derived here.
 * - `chain total` and `artifacts`: the apart group, drawn only when the chain holds more than this
 *   answer plus its ask. A partial sum carries "(N of M measured)".
 *
 * No artifact, no footer: a served timing has nothing to annotate.
 */
export function answerFooter(e: AnswerElapsed, served: ServedAnswerTiming = NOT_SERVED): FooterNumber[] {
  if (e.artifacts === 0) return [];
  const out: FooterNumber[] = [];
  const own = artifactDuration(e.ownMs);
  if (own !== null) {
    out.push({
      key: "this",
      label: "this answer",
      value: own,
      title:
        e.ownIntentMs !== null
          ? `This answer's own producer time (its last step), including its intent step (${artifactDuration(e.ownIntentMs)}); not a wall clock`
          : "This answer's own producer time (its last step); not a wall clock",
      group: "answer",
    });
  }
  const ask = e.hasAskParent ? artifactDuration(e.askMs) : null;
  if (ask !== null) {
    out.push({
      key: "ask",
      label: "ask",
      value: ask,
      title:
        e.askIntentMs !== null
          ? `The ask card's step before your pick, including its intent step (${artifactDuration(e.askIntentMs)}); not included in this answer's time`
          : "The ask card's step before your pick; not included in this answer's time",
      group: "answer",
    });
  }
  const wall = artifactDuration(served.wallClockMs);
  if (wall !== null) {
    out.push({ key: "wall-clock", label: "wall clock", value: wall, title: "First request to final render, as the server measured it", group: "answer" });
  }
  const hops = served.hops;
  if (typeof hops === "number" && Number.isInteger(hops) && hops >= 0) {
    out.push({ key: "hops", label: "hops", value: String(hops), title: "Engine hops, as the server counted them", group: "answer" });
  }
  if (e.artifacts > (e.hasAskParent ? 2 : 1)) {
    const total = artifactDuration(e.ms);
    if (total !== null) {
      const partial = e.measured < e.artifacts;
      out.push({
        key: "chain-total",
        label: "chain total",
        value: partial ? `${total} (${e.measured} of ${e.artifacts} measured)` : total,
        title: partial
          ? `Summed producer time over the ${e.measured} of ${e.artifacts} artifacts in this answer's lineage chain that recorded one; a total, not this answer's time`
          : "Summed producer time across this answer's whole lineage chain; a total, not this answer's time",
        group: "total",
      });
    }
    out.push({ key: "artifacts", label: "artifacts", value: String(e.artifacts), title: "Artifacts in this answer's lineage chain", group: "total" });
  }
  return out;
}
