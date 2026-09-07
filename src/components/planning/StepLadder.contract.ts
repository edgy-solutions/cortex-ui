/**
 * STEP_LADDER — a price built up by striking factors in order.
 *
 * The first producer is `cost_price_composition` (`cost:PriceComposition`), and the archetype
 * is the GATE on that card drawing at all: it is deliberately unbound on the producer's side
 * until this exists, because unbound beats mis-bound — a mis-binding renders something
 * plausible and wrong.
 *
 * ── WHY NOT CONTRIBUTION_RANKING, WHICH IT SUPERFICIALLY RESEMBLES ────────────────────────
 *
 * Two fields have no slot there, and they are the two that make this a walk:
 *
 *   `basis` IS WHAT MAKES THE ARITHMETIC CHECKABLE. Overhead's basis is not the previous
 *   running total — it is labour-plus-fringe, a different subtotal — and a reader verifying
 *   that overhead was struck on the right figure CANNOT RECOVER IT from the amounts. Drop the
 *   column and the walk becomes six numbers a reader must take on faith.
 *
 *   `running_total` is what makes the sequence readable as one movement rather than as six
 *   independent figures.
 *
 * ── ORDER IS THE ANSWER, AND IT IS NOT A RANKING ──────────────────────────────────────────
 *
 * The steps arrive in STRIKE ORDER: the sequence in which factors were applied, each one's
 * basis derived from earlier results. Sorting by magnitude would assert that Profit outranks
 * Base cost, which is not a statement anyone made — and it would break the walk, because
 * step N's basis refers to step N−1's result. NOTHING HERE SORTS.
 *
 * ── MONEY IS AN EXACT DECIMAL STRING, AND STAYS ONE ───────────────────────────────────────
 *
 * Every figure arrives as a string and is never parsed into a number. The package's whole claim
 * is that a recipient can reproduce every figure; a float in the middle of that is a divergence
 * with no divergence banner, and 0.1 + 0.2 is the reason. Grouping for readability is done by
 * STRING SURGERY — see `groupDigits` — so no digit can be lost to a rounding step that a
 * formatter performs on a reader's behalf.
 *
 * ── TWO NULLS THAT MEAN "NOT APPLICABLE", NOT "ZERO" ──────────────────────────────────────
 *
 * The seed step has no `rate` and no `basis`: it is an amount, not a factor struck on
 * something. A `0` in either column would read as a measurement that came out empty, which is
 * a different and false claim. Both render blank.
 */

export const STEP_LADDER_REFUSAL_REASONS = [
  "no steps recorded",
  "a step is missing its name",
  "a step carries no amount",
  "the walk does not reconcile",
] as const;
export type StepLadderRefusal = (typeof STEP_LADDER_REFUSAL_REASONS)[number];

export const STEP_LADDER_CONTRACT = {
  archetype: "STEP_LADDER",
  component: "StepLadder",
  layout: "full-width",
  recomputes: false,
  fields: {
    /** The build-up, IN STRIKE ORDER. Never sorted, never reordered. */
    steps: { encoding: "array", parsesTo: "array-of-objects", required: true },
    /** The reconciled total, as an exact decimal string. */
    price: { type: "string", required: false },
    /** Price per unit, exact decimal string. */
    unit_price: { type: "string", required: false },
    /** The currency, on the envelope AND on every row — see `value_unit` below. */
    value_unit: { type: "string", required: false },
    /** The producer's own report of the invariant: does the walk reconcile to `price`. */
    sums: { type: "boolean", required: false },
    /** How many units `unit_price` divides by. */
    quantity: { type: "number", required: false },
    /** The rate set this build-up was struck with — two build-ups differ by this alone. */
    rate_vintage: { type: "string", required: false },
    fiscal_year: { type: "number", required: false },
    lot: { type: "number", required: false },
  },
  /** Per step: `name`, `rate`, `basis`, `amount`, `running_total`, `value_unit`. */
  rowFields: {
    name: { type: "string", required: true },
    /** NULL on the seed step — an amount is not a factor. Renders blank, never "0". */
    rate: { type: "string", required: false },
    /** NULL on the seed step. The figure the rate was struck on; see the header. */
    basis: { type: "string", required: false },
    amount: { type: "string", required: true },
    running_total: { type: "string", required: false },
    /**
     * ON EVERY ROW, not only on the envelope, and deliberately: "dollars or thousands of
     * dollars" is the one question a cost answer must never leave to convention.
     */
    value_unit: { type: "string", required: false },
  },
  refusalReasons: STEP_LADDER_REFUSAL_REASONS,
} as const;

export type StepLadderContract = typeof STEP_LADDER_CONTRACT;

export interface LadderStep {
  name: string;
  /** Empty string means "not applicable" — the seed step. Never rendered as 0. */
  rate: string;
  basis: string;
  amount: string;
  runningTotal: string;
  valueUnit: string;
}

export interface StepLadderPayload {
  steps: LadderStep[];
  price: string;
  unitPrice: string;
  valueUnit: string;
  quantity: string;
  rateVintage: string;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/**
 * A payload figure as a string, WITHOUT parsing it.
 *
 * A number arriving where a decimal string was promised is accepted and stringified rather than
 * refused — it is the producer's mistake and the figure is still readable — but nothing here
 * ever converts a string INTO a number, which is the direction that loses digits.
 */
const money = (v: unknown): string => {
  if (typeof v === "string") return v.trim();
  if (typeof v === "number" && Number.isFinite(v)) return String(v);
  return "";
};

/**
 * Group an exact decimal string with thousands separators, WITHOUT arithmetic.
 *
 * The producer's HTML formats money grouped and padded and does it in Python, so this must
 * agree with it on every digit. Doing that through `Number` would round a long decimal on the
 * day it matters — the manifest lying by presentation — so the integer part is grouped by
 * string surgery and the fraction is copied through untouched.
 *
 * ANYTHING THAT IS NOT A PLAIN DECIMAL IS RETURNED VERBATIM. A figure this cannot parse is a
 * figure it must not rewrite.
 */
export function groupDigits(value: string): string {
  const s = (value ?? "").trim();
  if (!s) return "";
  const negative = s.startsWith("-");
  const body = negative ? s.slice(1) : s;
  if (!/^\d+(\.\d+)?$/.test(body)) return s;
  const dot = body.indexOf(".");
  const whole = dot === -1 ? body : body.slice(0, dot);
  const fraction = dot === -1 ? "" : body.slice(dot);
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return (negative ? "-" : "") + grouped + fraction;
}

/**
 * Whether two exact decimal strings denote the same figure.
 *
 * Trailing zeros in the fraction are not a difference — "20982365.26" and "20982365.260" are
 * one number — so they are trimmed before comparing. NOTHING IS ROUNDED: a figure that differs
 * in any significant digit is a difference, which is the whole point of the check.
 */
export function sameFigure(a: string, b: string): boolean {
  const norm = (v: string) => {
    const t = (v ?? "").trim();
    if (!/^-?\d+\.\d+$/.test(t)) return t;
    return t.replace(/0+$/, "").replace(/\.$/, "");
  };
  return norm(a) === norm(b);
}

export function validateStepLadder(
  comp: unknown,
): { kind: "ok"; ladder: StepLadderPayload } | { kind: "empty"; reason: StepLadderRefusal } {
  const c = isRecord(comp) ? comp : {};
  const raw = Array.isArray(c.steps) ? c.steps : [];
  if (raw.length === 0) return { kind: "empty", reason: "no steps recorded" };

  const steps: LadderStep[] = [];
  for (const r of raw) {
    if (!isRecord(r)) return { kind: "empty", reason: "a step is missing its name" };
    const name = typeof r.name === "string" ? r.name.trim() : "";
    // A NAMELESS STEP IS NOT DRAWABLE. A walk whose rows cannot be told apart is six numbers.
    if (!name) return { kind: "empty", reason: "a step is missing its name" };
    const amount = money(r.amount);
    // AND AN AMOUNTLESS ONE BREAKS THE WALK: every later basis descends from this figure.
    if (!amount) return { kind: "empty", reason: "a step carries no amount" };
    steps.push({
      name,
      rate: money(r.rate),
      basis: money(r.basis),
      amount,
      runningTotal: money(r.running_total),
      valueUnit: typeof r.value_unit === "string" ? r.value_unit.trim() : "",
    });
  }

  const price = money(c.price);
  const last = steps[steps.length - 1].runningTotal;

  // THE PRODUCER'S OWN REPORT OF THE INVARIANT. The engine refuses to emit a build-up that
  // fails it, so a card seeing `sums: false` is seeing something that should not have reached
  // it — which is exactly when a renderer must not draw a confident-looking table.
  if (c.sums === false) return { kind: "empty", reason: "the walk does not reconcile" };

  // AND THE SAME CLAIM, CHECKED. Not a second opinion about the arithmetic — no figure is
  // recomputed — but two fields of one payload disagreeing about the same number, which means
  // one of them is wrong and a reader cannot tell which.
  if (price && last && !sameFigure(price, last)) {
    return { kind: "empty", reason: "the walk does not reconcile" };
  }

  return {
    kind: "ok",
    ladder: {
      steps,
      price,
      unitPrice: money(c.unit_price),
      valueUnit: typeof c.value_unit === "string" ? c.value_unit.trim() : "",
      quantity: typeof c.quantity === "number" ? String(c.quantity) : money(c.quantity),
      rateVintage: typeof c.rate_vintage === "string" ? c.rate_vintage.trim() : "",
    },
  };
}
