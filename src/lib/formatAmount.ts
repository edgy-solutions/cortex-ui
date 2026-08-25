/**
 * Compact amount formatting, shared by every surface that must show a quantity in a small space.
 *
 * Lifted out of ChartWidget when a SECOND consumer appeared (ShortfallGrid). Two copies of a
 * formatting rule is a defect in its own right: the copies agree on the day they are written and
 * diverge on the day one of them is fixed.
 *
 * The unit is READ, never assumed. `value_unit` is an optional contract field carrying an
 * ISO-4217 code or a bare unit token; when a payload declares one, the surface says so, and when
 * it does not, the surface reports magnitude only. Printing "$" because a number looks like money
 * would be asserting a unit the answer never sent — the same defect as a card captioned with an
 * engine that did not produce it. An unrecognised token renders as magnitude rather than being
 * pasted onto the value: an unknown unit is a reason to say less, not to invent a notation.
 */
const CURRENCY_SYMBOLS: Record<string, string> = {
  USD: "$",
  EUR: "€",
  GBP: "£",
  JPY: "¥",
};

export function formatAmount(v: number | string, unit?: string): string {
  // An empty/blank string coerces to 0, which would print a ZERO the payload never sent —
  // a fabricated value is worse than a blank cell. Echo it instead.
  if (typeof v === "string" && v.trim() === "") return v;
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n)) return String(v);
  const abs = Math.abs(n);
  const symbol = unit ? (CURRENCY_SYMBOLS[unit.toUpperCase()] ?? "") : "";
  // The symbol goes INSIDE the sign: -$1.5M, not $-1.5M. Where an amount can be negative the
  // sign carries the meaning, so it stays where a reader looks for it.
  const withUnit = (body: string) => (n < 0 ? `-${symbol}${body.slice(1)}` : `${symbol}${body}`);
  // Trim a trailing ".0" so 1.0M reads 1M, but keep 1.5M.
  const compact = (scaled: number, suffix: string) =>
    `${scaled.toFixed(1).replace(/\.0$/, "")}${suffix}`;
  if (abs >= 1e9) return withUnit(compact(n / 1e9, "B"));
  if (abs >= 1e6) return withUnit(compact(n / 1e6, "M"));
  if (abs >= 1e3) return withUnit(compact(n / 1e3, "K"));
  // Below 1000 the raw value already fits, and rounding it would destroy precision the reader
  // can still use.
  return withUnit(String(n));
}
