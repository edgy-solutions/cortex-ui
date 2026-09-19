/**
 * DISCRIMINATING FIXTURES — ADR-0055 §2, for `SOURCE_LEDGER`, and the first set with TWO
 * PRODUCING CONTEXTS.
 *
 * ⛔ THE FLIP PROPERTY IS PER-PRODUCER HERE, AND THAT IS NOT A WEAKENING. Which dispositions a
 * graph can emit is a function of its `refusal` clause, derived by the producer's
 * `reachable_for`:
 *
 *   refusal: named-hole   all five. A refused inner call becomes a hole IN the answer.
 *   refusal: fail         the three non-hole terms ONLY. A refused inner call RAISES, so no row
 *                         is ever RETURNED for it — the hole terms are unreachable BY CONTRACT.
 *
 * The three cards extracted before this one each had ONE producer, so "every declared absence
 * flips in both directions" read as a fact about the archetype. It is a fact about a CONTEXT.
 * Asserting a hole flips on a `fail` producer would assert an outcome its contract forbids, and
 * a card built to expect one would be wrong on every cost review.
 */

/** What the card declares. Not the producer's vocabulary — these are render-side facts. */
export const LEDGER_ABSENCES = [
  "data-ledger-unsummarised",
  "data-ledger-empty",
  "data-ledger-hole",
  "data-ledger-unknown",
  "data-ledger-no-artifact",
] as const;

export type LedgerAbsence = (typeof LEDGER_ABSENCES)[number];

/** The producer's refusal clause, which decides what it can emit. */
export type RefusalClause = "named-hole" | "fail";

export interface LedgerFixture {
  name: string;
  /**
   * Which producing contexts could emit this payload — a SET, not a choice.
   *
   * A payload carrying no hole rows is reachable from BOTH clauses: a `named-hole` graph can
   * answer everything, and a `fail` graph can only answer everything. Labelling such a payload
   * with one producer was arbitrary, and the seal caught it — the coverage property then
   * demanded a `named-hole` fixture for `unsummarised` that already existed under another
   * label. The fixture model was wrong, not the property.
   */
  producers: RefusalClause[];
  component: Record<string, unknown>;
  declares: LedgerAbsence[];
}

const FINDING = {
  row: "fin_burn_rate",
  label: "burn rate",
  disposition: "finding",
  artifact: "hop-3",
  verdict: "tracking 4% under plan",
  reason: null,
};

export const LEDGER_FIXTURES: LedgerFixture[] = [
  {
    name: "every source answered with a verdict — the card is quiet",
    producers: ["named-hole", "fail"],
    component: {
      archetype: "SOURCE_LEDGER",
      summary: "Three measures, all reporting.",
      rows: [FINDING, { ...FINDING, row: "fin_variance", label: "variance", artifact: "hop-4" }],
    },
    declares: [],
  },
  {
    name: "content exists, verdict absent — a FINDING row, never a hole",
    producers: ["named-hole", "fail"],
    component: {
      archetype: "SOURCE_LEDGER",
      rows: [
        FINDING,
        {
          row: "fin_variance_analysis",
          label: "cost and schedule variance",
          disposition: "unsummarised",
          artifact: "hop-7",
          verdict: null,
          reason: null,
        },
      ],
    },
    declares: ["data-ledger-unsummarised"],
  },
  {
    name: "answered with nothing — and the evidence link is how a reader checks it",
    producers: ["named-hole", "fail"],
    component: {
      archetype: "SOURCE_LEDGER",
      rows: [
        FINDING,
        { row: "fin_risk", label: "risk", disposition: "empty", artifact: "hop-9", verdict: null, reason: null },
      ],
    },
    declares: ["data-ledger-empty"],
  },
  {
    /*
     * ONLY A `named-hole` PRODUCER CAN REACH THIS. A `fail` graph raises on a refused inner
     * call and never returns a row for it.
     */
    name: "the caller may not invoke a source — a hole, with no evidence",
    producers: ["named-hole"],
    component: {
      archetype: "SOURCE_LEDGER",
      rows: [
        FINDING,
        {
          row: "fin_program_cost",
          label: "program cost",
          disposition: "unentitled",
          artifact: null,
          verdict: null,
          reason: "no grant for PROGRAM_FINANCE",
        },
      ],
    },
    declares: ["data-ledger-hole", "data-ledger-no-artifact"],
  },
  {
    name: "a source could not be reached — a hole for the other reason",
    producers: ["named-hole"],
    component: {
      archetype: "SOURCE_LEDGER",
      rows: [
        FINDING,
        {
          row: "fin_schedule",
          label: "schedule",
          disposition: "unavailable",
          artifact: null,
          verdict: null,
          reason: "engine-fin timed out",
        },
      ],
    },
    declares: ["data-ledger-hole", "data-ledger-no-artifact"],
  },
  {
    /*
     * A TERM THIS CARD DOES NOT KNOW. Reachable from EITHER producer: the vocabulary is declared
     * in two repos and will gain a term before both agree. Kept and named — dropping it breaks
     * the ledger's one property, and guessing it a finding or a hole asserts a decision from not
     * recognising a word.
     */
    name: "a disposition from a newer vocabulary — named, not dropped, not guessed",
    producers: ["named-hole", "fail"],
    component: {
      archetype: "SOURCE_LEDGER",
      rows: [
        FINDING,
        { row: "fin_new", label: "something new", disposition: "deferred", artifact: "hop-11", verdict: null, reason: null },
      ],
    },
    declares: ["data-ledger-unknown"],
  },
];
