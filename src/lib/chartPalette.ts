/**
 * ONE PALETTE, because three of them is why the board does not look like one product.
 *
 * Before this file the canvas drew from three unrelated sources: the app's own accent
 * (`#2dd4bf`), a set of hexes `PeriodSeries` picked for itself (`#22d3ee`, `#38bdf8`,
 * `#fb7185`), and — the loudest — the SVAR gantt's VENDOR theme, whose every rule reads
 * `var(--wx-*)` and which had never been told what this application looks like. Its bars were
 * `#448aff` blue and its summary rows a green of its own choosing. Nothing was wrong with any
 * one card; the board read as three products sitting next to each other.
 *
 * ── WHY TOKENS AND NOT A THEME OBJECT ────────────────────────────────────────────────────
 *
 * These are plain strings because their consumers cannot agree on a mechanism: Recharts wants
 * a `fill` prop, the gantt wants CSS custom properties, and the grids want Tailwind-adjacent
 * inline styles. A theme abstraction would have to satisfy all three and would end up being
 * three adapters around a list of colours. The list is the honest shape.
 *
 * ── THE MEANINGS ARE THE POINT, NOT THE HEXES ────────────────────────────────────────────
 *
 * Named by ROLE. `OVER` is not "the pink one" — it is the colour a value wears when it has
 * crossed a line the payload declared, and it is the same colour on a bar, a grid cell and a
 * gantt bar because it means the same thing in all three. A reader who learns it once on the
 * cost curve reads it correctly on the schedule without being taught twice.
 */

/** The product's accent. Everything measured-and-fine is this. */
export const ACCENT = "#2dd4bf";

/**
 * The accent one step back, for the second series in a stack.
 *
 * Deliberately a DARKER TEAL rather than a different hue. The previous stack paired cyan with
 * sky blue, two hues that say "these are different kinds of thing" — but capex and expense are
 * both spend, and the stack is one quantity split. Same hue, two depths, says that.
 */
export const ACCENT_DEEP = "#0d9488";

/** Crossed a declared line. Breach, over-cap, over-threshold — one colour, every surface. */
export const OVER = "#fb7185";

/** The line itself: a governed cap or threshold, never a value. */
export const LIMIT = "#fbbf24";

/** Axis labels, tick text, anything that is furniture rather than data. */
export const MUTED = "#94a3b8";

/** Grid lines and cell borders — present enough to align by, quiet enough to ignore. */
export const GRID_LINE = "rgba(148,163,184,0.15)";

/** Panel and header backgrounds inside a card, matching the card's own glass. */
export const SURFACE = "#0b1220";
export const SURFACE_ALT = "#111c2e";

/** Hairlines between rows and columns. */
export const BORDER = "rgba(148,163,184,0.18)";

/**
 * The SVAR gantt's theme variables, mapped onto the tokens above.
 *
 * Applied as an inline `style` on the element wrapping `<WillowDark>`: every SVAR rule resolves
 * its colour through `var(--wx-…)`, so redefining the variables on an ancestor restyles the
 * whole component without overriding a single selector. That matters — selector overrides
 * against a vendor stylesheet break silently on the vendor's next release, whereas a variable
 * it stops reading simply has no effect and the vendor default shows through, which is visible.
 *
 * SUMMARY ROWS ARE DELIBERATELY DIMMER THAN LEAVES. A summary bar spans its children, so it is
 * the widest thing on the chart; painting it at full accent makes the roll-up shout and the
 * actual work whisper. The leaves carry the accent and the summaries recede behind them.
 *
 * Typed as a CSS-variable record because React's CSSProperties does not admit custom properties.
 */
export const GANTT_THEME_VARS: Record<string, string> = {
  "--wx-color-primary": ACCENT,
  "--wx-background": SURFACE,
  "--wx-background-alt": SURFACE_ALT,
  "--wx-border": `1px solid ${BORDER}`,
  "--wx-color-font": "#e2e8f0",
  "--wx-color-secondary-font": MUTED,

  // Leaves — the real work, at full accent.
  "--wx-gantt-task-color": ACCENT,
  "--wx-gantt-task-fill-color": ACCENT,
  "--wx-gantt-task-border-color": ACCENT,
  "--wx-gantt-task-border": `1px solid ${ACCENT}`,
  "--wx-gantt-task-font-color": "#04211d",

  // Summaries — the roll-up, one step back so it frames rather than competes.
  "--wx-gantt-summary-color": ACCENT_DEEP,
  "--wx-gantt-summary-fill-color": ACCENT_DEEP,
  "--wx-gantt-summary-border-color": ACCENT_DEEP,
  "--wx-gantt-summary-border": `1px solid ${ACCENT_DEEP}`,
  "--wx-gantt-summary-font-color": "#d8f5ef",

  // Critical path uses the SAME breach colour the charts and grids use. A reader who learned
  // it on the cost curve does not have to learn it again here.
  "--wx-gantt-critical-color": OVER,
  "--wx-gantt-task-critical-color": OVER,
  "--wx-gantt-task-critical-fill-color": OVER,
  "--wx-gantt-summary-critical-color": OVER,
  "--wx-gantt-summary-critical-fill-color": OVER,
  "--wx-gantt-link-critical-color": OVER,

  "--wx-gantt-marker-color": LIMIT,
  "--wx-gantt-marker-font-color": "#1c1408",
  "--wx-gantt-link-color": MUTED,
  "--wx-gantt-icon-color": MUTED,
  "--wx-gantt-border-color": BORDER,
  "--wx-gantt-holiday-background": "rgba(148,163,184,0.06)",

  // The left table and the timescale are furniture: legible, and quiet.
  "--wx-table-header-background": SURFACE_ALT,
  "--wx-grid-header-font-color": MUTED,
  "--wx-timescale-font-color": MUTED,
  "--wx-table-select-background": "rgba(45,212,191,0.10)",
};
