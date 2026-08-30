/**
 * A measured number, shown at the precision a reader can use.
 *
 * `ThresholdGrid` printed `cell.value` raw, so a payload carrying 1.7999999999999998 — an
 * ordinary floating-point sum, not bad data — put nineteen digits in a grid cell and made the
 * card look broken beside its neighbours. `MatrixGrid` renders `cell.level` the same way and
 * had the same exposure waiting; it is the second consumer, which is why this is a module
 * rather than a helper in one file.
 *
 * ── ROUNDING HERE IS DISPLAY, NEVER DATA ─────────────────────────────────────────────────
 *
 * The exact value stays in the cell's `title` and in the detail line beneath the grid, and the
 * ratio a cell is COLOURED by is computed from the raw number, never from this string. So the
 * rounding cannot move a cell across a threshold — a 1.999 that is under its 2.0 line still
 * renders under, and still reads `2`. Which is the honest trade: the colour carries the
 * judgement, the number carries the magnitude, and only the magnitude is rounded.
 *
 * Trailing zeros are dropped so a clean 2 reads as `2` and not `2.0` — a threshold is spoken
 * as "two", and a manufactured decimal place implies a measurement finer than the one taken.
 *
 * Non-finite renders as an em dash rather than `NaN`. A cell that cannot say a number should
 * say nothing, the same rule the grids already follow for an absent cell.
 */
export function showMeasure(n: number, dp = 1): string {
  if (typeof n !== "number" || !Number.isFinite(n)) return "—";
  const f = 10 ** Math.max(0, Math.min(6, Math.trunc(dp)));
  return String(Math.round(n * f) / f);
}
