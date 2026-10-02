/**
 * DISCRIMINATING FIXTURES — ADR-0055 §2, for `COMPETING_MEASURES`.
 *
 * Six declared absences, and one of them is a REFUSAL that returns before the card renders at
 * all. That branch is what the two ranking fixtures never exercised: a flip has to reach a card
 * that STOPS, where every other absence is absent not because the payload was complete but
 * because nothing was drawn. Those two states look identical from outside and are not the same
 * fact, which is why the refusal fixture names the refusal explicitly rather than declaring
 * nothing.
 */
import type { CompetingMeasureRow } from "../contract";

export const COMPETING_MEASURES_ABSENCES = [
  "data-refused",
  "data-unavailable",
  "data-incomplete",
  "data-spread-unreported",
  "data-range-absent",
  "data-secondary-absent",
  // Added 2026-09-26 with the fallback withdrawal. THE CENSUS FOUND IT BEFORE I DID: the absence
  // list is derived from the card's own rendered attributes, so the new branch failed "the card
  // declares an absence no fixture flips" the moment it existed and before any seal was written
  // for it. That is the instrument working in the direction it was built for.
  "data-completeness-unstated",
] as const;

export type CompetingMeasuresAbsence = (typeof COMPETING_MEASURES_ABSENCES)[number];

export interface CompetingMeasuresFixture {
  name: string;
  rows: unknown;
  envelope: Record<string, unknown>;
  declares: CompetingMeasuresAbsence[];
}

/** The complete comparison: three methods, all answered, spread and bounds sent. */
const COMPLETE: CompetingMeasureRow[] = [
  {
    method: "CPI",
    formula: "EAC = BAC / CPI",
    value: 14152380.95,
    unavailable_reason: null,
    secondary: [{ label: "VAC", value: -2152380.95 }],
  },
  { method: "CPI_SPI", formula: "EAC = ACWP + (BAC - BCWP) / (CPI x SPI)", value: 14792607.71, unavailable_reason: null },
  { method: "Bottom-up", formula: "sum of control accounts", value: 13130000.0, unavailable_reason: null },
];

const ENVELOPE = {
  spread: 1662607.71,
  spread_percent_of_bac: 0.1386,
  lowest_value: 13130000.0,
  highest_value: 14792607.71,
  methods_compared: 3,
  methods_answered: 3,
  all_methods_answered: true,
  reference_value: 12000000,
  value_unit: "USD",
  scope_label: "Notional Program Meridian",
};

export const COMPETING_MEASURES_FIXTURES: CompetingMeasuresFixture[] = [
  {
    name: "complete — three methods answered, spread and bounds sent",
    rows: COMPLETE,
    envelope: ENVELOPE,
    declares: [],
  },
  {
    /*
     * THE CARD STOPS. Nothing below the refusal renders, so every other absence is absent
     * because NOTHING WAS DRAWN rather than because the payload was complete. Naming the
     * refusal is what separates those two readings — they are identical from outside.
     */
    name: "refused — one method is not a comparison",
    rows: [COMPLETE[0]],
    envelope: ENVELOPE,
    declares: ["data-refused"],
  },
  {
    name: "a method could not answer — the row survives its own absence",
    rows: [
      { ...COMPLETE[0], value: null, unavailable_reason: "no actuals posted", secondary: undefined },
      COMPLETE[1],
      COMPLETE[2],
    ],
    envelope: { ...ENVELOPE, methods_answered: 2, all_methods_answered: false },
    declares: ["data-unavailable", "data-incomplete"],
  },
  {
    name: "spread not sent — the methods disagree and the figure was withheld",
    rows: COMPLETE,
    envelope: { ...ENVELOPE, spread: null, spread_percent_of_bac: null },
    declares: ["data-spread-unreported"],
  },
  {
    name: "no bounds — a range slot with no range, which was a bare unit",
    rows: COMPLETE,
    envelope: { ...ENVELOPE, lowest_value: null, highest_value: null },
    declares: ["data-range-absent"],
  },
  {
    /*
     * THE TRUNCATION CASE, AND IT IS THE ONE THAT USED TO DRAW NOTHING. Three rows that all
     * answer and a producer that claims no completeness: before the ruling this rendered a clean
     * card with no banner, which is exactly what a full comparison looks like, so a set that had
     * silently lost a row was indistinguishable from a whole one.
     *
     * The envelope is SPELLED OUT rather than spread-minus-three-keys, because this fixture's
     * subject IS which keys are absent — `{ ...ENVELOPE, methods_compared: undefined }` leaves
     * the keys present with undefined values, which renders the same and would satisfy any
     * containment check on the payload while claiming the producer sent them.
     */
    name: "completeness not stated — every row answers and the producer claims nothing",
    rows: COMPLETE,
    envelope: {
      spread: 1662607.71,
      spread_percent_of_bac: 0.1386,
      lowest_value: 13130000.0,
      highest_value: 14792607.71,
      reference_value: 12000000,
      value_unit: "USD",
      scope_label: "Notional Program Meridian",
    },
    declares: ["data-completeness-unstated"],
  },
  {
    name: "a secondary figure is absent — the primary already says why it is not",
    rows: [
      { ...COMPLETE[0], secondary: [{ label: "VAC", value: null }] },
      COMPLETE[1],
      COMPLETE[2],
    ],
    envelope: ENVELOPE,
    declares: ["data-secondary-absent"],
  },
];
