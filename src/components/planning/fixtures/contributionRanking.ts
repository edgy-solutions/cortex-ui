/**
 * DISCRIMINATING FIXTURES — ADR-0055 §2, for `CONTRIBUTION_RANKING`.
 *
 * The packaging gate: *a fixture discriminates against the card's declared absences — each
 * flips at least one — and a card with a claim no attribute names may not be packaged until it
 * declares one.* This card was the worked case for that rule at 16 branches against 4
 * attributes; it now declares six, and these are the payloads that move them.
 *
 * ⛔ EACH FIXTURE NAMES THE ABSENCES IT EXPECTS, and the seal beside it asserts BOTH directions
 * — present where named, absent where not. A fixture that only ever showed absences present
 * could not tell a correct card from one that declares everything always, which is the
 * always-red guard that gets deleted in a week.
 *
 * These are payloads, not renderings. They carry no expectations about layout, because the
 * parity seal's subject is the declared facts and not the pixels.
 */
import type { ContributionRow } from "../ContributionRanking.contract";

/** Every absence this card can declare. The seal derives its coverage from this list. */
export const CONTRIBUTION_RANKING_ABSENCES = [
  "data-no-verdict",
  "data-legend-partial",
  "data-sign-withheld",
  "data-share-absent",
  "data-extras-dropped",
  "data-extra-columns",
] as const;

export type ContributionRankingAbsence = (typeof CONTRIBUTION_RANKING_ABSENCES)[number];

export interface ContributionRankingFixture {
  /** What this payload is, in the terms of the claim it exercises. */
  name: string;
  rows: ContributionRow[];
  value_unit?: string;
  /** The absences that MUST be declared for this payload. Everything else must NOT be. */
  declares: ContributionRankingAbsence[];
}

/**
 * A row the card can draw entirely: judged, signed, with a share and no undrawable extras.
 * The control every other fixture is read against.
 */
const COMPLETE: ContributionRow[] = [
  { entity_id: "CA1", entity_name: "Control Account 3.1", contribution: -800000, share_of_total: 0.62, favourable: false },
  { entity_id: "CA2", entity_name: "Control Account 4.2", contribution: 300000, share_of_total: 0.38, favourable: true },
];

export const CONTRIBUTION_RANKING_FIXTURES: ContributionRankingFixture[] = [
  {
    name: "complete — every claim the card can make, made",
    rows: COMPLETE,
    value_unit: "USD",
    declares: [],
  },
  {
    name: "unsigned set — no second direction, so no plus",
    // Every contribution positive: these are shares of one total and a `+` would assert a
    // movement the payload never claimed.
    rows: [
      { entity_id: "A", entity_name: "Labour", contribution: 4900000, share_of_total: 0.62, favourable: true },
      { entity_id: "B", entity_name: "Materials", contribution: 3000000, share_of_total: 0.38, favourable: true },
    ],
    value_unit: "USD",
    declares: ["data-sign-withheld"],
  },
  {
    name: "no verdict — the producer judged nothing",
    rows: COMPLETE.map(({ favourable: _drop, ...r }) => r as ContributionRow),
    value_unit: "USD",
    declares: ["data-no-verdict"],
  },
  {
    name: "partially judged — some rows carry a verdict and some do not",
    rows: [COMPLETE[0], { ...COMPLETE[1], favourable: undefined } as ContributionRow],
    value_unit: "USD",
    declares: ["data-legend-partial"],
  },
  {
    name: "null share — the total was nought, so a share is absent rather than zero",
    rows: [{ entity_id: "A", entity_name: "Labour", contribution: 10, share_of_total: null, favourable: true }],
    value_unit: "USD",
    declares: ["data-share-absent", "data-sign-withheld"],
  },
  {
    name: "undrawable extra — a value arrived with no one-cell rendering",
    rows: [
      {
        ...COMPLETE[0],
        // An object has no single-cell form. Dropping it silently shows a complete-looking row
        // with a key missing from it.
        breakdown: { labour: 4, materials: 6 },
      } as ContributionRow,
      COMPLETE[1],
    ],
    value_unit: "USD",
    // BOTH: the dropped key is named INSIDE the extras container, and correctly so — a field
    // that arrived and cannot be drawn is still a field beyond the ones this card consumes.
    // The seal caught this fixture claiming otherwise, which is the seal doing its job on the
    // fixture rather than on the card.
    declares: ["data-extras-dropped", "data-extra-columns"],
  },
  {
    name: "drawable extra — a scalar the payload carried beyond the consumed fields",
    rows: [{ ...COMPLETE[0], hours: 1200 } as ContributionRow, COMPLETE[1]],
    value_unit: "USD",
    declares: ["data-extra-columns"],
  },
];
