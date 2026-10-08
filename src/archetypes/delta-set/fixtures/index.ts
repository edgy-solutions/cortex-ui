/**
 * THE POPULATION — ADR-0055 §2, for `DELTA_SET`.
 *
 * Extracted from the inline payload literals in `contract.test.ts` (nothing here is a new payload
 * shape): the two-effect set, the sign-ambiguous pair, the lone-direction set, the EMPTY set
 * (an answer, not a refusal), and the four refusals that file already pins.
 *
 * There is NO capture: no `sessions/*.json` carries a DELTA_SET `projected[]` entry today (lot 3
 * is pending from the producer), and these fixtures carry no envelope field either, because no
 * test literal does. `DELTA_SET_ABSENCES` does not exist — the card renders no `data-*` at all.
 * The package says so with `noAbsence`; `noAbsence.test.tsx` holds it to that, and
 * `parity.test.tsx`'s arrival arm fails the day a capture lands.
 */
export interface DeltaSetFixture {
  name: string;
  rows: unknown;
  envelope: Record<string, unknown>;
  /** Always `[]`: the package declares no absences, so no fixture can declare one. */
  declares: string[];
}

const improved = {
  metric: "plan_cost_curve",
  direction: "improved",
  magnitude: "-$1.00M in FY26-Q3",
  affected: ["FY26-Q3"],
  delta: -1_000_000,
};
const degraded = {
  metric: "plan_dependency_violations",
  direction: "degraded",
  magnitude: "1 dependency violated (D4)",
  affected: ["D4"],
  delta: 1,
};

export const DELTA_SET_FIXTURES: DeltaSetFixture[] = [
  { name: "one improved and one degraded effect", rows: [improved, degraded], envelope: {}, declares: [] },
  {
    name: "two negative deltas that point opposite ways",
    rows: [
      { metric: "cost", direction: "improved", magnitude: "-$1M", affected: [], delta: -1 },
      { metric: "maturity", direction: "degraded", magnitude: "-1 level", affected: [], delta: -1 },
    ],
    envelope: {},
    declares: [],
  },
  { name: "improved only", rows: [improved], envelope: {}, declares: [] },
  { name: "an empty set — an answer, not a refusal", rows: [], envelope: {}, declares: [] },
  { name: "refusal: not a list", rows: null, envelope: {}, declares: [] },
  {
    name: "refusal: an effect with no metric",
    rows: [{ direction: "improved", magnitude: "x", affected: [] }],
    envelope: {},
    declares: [],
  },
  { name: "refusal: non-object effects", rows: ["improved"], envelope: {}, declares: [] },
  {
    name: "refusal: an unknown direction",
    rows: [{ metric: "m", direction: "sideways", magnitude: "x", affected: [] }],
    envelope: {},
    declares: [],
  },
];
