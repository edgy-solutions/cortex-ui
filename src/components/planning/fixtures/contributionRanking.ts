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
  {
    /**
     * ── THE WALKED PAYLOAD, TRANSCRIBED FROM THE PRODUCER ─────────────────────────────────
     *
     * NOT HAND-TYPED. Every field name, type and value below is read from
     * `cost_agent/measures.py::cost_supplier_concentration` at producer `c0005142`, against
     * the seeded lot 3: `_SUPPLIER_SHARES` (.41/.27/.19/.13) struck on that lot's material
     * value of 1,085,760.00, and `DEFAULT_CONCENTRATION_THRESHOLD` = 0.25. The shares sum to
     * 1.0000 and exactly TWO rows sit above the bound, which is what the producer's own
     * `suppliers_above_threshold` reports for this payload.
     *
     * ⛔ THE BOOLEAN IS THE POINT. `above_threshold` rendered "not drawable here" on all four
     * rows — the same sentence for the two suppliers over the bound and the two under it. A
     * hand-typed fixture would have carried whatever shape I imagined; this one carries the
     * shape that actually failed on screen, INCLUDING the two `false` rows, which are the ones
     * a truthiness test would silently have dropped.
     *
     * IT ALSO RECORDS A PRODUCER DUPLICATION rather than hiding it: `supplier`/`entity_name`,
     * `amount`/`contribution` and `share_of_purchased`/`share_of_total` are the same three
     * facts under two vocabularies, because the verb aliases its own fields into cortex's names
     * and leaves the originals in the row. That is the producer's to rule on. This card shows
     * what arrived.
     */
    name: "supplier concentration — the producer's real row, boolean flag and all",
    rows: [
      { entity_id: "Cobalt Components", entity_name: "Cobalt Components", contribution: 445161.6, share_of_total: 0.41, rank: 1, supplier: "Cobalt Components", amount: "445161.60", share_of_purchased: "0.4100", above_threshold: true, value_unit: "USD" },
      { entity_id: "Amber Fabrication", entity_name: "Amber Fabrication", contribution: 293155.2, share_of_total: 0.27, rank: 2, supplier: "Amber Fabrication", amount: "293155.20", share_of_purchased: "0.2700", above_threshold: true, value_unit: "USD" },
      { entity_id: "Sable Castings", entity_name: "Sable Castings", contribution: 206294.4, share_of_total: 0.19, rank: 3, supplier: "Sable Castings", amount: "206294.40", share_of_purchased: "0.1900", above_threshold: false, value_unit: "USD" },
      { entity_id: "Verdigris Electronics", entity_name: "Verdigris Electronics", contribution: 141148.8, share_of_total: 0.13, rank: 4, supplier: "Verdigris Electronics", amount: "141148.80", share_of_purchased: "0.1300", above_threshold: false, value_unit: "USD" },
    ] as unknown as ContributionRow[],
    value_unit: "USD",
    // NO `data-extras-dropped`: with the boolean admitted, every extra this payload carries has
    // a one-cell rendering. Before the fix this fixture would have declared it four times over —
    // which is the regression this entry is here to catch.
    // `no-verdict` and `sign-withheld` are both genuinely true of it: the verb states no
    // favourable/adverse judgement, and a concentration breakdown is all-positive shares.
    declares: ["data-no-verdict", "data-sign-withheld", "data-extra-columns"],
  },
];
