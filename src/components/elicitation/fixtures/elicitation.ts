/**
 * DISCRIMINATING FIXTURES — ADR-0055 §2, for `ELICITATION`. The hardest of the three.
 *
 * Fifteen attributes, and only THREE are absences a payload can flip. The rest are reader state,
 * menu content, or the producer's account — and they are listed as EXCLUDED with reasons in the
 * seal beside this file, because an exclusion nobody recorded is indistinguishable from a branch
 * nobody looked at.
 *
 * ── TWO EARLY RETURNS, AND THEY ARE DIFFERENT FACTS ───────────────────────────────────────
 *
 *   abstained   NOTHING WAS RUN. There is no question, so there is no input — offering one asks
 *               a person to do something that can only fail.
 *   refused     the payload IS malformed. Three reasons with three repairs, and the reason
 *               travels on the attribute rather than only in English.
 *
 * Both stop the card. Neither is the third state — a card that drew a complete question — and
 * telling all three apart is what this set exists to do.
 */
export const ELICITATION_ABSENCES = [
  "data-ask-abstained",
  "data-ask-refused",
  "data-free-text-reason",
] as const;

export type ElicitationAbsence = (typeof ELICITATION_ABSENCES)[number];

export interface ElicitationFixture {
  name: string;
  component: Record<string, unknown> | string;
  declares: ElicitationAbsence[];
  /** For a refusal, the reason that must travel on the attribute. */
  refusedBecause?: string;
  /** True when the card must STOP — no question drawn. */
  stops: boolean;
}

export const ELICITATION_FIXTURES: ElicitationFixture[] = [
  {
    name: "a complete question — a menu the reader can answer",
    component: {
      archetype: "ELICITATION",
      slot: "capability_id",
      option_source: "enumeration",
      options: [
        { value: "C1", label: "Data Governance" },
        { value: "C2", label: "Asset Management" },
      ],
    },
    declares: [],
    stops: false,
  },
  {
    name: "no menu, and the producer said why",
    component: {
      archetype: "ELICITATION",
      slot: "capability_id",
      option_source: "none",
      options: [],
      free_text_reason: "too_many",
    },
    declares: ["data-free-text-reason"],
    stops: false,
  },
  {
    name: "abstained — nothing was run, so there is no question",
    component: {
      archetype: "ELICITATION",
      disposition: "abstain",
      status: "no_verb_classified",
      message: "No registered capability confidently fit that question.",
    },
    declares: ["data-ask-abstained"],
    stops: true,
  },
  {
    name: "refused — an empty menu that does not say why",
    component: { archetype: "ELICITATION", slot: "rate_vintage", options: [] },
    declares: ["data-ask-refused"],
    refusedBecause: "an empty menu must say why",
    stops: true,
  },
  {
    name: "refused — the ask names no slot",
    component: { archetype: "ELICITATION", options: [{ value: "a", label: "A" }] },
    declares: ["data-ask-refused"],
    refusedBecause: "the ask names no slot",
    stops: true,
  },
  {
    name: "refused — this is not an ask at all",
    component: "not an object",
    declares: ["data-ask-refused"],
    refusedBecause: "this is not an ask",
    stops: true,
  },
];
