/**
 * MULTI_SERIES — several DECLARED series over the same periods. No cap, no threshold.
 *
 * Structural: it draws "these named quantities, measured over these periods, together." Its
 * first consumers are a burn rate against plan and a pair of performance indices; nothing here
 * knows either phrase.
 *
 * ── WHY THIS IS MINTED AND NOT `PERIOD_SERIES` GENERALISED ─────────────────────────────────
 *
 * `PERIOD_SERIES` is not a generic archetype with a lax validator. It is one producer's cost
 * curve wearing a generic name: `PeriodSeriesRow` requires seven keys — period, capex, expense,
 * total, cap, over_cap, overage — and its component hardcodes `<Bar dataKey="capex">`,
 * `<Bar dataKey="expense">` and an "over by" column. Every field means something
 * cost-curve-shaped, and a cap is central to all of it.
 *
 * A burn rate (burn vs planned) and a pair of indices (CPI vs SPI) are two lines with NO cap,
 * and one of them is dimensionless. That is a different visual claim, not a missing field —
 * the same reason the maturity rungs were their own shape rather than a recoloured ratio bar.
 * Generalising would mean retrofitting a declared-series contract onto a component whose every
 * field is cost-curve-shaped, coordinating two lanes in one change, and leaving a name on a
 * thing that no longer means what it did.
 *
 * ── THE SERIES ARE DECLARED, WHICH IS THE ENTIRE POINT ─────────────────────────────────────
 *
 * A payload that carries numbers and does not say which of its keys are series forces the
 * renderer to guess — and a renderer that guesses hardcodes, which is exactly how PERIOD_SERIES
 * ended up specific. So `series` is REQUIRED, and its absence is a refusal rather than a
 * fallback to "plot every numeric key I can find". That fallback is the tempting one and it is
 * the defect: a row carrying `trailing_periods: 6` alongside `burn` and `planned` would draw a
 * third line that is not a series at all.
 *
 * ── UNITS ARE PER SERIES, WHICH RETIRES ACCOMMODATION A2 ───────────────────────────────────
 *
 * Engine F named a field `amount_unit` instead of `value_unit` specifically to defeat an
 * envelope-level lift that would have promoted a currency onto a ratio chart. That was a
 * workaround for an archetype with one unit for the whole card.
 *
 * Here the unit belongs to the SERIES. CPI and SPI declare none and render as bare ratios;
 * burn and planned declare USD and render as money. The lift has nothing to lift, so the
 * rename stops being load-bearing and becomes an ordinary field name.
 *
 * SERIES WITH DIFFERENT UNITS ARE REFUSED rather than drawn on one axis. Two quantities sharing
 * a y-axis is a claim that they are comparable, and a card that puts dollars beside a ratio has
 * made that claim on the reader's behalf. Refusing names the problem; drawing it hides one.
 */

export const MULTI_SERIES_ROW_REQUIREMENTS = {
  minRows: 1,
  /** The payload says which keys are series. The renderer never infers them. */
  seriesAreDeclared: true,
  /** One axis, one unit. Mixed units are a refusal, not a second axis. */
  oneUnitPerCard: true,
  /** No cap, no threshold, no over-limit anything. Those belong to PERIOD_SERIES. */
  noCapSemantics: true,
} as const;

export const MULTI_SERIES_REFUSAL_REASONS = [
  "no periods recorded",
  "the payload does not declare which of its keys are series",
  "a declared series appears in no row",
  "series declare different units — they cannot share an axis",
] as const;

export const MULTI_SERIES_CONTRACT = {
  archetype: "MULTI_SERIES",
  component: "MultiSeries",
  layout: "full-width",
  /** ADR-0042 Ruling 9's discriminant: a series over periods moves as the periods report. */
  recomputes: true,
  fields: {
    /** One row per period: `period` plus a numeric value under each declared series key. */
    rows: { encoding: "array", parsesTo: "array-of-objects", required: true },
    /**
     * WHICH KEYS ARE SERIES, and what to call them. `[{ key, label, unit? }]`. Required —
     * see the header; inferring this is how the neighbouring archetype became specific.
     */
    series: { encoding: "array", parsesTo: "array-of-objects", required: true },
    /**
     * A DECLARED reference line — `{ value, label }`. Optional, drawn when present.
     *
     * THE CARD DOES NOT KNOW WHICH VALUES ARE MEANINGFUL. A performance index has a target of
     * 1.0 and a burn rate has none, and an archetype that drew a 1.0 line because a series
     * looked like a ratio would be inventing the same kind of fact as plotting
     * `trailing_periods` — a mark that means something for the first consumer and nothing for
     * the next. The producer knows; the producer declares.
     *
     * This is also why it is not a "cap": a cap is a limit that can be BREACHED, and breach is
     * PERIOD_SERIES's vocabulary. A reference is a line to read against, and the card states no
     * verdict about which side of it a series sits.
     */
    reference: { encoding: "object", parsesTo: "object", required: false },
    /**
     * A verdict the PRODUCER states about this chart, rendered verbatim beside the title.
     *
     * NEVER INFERRED. "CPI below 1.0" is a judgement, and a card computing it from
     * `value < reference.value` would be deciding what the reference MEANS — favourable below
     * for a cost ratio, unfavourable below for an index, and the card cannot tell which. Same
     * rule the ranking follows for `favourable`.
     */
    verdict: { type: "string", required: false },
    /** What the values MEAN collectively. Supplied; the renderer invents no framing. */
    value_label: { type: "string", required: false },
    scope_label: { type: "string", required: false },
  },
  rowRequirements: MULTI_SERIES_ROW_REQUIREMENTS,
  refusalReasons: MULTI_SERIES_REFUSAL_REASONS,
} as const;

export type MultiSeriesContract = typeof MULTI_SERIES_CONTRACT;
export type MultiSeriesRefusal = (typeof MULTI_SERIES_REFUSAL_REASONS)[number];

/** One declared series. `unit` absent means DIMENSIONLESS — a ratio, not an unknown currency. */
export interface SeriesDecl {
  key: string;
  label: string;
  unit?: string | null;
  /**
   * Draw this series dashed. Optional; solid when absent.
   *
   * DECLARED, BECAUSE THE CARD CANNOT KNOW WHICH SERIES IS A PLAN. A dashed stroke reads as
   * "intended rather than measured", which is exactly right for a spend plan beside actual
   * spend and exactly wrong for one performance index beside another. Varying it by POSITION
   * would put a dash on whichever series happened to be declared second — meaningful for the
   * first consumer and arbitrary for the next, which is the defect this archetype was minted
   * to avoid.
   *
   * A STYLE HINT, NOT A SEMANTIC. It says how to draw, never what the series means; nothing
   * else in this component reads it.
   */
  dashed?: boolean;
}

export interface MultiSeriesRow {
  period: string;
  [key: string]: unknown;
}

/** A declared line to read the series against. The card draws it and judges nothing. */
export interface SeriesReference {
  value: number;
  label?: string;
}

/** Reads a reference only when it carries a usable number. A label-only reference draws no line. */
export function readReference(v: unknown): SeriesReference | null {
  if (typeof v !== "object" || v === null || Array.isArray(v)) return null;
  const r = v as Record<string, unknown>;
  if (typeof r.value !== "number" || !Number.isFinite(r.value)) return null;
  return { value: r.value, label: typeof r.label === "string" ? r.label : undefined };
}

export interface MultiSeriesData {
  rows: MultiSeriesRow[];
  series: SeriesDecl[];
  /** The single unit every series shares, or null when they are all dimensionless. */
  unit: string | null;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

export function validateMultiSeries(
  rows: unknown,
  series: unknown,
): { kind: "ok"; data: MultiSeriesData } | { kind: "empty"; reason: MultiSeriesRefusal } {
  if (!Array.isArray(rows) || rows.length < MULTI_SERIES_ROW_REQUIREMENTS.minRows) {
    return { kind: "empty", reason: "no periods recorded" };
  }
  const objs = rows.filter(isRecord);
  if (objs.length !== rows.length) {
    return { kind: "empty", reason: "no periods recorded" };
  }

  // DECLARED OR REFUSED. Falling back to "plot every numeric key" would draw
  // `trailing_periods: 6` as a series beside burn and planned.
  if (!Array.isArray(series) || series.length === 0) {
    return {
      kind: "empty",
      reason: "the payload does not declare which of its keys are series",
    };
  }
  const decls = series.filter(
    (s): s is SeriesDecl =>
      isRecord(s) && typeof s.key === "string" && !!s.key && typeof s.label === "string",
  );
  if (decls.length !== series.length || decls.length === 0) {
    return {
      kind: "empty",
      reason: "the payload does not declare which of its keys are series",
    };
  }

  // A DECLARED SERIES THAT IS IN NO ROW is the declared-but-absent shape: a legend entry with
  // no line, which reads as "this measured zero" rather than "this was never sent".
  for (const d of decls) {
    if (!objs.some((r) => typeof r[d.key] === "number")) {
      return { kind: "empty", reason: "a declared series appears in no row" };
    }
  }

  // ONE AXIS, ONE UNIT. `undefined` and `null` both mean dimensionless and are the same unit.
  const units = new Set(decls.map((d) => (d.unit == null ? "" : String(d.unit))));
  if (units.size > 1) {
    return { kind: "empty", reason: "series declare different units — they cannot share an axis" };
  }
  const unit = [...units][0] || null;

  return {
    kind: "ok",
    data: { rows: objs as unknown as MultiSeriesRow[], series: decls, unit },
  };
}
