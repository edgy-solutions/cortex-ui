/**
 * THE POPULATION — ADR-0055 §2, for `SHORTFALL_GRID`.
 *
 * Extracted from the inline payload literals in the card's own tests (nothing here is a new
 * payload shape): `gridForm.test.tsx` (one cell per state, plus an unknown state),
 * `CellInspector.test.tsx` (a state-less cell, and the no-shortfall cell), and the contract's
 * acceptance/refusal literals in `Card.test.tsx`.
 *
 * There is NO `SHORTFALL_GRID_ABSENCES`. Across this population plus the funding-status capture
 * no `data-*` attribute flips with the payload: the only `data-*` the card renders at all is the
 * click-only `data-cell-inspector` (ADR-0055 amendment 2026-09-18 §1). The package says so
 * explicitly with `noAbsence`, and `noAbsence.test.tsx` holds it to that.
 */
export interface ShortfallGridFixture {
  name: string;
  rows: unknown;
  envelope: Record<string, unknown>;
  /** Always `[]`: the package declares no absences, so no fixture can declare one. */
  declares: string[];
}

const cell = (state: string | undefined, over: Record<string, unknown> = {}) => [
  {
    subject_id: "O1",
    subject_label: "Org A",
    period: "P1",
    required: 100,
    committed: 100,
    secured: 100,
    shortfall: 0,
    ...(state === undefined ? {} : { state }),
    ...over,
  },
];

export const SHORTFALL_GRID_FIXTURES: ShortfallGridFixture[] = [
  { name: "a met cell", rows: cell("met"), envelope: {}, declares: [] },
  { name: "a pledged-not-firm cell", rows: cell("pledged-not-firm"), envelope: {}, declares: [] },
  { name: "a short cell", rows: cell("short"), envelope: {}, declares: [] },
  { name: "a cell with a state this card does not know", rows: cell("renegotiating"), envelope: {}, declares: [] },
  {
    name: "a state-less cell with a shortfall",
    rows: [
      { subject_id: "O1", subject_label: "Org A", period: "P1", required: 100, committed: 60, secured: 40, shortfall: 40 },
    ],
    envelope: {},
    declares: [],
  },
  {
    name: "a state-less cell with no shortfall",
    rows: [
      { subject_id: "O1", subject_label: "Org A", period: "P1", required: 100, committed: 100, secured: 100, shortfall: 0 },
    ],
    envelope: {},
    declares: [],
  },
  {
    name: "an accepted row with subject_name and a fiscal period",
    rows: [
      { subject_id: "o1", subject_name: "Ops", period: "FY26-Q1", required: 10, committed: 4, secured: 4, shortfall: 6, state: "short" },
    ],
    envelope: {},
    declares: [],
  },
  { name: "refusal: no rows", rows: [], envelope: {}, declares: [] },
  { name: "refusal: a row with no subject", rows: [{ required: 1 }], envelope: {}, declares: [] },
  { name: "refusal: a row with no required", rows: [{ subject_id: "o1" }], envelope: {}, declares: [] },
];
