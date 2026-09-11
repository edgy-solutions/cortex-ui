/**
 * COMPETING_MEASURES — N methods measuring ONE quantity, where the SPREAD is the finding.
 *
 * Structural: it draws "several named methods claim to measure the same thing, they disagree,
 * and the disagreement is the answer." Its first consumer is estimate-at-completion by all
 * three earned-value formulas; nothing here knows that. Three estimating models for a schedule,
 * three inflation indices, three sizing techniques all want this card.
 *
 * ── IT IS THE PLURAL OF FORECAST_MEASURE, AND THAT CONTRACT SAID SO ───────────────────────
 *
 * `FORECAST_MEASURE_ROW_REQUIREMENTS.exactlyOneRow` carries the note "One forecast. A list of
 * them is a series, which is a different archetype." That was a decision, not a limit, and it
 * pointed here. Its header goes further and names this exact case as its own reason to exist:
 * the three formulas "disagree materially on the same program — on its own seed they span
 * $13.13M, $14.15M and $14.79M against a $12.00M budget, a spread of about 14% of the budget",
 * which is why `method` is a mandatory slot with no default.
 *
 * So FORECAST_MEASURE draws ONE method and refuses to choose silently. This draws the
 * disagreement itself, which R-001 rules is the finding: *pinning hides the divergence*. The
 * two are the singular and plural of one idea, not competitors — and a card that could only
 * ever show one of three defensible numbers a million dollars apart is exactly the "chose
 * silently on the engine's behalf" failure its own header refuses.
 *
 * ── WHY NOT THE FOUR THAT WERE CHECKED, AND THE FIFTH THAT WAS NOT ────────────────────────
 *
 * CONTRIBUTION_RANKING — the values DO NOT SUM. `share_of_total` would be meaningless and
 * `contribution` would contribute to nothing. Same refusal that ruled it out for rate
 * comparison.
 *
 * DELTA_SET — renders a comparison, but a delta is BEFORE and AFTER. These are simultaneous
 * alternatives, not a movement, and `direction` has no meaning: no method is an improvement on
 * another.
 *
 * MULTI_SERIES / PERIOD_SERIES — no period index. Methods are not points in time.
 *
 * MATRIX_GRID IS THE CLOSEST FIT AND IT IS STILL WRONG, which is worth writing down because
 * "nothing fits" is a weaker claim than "the nearest thing fits and fails". Methods × {EAC,
 * VAC, ETC} is structurally a matrix and it would draw every figure correctly. It cannot carry
 * the FINDING: a spread spans rows, and a matrix renders cells. It would publish nine numbers
 * and leave the reader to subtract two of them — which is precisely what R-001 refuses, and
 * the same failure as a ranking that drew grey bars under a legend of colours that never
 * appeared. A card that draws everything and says nothing is the shape that gets scored as a
 * pass. `formula` and `unavailable_reason` are also ROW facts, and a matrix has nowhere to put
 * a per-row annotation without turning it into a tenth cell.
 *
 * ── THE SPREAD IS RENDERED, NEVER DERIVED ─────────────────────────────────────────────────
 *
 * The producer computes `spread` and `spread_percent_of_bac`. This card must not subtract two
 * figures to get them, and the reason is not style: the producer's money is FLOAT here (Engine
 * F's finance convention, unlike the cost package's exact-decimal strings). Two places
 * subtracting floats is two places to disagree, and the second one would disagree in the last
 * digits of a number the reader is being asked to treat as the answer.
 *
 * THAT IS ALSO THE ANSWER TO WHETHER FLOAT IS ACCEPTABLE HERE. It is — on the condition this
 * clause enforces. A card that only DISPLAYS producer-computed figures never accumulates
 * float error; a card that computes does, and then exact-decimal becomes a correctness question
 * rather than a convention. Changing Engine F's finance convention for one verb is a larger
 * decision than this card, and it does not need it.
 *
 * ── AN UNDEFINED METHOD KEEPS ITS ROW ─────────────────────────────────────────────────────
 *
 * Two of the three formulas divide by an index and can be undefined; one projects no index and
 * always answers. A blank row carries `value: null` and an `unavailable_reason`.
 *
 * DROPPING IT WOULD TURN A COMPARISON OF THREE INTO A COMPARISON OF TWO WITHOUT APPEARING TO.
 * A quietly shorter panel is the specific failure this verb exists to prevent — the reader
 * cannot see the absence of a row they were never shown, and the remaining two would look like
 * the whole comparison. `methods_compared` and `methods_answered` are what let the card say so
 * rather than imply a completeness it does not have.
 *
 * ── `formula` IS HALF THE ANSWER ──────────────────────────────────────────────────────────
 *
 * Three figures with no formulas are three unattributed numbers. The formula is what makes a
 * number interpretable and what lets a reader see WHY two methods diverge — this one divides
 * by CPI, that one by CPI×SPI. Absent, the row is a bare assertion, so it is refused per row
 * the same way FORECAST_MEASURE refuses a method-less number.
 */

/** Envelope facts — stated ONCE, never per row. See the header's note on self-disagreement. */
export const COMPETING_MEASURES_ENVELOPE_FIELDS = [
  "spread",
  "spread_percent_of_bac",
  "lowest_value",
  "highest_value",
  "methods_compared",
  "methods_answered",
  "all_methods_answered",
  "reference_value",
  "value_unit",
  "scope_label",
] as const;

export const COMPETING_MEASURES_ROW_REQUIREMENTS = {
  /** Fewer than this is not a comparison. One method is a FORECAST_MEASURE. */
  minRows: 2,
  /** Every row names its method. An unnamed figure cannot be compared to anything. */
  requiresMethodName: true,
  /**
   * A ROW CARRIES A FIGURE OR A REASON — never neither. A blank row with no explanation is the
   * state the design forbids: the reader sees a method that reported nothing and cannot tell
   * whether it was undefined, errored, or simply lost.
   */
  requiresValueOrReason: true,
  /** The producer computes the spread. Two places subtracting is two places to disagree. */
  spreadIsUpstream: true,
} as const;

export const COMPETING_MEASURES_REFUSAL_REASONS = [
  "no methods recorded",
  "only one method recorded — a comparison needs something to compare",
  "method is missing its name",
  "method carries neither a figure nor a reason",
  "method carries no formula — the figure would be unattributed",
] as const;

export type CompetingMeasuresRefusal = (typeof COMPETING_MEASURES_REFUSAL_REASONS)[number];

export interface CompetingMeasureRow {
  /** The named method. Structural — no domain vocabulary in this contract. */
  method: string;
  /** What the method computes, verbatim. Half the answer; see the header. */
  formula: string;
  /** The figure, or null when this method could not answer. */
  value: number | null;
  /** Why it could not. Required exactly when `value` is null. */
  unavailable_reason?: string | null;
  /** Further producer-computed figures for this method, rendered and never derived. */
  secondary?: { label: string; value: number | null }[];
}

export const COMPETING_MEASURES_CONTRACT = {
  archetype: "COMPETING_MEASURES",
  component: "CompetingMeasures",
  layout: "rows",
  /**
   * FALSE. A comparison of estimating methods against a fixed budget is a computation over
   * recorded figures, not a function of moving plan state — re-evaluating it returns the same
   * three numbers. ADR-0042 Ruling 9's discriminant.
   */
  recomputes: false,
  fields: {
    /**
     * `rows`, NOT `methods`, and the rename is a defect repair rather than a preference.
     *
     * Every other planning archetype in this repo carries its list as `rows`, and the
     * projector's passthrough for this verb registers `("rows", ...)`. This contract had
     * invented `methods` — so the payload would have arrived with `rows`, the component would
     * have read `methods`, found nothing, and refused with "no methods recorded" for a payload
     * carrying three good figures.
     *
     * That is the SECOND hop of the same two-hop seam that produced the `eac`/`value` defect
     * an hour ago, found the same way and still live after the first was fixed. Aligned rather
     * than aliased: a component prop that differs from the payload key is the seam itself, and
     * tolerating a name no producer sends would only hide the next one.
     */
    rows: { encoding: "array", parsesTo: "array-of-objects", required: true },
    /** The spread between the highest and lowest answering method. RENDERED, never derived. */
    spread: { type: "number", required: false },
    /** The spread as a fraction of the reference quantity — the finding, without arithmetic. */
    spread_percent_of_bac: { type: "number", required: false },
    lowest_value: { type: "number", required: false },
    highest_value: { type: "number", required: false },
    /** How many methods were asked, and how many answered. The absence-is-visible pair. */
    methods_compared: { type: "number", required: false },
    methods_answered: { type: "number", required: false },
    all_methods_answered: { type: "boolean", required: false },
    /** What the spread is a percentage OF. Named generically; the first consumer's is a budget. */
    reference_value: { type: "number", required: false },
    value_unit: { type: "string", required: false },
    scope_label: { type: "string", required: false },
  },
  refusalReasons: COMPETING_MEASURES_REFUSAL_REASONS,
} as const;

export type CompetingMeasuresContract = typeof COMPETING_MEASURES_CONTRACT;

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/**
 * THE ONE PLACE THE FIRST CONSUMER'S VOCABULARY APPEARS.
 *
 * The archetype is structural — three inflation indices and three sizing techniques want this
 * card, and none of them have an "eac". The producer's first consumer is finance and sends
 * `eac`, `vac`, `etc`, `lowest_eac`, `highest_eac`.
 *
 * BOTH ARE READ, structural preferred, and the domain name is NOT silently accepted — the same
 * ruling as `canvas_type`: a quietly-honoured alias is indistinguishable from a name that is
 * the standard, so the producer never learns which one to send and the day it is dropped the
 * card stops drawing for no visible reason.
 *
 * This is NOT the translation layer FORECAST_MEASURE refuses. That contract reads `bac`,
 * `cpi`, `spi` verbatim because they are IPMDAR terms — a published standard an analyst
 * types and a program system exports. `lowest_eac` is a derived summary name, not a standard,
 * and a second consumer would need `lowest_spi` for the identical structural fact.
 */
const DOMAIN_ALIASES: Record<string, string> = {
  value: "eac",
  lowest_value: "lowest_eac",
  highest_value: "highest_eac",
};

const notedAliases = new Set<string>();

/** Read a structural field, falling back to the first consumer's name, and say when it did. */
export function readField(src: Record<string, unknown>, structural: string): unknown {
  if (src[structural] !== undefined) return src[structural];
  const alias = DOMAIN_ALIASES[structural];
  if (!alias || src[alias] === undefined) return undefined;
  if (!notedAliases.has(structural)) {
    notedAliases.add(structural);
    // eslint-disable-next-line no-console
    console.warn(
      "[COMPETING_MEASURES] read `" +
        alias +
        "` for `" +
        structural +
        "` — the archetype is structural and three inflation indices want this card too. The " +
        "domain name is honoured and is NOT the standard; a silently-accepted alias is " +
        "indistinguishable from the name a producer should be sending.",
    );
  }
  return src[alias];
}

/**
 * Normalise a producer row into the structural shape.
 *
 * `vac` and `etc` become `secondary` entries because they are further producer-computed
 * figures for the same method — rendered, never derived, exactly like the primary. They are
 * NOT promoted to their own columns: that would make this a matrix, which is the archetype the
 * header explains this one is not.
 */
export function normaliseMeasureRow(raw: Record<string, unknown>): Record<string, unknown> {
  const value = readField(raw, "value");
  const secondary = Array.isArray(raw.secondary)
    ? raw.secondary
    : [
        ...(raw.vac !== undefined ? [{ label: "VAC", value: raw.vac }] : []),
        ...(raw.etc !== undefined ? [{ label: "ETC", value: raw.etc }] : []),
      ];
  return { ...raw, value, secondary: secondary.length > 0 ? secondary : undefined };
}

/**
 * Accept or refuse the rows, by the requirements above.
 *
 * A row is refused per-row rather than the card degrading, because every one of these absences
 * makes a figure unreadable rather than merely less rich — an unnamed method cannot be
 * compared, an unattributed number cannot be interpreted, and a silent blank cannot be
 * distinguished from a lost one.
 */
export function validateCompetingMeasures(
  rows: unknown,
):
  | { kind: "ok"; rows: CompetingMeasureRow[] }
  | { kind: "empty"; reason: CompetingMeasuresRefusal } {
  if (!Array.isArray(rows) || rows.length === 0) {
    return { kind: "empty", reason: "no methods recorded" };
  }
  const objs = rows.filter(isRecord).map(normaliseMeasureRow);
  if (objs.length !== rows.length) {
    return { kind: "empty", reason: "method is missing its name" };
  }
  if (objs.some((r) => typeof r.method !== "string" || !r.method.trim())) {
    return { kind: "empty", reason: "method is missing its name" };
  }
  if (rows.length < COMPETING_MEASURES_ROW_REQUIREMENTS.minRows) {
    return {
      kind: "empty",
      reason: "only one method recorded — a comparison needs something to compare",
    };
  }
  if (objs.some((r) => typeof r.formula !== "string" || !r.formula.trim())) {
    return { kind: "empty", reason: "method carries no formula — the figure would be unattributed" };
  }
  // NEITHER A FIGURE NOR A REASON is the forbidden state. A finite number counts; so does a
  // non-empty reason. A row with both is fine — the producer may explain a figure it doubts.
  const blank = objs.some((r) => {
    const hasValue = typeof r.value === "number" && Number.isFinite(r.value);
    const hasReason =
      typeof r.unavailable_reason === "string" && r.unavailable_reason.trim().length > 0;
    return !hasValue && !hasReason;
  });
  if (blank) {
    return { kind: "empty", reason: "method carries neither a figure nor a reason" };
  }
  return { kind: "ok", rows: objs as unknown as CompetingMeasureRow[] };
}
