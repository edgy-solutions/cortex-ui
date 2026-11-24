/**
 * THE POPULATION — ADR-0055 §2, for `SHORTFALL_GRID`.
 *
 * Extracted from the inline payload literals in the card's own tests (nothing here is a new
 * payload shape): `gridForm.test.tsx` (one cell per state, plus an unknown state),
 * `CellInspector.test.tsx` (a state-less cell, and the no-shortfall cell), and the contract's
 * acceptance/refusal literals in `Card.test.tsx`.
 *
 * Until #528 (80dcbbae, 2026-11-23) there was NO `SHORTFALL_GRID_ABSENCES`: no `data-*` attribute
 * flipped with the payload (the only one is the click-only `data-cell-inspector`, ADR-0055 amendment
 * 2026-09-18 §1), and the package declared `noAbsence`. The producer's `data_provenance` sentence is
 * drawn verbatim as `data-served-provenance`, which does flip, so the package now declares it.
 */
export const SHORTFALL_GRID_ABSENCES = ["data-served-provenance"] as const;

export type ShortfallGridAbsence = (typeof SHORTFALL_GRID_ABSENCES)[number];

export interface ShortfallGridFixture {
  name: string;
  rows: unknown;
  envelope: Record<string, unknown>;
  declares: ShortfallGridAbsence[];
}

/** TRANSCRIBED from `finance_agent/seed.py::notional_banner` at producer 950b3eb9, as MULTI_SERIES's fixture has it. */
const NOTIONAL_BANNER =
  "NOTIONAL DATA — invented program, round figures, public EVM formulas. Not derived from any real program (ADR-0045 Decision 4).";

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
  {
    name: "the producer served a data_provenance sentence (the notional banner)",
    rows: cell("short"),
    envelope: { data_provenance: NOTIONAL_BANNER },
    declares: ["data-served-provenance"],
  },
];
