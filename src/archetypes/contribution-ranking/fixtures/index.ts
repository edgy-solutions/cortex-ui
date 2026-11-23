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
import type { ContributionRow } from "../contract";

/** Every absence this card can declare. The seal derives its coverage from this list. */
export const CONTRIBUTION_RANKING_ABSENCES = [
  "data-no-verdict",
  "data-legend-partial",
  "data-sign-withheld",
  "data-share-absent",
  "data-extras-dropped",
  "data-extra-columns",
  "data-card-extras",
  // Payload claims: the producer truncated and declared the tail / the declared tail is inconsistent.
  "data-withheld-tail",
  "data-withheld-disagree",
] as const;

export type ContributionRankingAbsence = (typeof CONTRIBUTION_RANKING_ABSENCES)[number];

export interface ContributionRankingFixture {
  /** What this payload is, in the terms of the claim it exercises. */
  name: string;
  rows: ContributionRow[];
  value_unit?: string;
  /** Card-level, not row-level — the bound the producer stated and who chose it. */
  threshold?: string | number;
  threshold_defaulted?: boolean;
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

/**
 * The finance variance-drivers payload, row by row. Exported so the card's test can open the same
 * rows the parity seal sees.
 *
 * SHAPE transcribed from `agent_fleet/finance_agent/measures.py::fin_variance_drivers` at producer
 * `950b3eb9` (release 0.4.91): the generic keys, the finance names, `_emit_money`'s `X_exact`
 * twins for contribution/bcws/bcwp/acwp and `share_of_total`, the control-account extras
 * `wbs_id`/`obs_id`/`bac` (technique is None at this level and the verb drops None), and `rank`
 * from `rank_drivers`. FIGURES from the 09-19 capture's control-account level
 * (`fixtures/captures/2026-09-19-payload-finance-variance-drivers.json`), not re-measured.
 * `value` and `bac` are Decimals the verb does not pass through `_emit_money`; their wire type is
 * not established by reading the source, so they are carried as numbers here. This is the payload
 * whose raw names the architect saw.
 */
export const FINANCE_VARIANCE_DRIVERS_ROWS = [
  { instance_id:"3.1", instance_label:"Integration and Test", property_label:"Cost variance", value:-1100000,
    entity_id:"3.1", entity_name:"Integration and Test", variance_kind:"cost", contribution:-1100000,
    share_of_total:0.9734513274336283, favourable:false, bcws:1800000, bcwp:1500000, acwp:2600000,
    value_unit:"USD", scope_label:"Notional Program Meridian", wbs_id:"3", obs_id:"OBS-TEST", bac:3000000, rank:1,
    contribution_exact:"-1100000.00", bcws_exact:"1800000.00", bcwp_exact:"1500000.00", acwp_exact:"2600000.00",
    share_of_total_exact:"0.9734513274336283185840707965" },
  { instance_id:"5.1", instance_label:"Logistics Support", property_label:"Cost variance", value:-150000,
    entity_id:"5.1", entity_name:"Logistics Support", variance_kind:"cost", contribution:-150000,
    share_of_total:0.13274336283185842, favourable:false, bcws:750000, bcwp:750000, acwp:900000,
    value_unit:"USD", scope_label:"Notional Program Meridian", wbs_id:"5", obs_id:"OBS-LOG", bac:1500000, rank:2,
    contribution_exact:"-150000.00", bcws_exact:"750000.00", bcwp_exact:"750000.00", acwp_exact:"900000.00",
    share_of_total_exact:"0.1327433628318584070796460177" },
  { instance_id:"1.1", instance_label:"Systems Engineering", property_label:"Cost variance", value:120000,
    entity_id:"1.1", entity_name:"Systems Engineering", variance_kind:"cost", contribution:120000,
    share_of_total:-0.10619469026548672, favourable:true, bcws:1200000, bcwp:1200000, acwp:1080000,
    value_unit:"USD", scope_label:"Notional Program Meridian", wbs_id:"1", obs_id:"OBS-ENG", bac:2000000, rank:3,
    contribution_exact:"120000.00", bcws_exact:"1200000.00", bcwp_exact:"1200000.00", acwp_exact:"1080000.00",
    share_of_total_exact:"-0.1061946902654867256637168142" },
] as unknown as ContributionRow[];

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
    // THE PRODUCER'S REAL BOUND, from the same read: `str(DEFAULT_CONCENTRATION_THRESHOLD)` and
    // `defaulted` true, because the walked call passed no threshold of its own.
    threshold: "0.25",
    threshold_defaulted: true,
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
    declares: ["data-no-verdict", "data-sign-withheld", "data-extra-columns", "data-card-extras"],
  },
  {
    /**
     * THE BOUND THE CALLER CHOSE — the other side of `threshold_defaulted`, and the reason this
     * is a fixture rather than a line in the one above.
     *
     * ⛔ A DEFAULTED BOUND AND A CHOSEN ONE ARE DIFFERENT FACTS, and the whole point of the
     * producer resolving its default inside the function (rather than in the signature) is that
     * it can tell them apart. A card that printed `threshold` and dropped `threshold_defaulted`
     * would show this payload and the one above IDENTICALLY but for four characters — and would
     * pass every seal that only checks the bound is present. So the set carries both, and the
     * seal beside it asserts they RENDER DIFFERENTLY.
     *
     * `0.40` and `false` are the pair the producer's own seals use
     * (`tests/cost/test_export_package_seals.py:1094`), not numbers I chose.
     */
    name: "a chosen bound — the caller named it, so it was not defaulted",
    rows: COMPLETE,
    value_unit: "USD",
    threshold: "0.40",
    threshold_defaulted: false,
    // ONLY the card-level claim. The rows are the complete control set, so nothing else moves —
    // which is what makes this fixture's single declaration attributable to the bound alone.
    declares: ["data-card-extras"],
  },
  {
    /**
     * The producer's own finance payload, _exact twins and all — see FINANCE_VARIANCE_DRIVERS_ROWS
     * for where the shape and the figures come from.
     */
    name: "finance variance drivers — the producer's row, _exact twins and all",
    rows: FINANCE_VARIANCE_DRIVERS_ROWS,
    value_unit: "USD",
    // Judged, signed, shares present, every extra a scalar: only the extras claim moves.
    declares: ["data-extra-columns"],
  },
  {
    /**
     * Values constructed, shape per `rank_drivers` at 9b6f4c9f (no capture carries a truncated
     * ranking): when it truncates, every row carries `withheld_contributors` and
     * `withheld_contribution` (+ `_exact` from `_emit_money`).
     */
    name: "finance variance drivers truncated — the producer declared its tail",
    rows: FINANCE_VARIANCE_DRIVERS_ROWS.map((r) => ({
      ...r,
      withheld_contributors: 2,
      withheld_contribution: -40000,
      withheld_contribution_exact: "-40000.00",
    })) as unknown as ContributionRow[],
    value_unit: "USD",
    declares: ["data-extra-columns", "data-withheld-tail"],
  },
  {
    /** Values constructed (as above): the third row's count differs, which the producer never does. */
    name: "a tail the rows disagree on",
    rows: FINANCE_VARIANCE_DRIVERS_ROWS.map((r, i) => ({
      ...r,
      withheld_contributors: i === 2 ? 3 : 2,
      withheld_contribution: -40000,
      withheld_contribution_exact: "-40000.00",
    })) as unknown as ContributionRow[],
    value_unit: "USD",
    declares: ["data-extra-columns", "data-withheld-disagree"],
  },
];
