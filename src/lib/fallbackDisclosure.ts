import type { AnswerArchetype } from "./answerDisplay";
import { WORKFLOW_CASE_ROW } from "@/archetypes/workflow-case/row";
import { presentFallbackReason, type FallbackReason, type RouteSeverity } from "./routing";

/**
 * WHAT A GENERALIST ANSWER MAY LOOK LIKE, AND WHAT IT MAY NOT.
 *
 * `routing.fallback === true` means the supervisor reached no specialist and the Engine A
 * generalist answered instead. That is a different KIND of answer: no grounded subject, no
 * registered capability behind it, nothing that could be checked against a provider. The record
 * has always said so — `isUnresolved` reads the flag, the answers panel collapses those rows,
 * the card's chrome turns amber — and the BODY was never asked about it.
 *
 * ⛔ SO A FALLBACK WITH A COMPOSED PAYLOAD RENDERED THE FULL CONFIDENT CARD: a metric with a
 * number in it, a chart, a document, drawn exactly like one a specialist produced, with the only
 * difference a colour on the header and a word in a list. The honest explanation existed and was
 * in the WRONG PLACE — `presentFallbackReason` has had a title, a detail and a severity for every
 * reason in the enum since Part 0, and its only consumer was a HUD panel a reader has to go and
 * open. A disclosure nobody opens is not a disclosure.
 *
 * ── THE PART THAT IS NOT "SUPPRESS THE BODY" ──────────────────────────────────────────────
 *
 * Measured on a real captured payload, not reasoned about:
 * `sessions/2026-09-19-payload-finance-performance-indices.json` has `routing.fallback: true`,
 * `fallback_reason: no_verb_classified` — AND a composed **ELICITATION** component. A rule that
 * hid the body of every fallback would hide THE ASK CARD, which is the menu the reader is
 * supposed to answer, on the very arc that was repaired this morning.
 *
 * An elicitation is not a confident answer. It is a REQUEST, and a request is honest by
 * construction: it claims nothing and it asks for something. So the partition is not
 * fallback-vs-not, it is **what the component CLAIMS**:
 *
 *   claims an answer → withheld from the body under fallback, and COUNTED where it was
 *   asks for input   → always rendered, because withholding it would strand the reader
 *
 * ── THE DEFAULT IS THE STRICT ONE, AND THE COMPILER FORCES THE DECISION ───────────────────
 *
 * `CLAIMS_AN_ANSWER` is keyed BY THE UNION, the same mechanism that keeps the lens picker from
 * drifting: a new `AnswerArchetype` fails the build until somebody classifies it. That matters in
 * both directions, because either mistake is silent — a new claiming archetype would render as a
 * confident answer under a fallback, and a new asking one would be withheld from a reader waiting
 * to answer it. Neither shows up as an error anywhere; both show up as a wrong screen.
 *
 * `UNKNOWN` is a claim. An unregistered payload has said nothing about being a request, and the
 * fail-safe direction under a fallback is to withhold rather than to present.
 */
const CLAIMS_AN_ANSWER: Record<AnswerArchetype, boolean> = {
  // ── ANSWERS. Every one of these asserts something about the world. ──
  SOURCE_LEDGER: true,
  KNOWLEDGE_DOCUMENT: true,
  CHART_WIDGET: true,
  ASSET_STATE_METRIC: true,
  PROCESS_TOPOLOGY: true,
  HAZARD_DECLARATION: true,
  DIGITAL_TWIN_3D: true,
  INTERVAL_TIMELINE: true,
  PERIOD_SERIES: true,
  THRESHOLD_GRID: true,
  MATRIX_GRID: true,
  SHORTFALL_GRID: true,
  STEP_LADDER: true,
  MULTI_SERIES: true,
  VARIANCE_TREE: true,
  CONTRIBUTION_RANKING: true,
  COMPETING_MEASURES: true,
  FORECAST_MEASURE: true,
  DELTA_SET: true,
  DECISION_RECORD: true,
  INSTANCES_BY_PROPERTY: true,
  WORKFLOW_OBSERVATION: true,
  GROUPED_REVIEW: true,
  /**
   * A DECLARED ABSENCE, AND IT IS STILL A CLAIM. `NAMED_HOLE` says "this exists and is empty",
   * which is a statement about the world a generalist is in no position to make — it is the
   * honest-absence archetype, not a request, and under a fallback nobody asked it for.
   */
  NAMED_HOLE: true,
  UNKNOWN: true,

  // ── REQUESTS. These ask the reader for something and claim nothing. ──
  /** The menu. Withholding this strands the reader mid-elicitation — see the header. */
  ELICITATION: false,
  APPROVAL_TASK: false,
  TRIAGE_TASK: false,
  /**
   * RULED 2026-10-02 (Chris): a case is a PENDING HUMAN DECISION, not an answer. Hiding one because
   * the routing fell back is the wrong side of cautious — the decision is still owed whatever the
   * router did. It renders whenever its case object is present (see `carriesItsRequest`), with the
   * disclosure beside it. This reverses the package's first classification, which grouped it with
   * GROUPED_REVIEW as a status record.
   */
  WORKFLOW_CASE: false,
};

/** Whether a component's archetype asserts something, rather than asking for something. */
export function claimsAnAnswer(archetype: string): boolean {
  const known = CLAIMS_AN_ANSWER[archetype as AnswerArchetype];
  // An archetype this table has never heard of is a claim, for the same reason UNKNOWN is: it
  // has not said it is a request, and under a fallback the strict treatment is the safe one.
  return known === undefined ? true : known;
}

/**
 * A request is shown only when it CARRIES the thing it asks about. A WORKFLOW_CASE with no case
 * object has nothing to decide and its card has nothing to draw, so it is counted as withheld like
 * any other component the body does not draw — never dropped silently. The key is read from the
 * package's declared row, not spelled here, so a renamed payload key cannot leave this behind.
 */
const REQUEST_PAYLOAD_KEY: Partial<Record<string, string>> = {
  [WORKFLOW_CASE_ROW.archetype]: WORKFLOW_CASE_ROW.payload_key,
};

export function carriesItsRequest(component: unknown, archetype: string): boolean {
  const key = REQUEST_PAYLOAD_KEY[archetype];
  if (key === undefined) return true;
  const value = (component as Record<string, unknown>)[key];
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export interface FallbackDisclosure {
  /** Loud headline — `presentFallbackReason`'s, so the card and the HUD cannot disagree. */
  title: string;
  /** The honest one-liner, actionable where the reader can act. */
  detail: string;
  severity: RouteSeverity;
  /** The producer's token, verbatim; EMPTY when it recorded none. Never invented. */
  reason: string;
}

/**
 * The disclosure for an artifact's `routing`, or null when routing reached a specialist.
 *
 * ⛔ `fallback` IS TESTED POSITIVELY FOR `true`, the same rule `composed` follows in the template
 * catalog: a missing flag, or a non-boolean, is NOT a fallback. Treating absence as a fallback
 * would put a disclosure on every answer that predates the field, which teaches a reader to
 * ignore it — and an ignored disclosure is worse than none, because it also covers the real ones.
 */
export function readFallbackDisclosure(routing: unknown): FallbackDisclosure | null {
  if (typeof routing !== "object" || routing === null) return null;
  const r = routing as Record<string, unknown>;
  if (r.fallback !== true) return null;
  const reason = typeof r.fallback_reason === "string" ? r.fallback_reason.trim() : "";
  if (!reason) {
    /**
     * A FALLBACK WITH NO REASON IS NOT A BENIGN ONE. The producer fell back and recorded no
     * account of why, so the disclosure says exactly that and invents nothing. `severity: warn`
     * rather than `info`, because an unexplained fallback is the case a reader can act on least.
     */
    return {
      title: "Answered without a specialist",
      detail:
        "Routing did not reach a registered capability, and recorded no reason for it. What " +
        "follows came from the generalist: no grounded subject, and nothing checked against a " +
        "provider.",
      severity: "warn",
      reason: "",
    };
  }
  /*
    CAST, AND THE DEFAULT ARM IS WHY IT IS SAFE. `presentFallbackReason`'s `never` default exists
    precisely so a token this build has not heard of renders AS ITSELF rather than as an unknown
    — the same verbatim rule `readFailureCause` states. Validating against a second, runtime copy
    of the vocabulary here would be a second declaration of one list, which is the shape that has
    gone stale three times in this repo already.
  */
  const p = presentFallbackReason(reason as FallbackReason);
  return { ...p, reason };
}

/**
 * Split a composed payload into what may be shown as the body and what must be withheld.
 *
 * Returns ALL components untouched when routing reached a specialist — the partition only
 * applies under a fallback, and a non-fallback answer must render exactly as it did before.
 *
 * ⛔ THE WITHHELD ONES ARE COUNTED, NEVER SILENTLY DROPPED. That is this codebase's standing rule
 * for a list it shortens: the template picker names what it cannot offer, the source ledger keeps
 * a row per source whatever happened to it, and the producer's own words for it are *"silently
 * omitting it would make the list SHORTER and nothing would say why."* A body that quietly loses
 * components is indistinguishable from a payload that never had them.
 */
export function splitFallbackComponents(
  routing: unknown,
  components: unknown[],
): { shown: unknown[]; withheld: number } {
  if (!readFallbackDisclosure(routing)) return { shown: components, withheld: 0 };
  const shown: unknown[] = [];
  let withheld = 0;
  for (const c of components) {
    const archetype =
      typeof c === "object" && c !== null
        ? String((c as { archetype?: unknown }).archetype ?? "")
        : "";
    if (claimsAnAnswer(archetype) || !carriesItsRequest(c, archetype)) withheld += 1;
    else shown.push(c);
  }
  return { shown, withheld };
}
