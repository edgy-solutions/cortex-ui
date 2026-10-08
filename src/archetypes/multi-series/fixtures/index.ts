/**
 * DISCRIMINATING FIXTURES — ADR-0055 §2, for `MULTI_SERIES`.
 *
 * Extracted from the inline payload literals in `Card.test.tsx` (nothing here is a new payload
 * shape): the payloads the card should DRAW, plus the refusals the tests already pin.
 *
 * `ABSENCES` is DERIVED, not chosen: every `data-*` attribute NAME in the card's subtree whose
 * presence flips across the parity population (these fixtures plus the renderable capture).
 */
export const MULTI_SERIES_ABSENCES = [
  "data-verdict",
  "data-reference-unreadable",
] as const;

export type MultiSeriesAbsence = (typeof MULTI_SERIES_ABSENCES)[number];

export interface MultiSeriesFixture {
  name: string;
  rows: unknown;
  envelope: Record<string, unknown>;
  declares: MultiSeriesAbsence[];
}

/** Build a payload of ANY shape, so no fixture knows a consumer's field names. */
const payload = (keys: string[], periods = 3, unit?: string | null) => ({
  series: keys.map((k) => ({ key: k, label: k.toUpperCase(), ...(unit === undefined ? {} : { unit }) })),
  rows: Array.from({ length: periods }, (_, i) => {
    const row: Record<string, unknown> = { period: `P${i + 1}` };
    for (const [n, k] of keys.entries()) row[k] = (i + 1) * (n + 1);
    return row;
  }),
});

const two = (unit?: string | null) => payload(["a", "b"], 3, unit);

export const MULTI_SERIES_FIXTURES: MultiSeriesFixture[] = [
  {
    name: "two series, dimensionless — the unit is null",
    rows: two(null).rows,
    envelope: { series: two(null).series },
    declares: [],
  },
  {
    name: "two series in USD, scope and value labels sent",
    rows: two("USD").rows,
    envelope: { series: two("USD").series, value_label: "Burn", scope_label: "Notional Program Meridian" },
    declares: [],
  },
  {
    name: "two series, no unit declared at all",
    rows: two().rows,
    envelope: { series: two().series },
    declares: [],
  },
  {
    name: "one series",
    rows: payload(["a"]).rows,
    envelope: { series: payload(["a"]).series },
    declares: [],
  },
  {
    name: "a reference line the payload declares, and a verdict the producer sent",
    rows: two().rows,
    envelope: { series: two().series, reference: { value: 1, label: "target" }, verdict: "CPI below 1.0" },
    declares: ["data-verdict"],
  },
  {
    name: "a series below a declared reference, and NO verdict sent",
    rows: two().rows,
    envelope: { series: two().series, reference: { value: 9999, label: "line" } },
    declares: [],
  },
  {
    name: "a reference with a label and no value — declared but unreadable",
    rows: two().rows,
    envelope: { series: two().series, reference: { label: "target" } },
    declares: ["data-reference-unreadable"],
  },
  {
    name: "refused — the payload declares no series",
    rows: two().rows,
    envelope: {},
    declares: [],
  },
  {
    name: "refused — a declared series that appears in no row",
    rows: two().rows,
    envelope: { series: [...two().series, { key: "ghost", label: "GHOST" }] },
    declares: [],
  },
  {
    name: "refused — series with different units cannot share an axis",
    rows: two().rows,
    envelope: {
      series: [
        { key: "a", label: "A", unit: "USD" },
        { key: "b", label: "B", unit: null },
      ],
    },
    declares: [],
  },
  {
    name: "refused — an empty period set",
    rows: [],
    envelope: { series: payload(["a"]).series },
    declares: [],
  },
];
