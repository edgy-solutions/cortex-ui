/**
 * How tall a card's content actually wants to be.
 *
 * A grid renders every row it was given, and `StageCard`'s panel scrolls rather than clips —
 * so nothing is lost, and that is exactly the problem. A four-subject grid in a card sized for
 * three shows three rows, a scrollbar nobody notices on a projector, and a period column whose
 * only cells belong to the rows below the fold. That column reads as EMPTY DATA when it is
 * really a hidden row, which is a wrong conclusion the card invited.
 *
 * The gantt already solved this for itself — its height is derived from row count precisely
 * because a fixed 420px "clipped a 17-row tree instead of scrolling it, so the plan simply
 * appeared to stop". This is that rule, applied to the archetypes that did not get it.
 *
 * ── WHY IT RETURNS NULL RATHER THAN A GUESS ──────────────────────────────────────────────
 *
 * An archetype this does not recognise gets `null`, and the caller keeps its default. A
 * plausible number computed from an unknown shape would size cards confidently and wrongly,
 * and the failure would look like a layout bug rather than a missing case.
 *
 * ── THE NUMBERS ARE MEASURED, NOT CHOSEN, AND THEY ARE A DEPENDENCY ──────────────────────
 *
 * They come from the components' own markup: a grid row is `py-3` plus two lines of text, the
 * header carries a title and a column head, the detail line sits under the table. If that
 * markup changes these are wrong and nothing fails — the same standing weakness as the 440
 * that `stageConstants` reserves for a chart, and recorded for the same reason.
 */

const GRID_ARCHETYPES = new Set(["THRESHOLD_GRID", "SHORTFALL_GRID", "MATRIX_GRID"]);

/** Card chrome: eyebrow, the component's own title block, and the footer. */
const CHROME = 150;
/** One grid row: `py-3` plus a value line and its `/ target` line. */
const GRID_ROW = 58;
/** The column header row above the body. */
const GRID_HEAD = 34;
/** One gantt row, matching what IntervalTimeline already assumes for itself. */
const GANTT_ROW = 30;

function rowCount(c: Record<string, unknown>): number {
  const rows = c.rows;
  if (!Array.isArray(rows)) return 0;
  // A GRID's rows are CELLS, not lines — the visible row count is the number of distinct
  // subjects, which is what the component derives its own axis from. Counting cells would
  // size a 3×6 grid as though it had eighteen rows.
  const subjects = new Set<string>();
  for (const r of rows) {
    if (typeof r === "object" && r !== null) {
      const id = (r as Record<string, unknown>).subject_id;
      if (typeof id === "string") subjects.add(id);
    }
  }
  return subjects.size > 0 ? subjects.size : rows.length;
}

/**
 * The content height an answer wants, or null when this does not know the archetype.
 *
 * Reads the FIRST component, which is the one a card draws.
 */
export function naturalContentHeight(components: unknown): number | null {
  if (!Array.isArray(components) || components.length === 0) return null;
  const c = components[0];
  if (typeof c !== "object" || c === null) return null;
  const comp = c as Record<string, unknown>;
  const archetype = typeof comp.archetype === "string" ? comp.archetype : "";

  if (GRID_ARCHETYPES.has(archetype)) {
    const n = rowCount(comp);
    if (n <= 0) return null;
    return CHROME + GRID_HEAD + n * GRID_ROW;
  }

  if (archetype === "INTERVAL_TIMELINE") {
    const rows = Array.isArray(comp.rows) ? comp.rows.length : 0;
    if (rows <= 0) return null;
    // Its own body already scrolls past a cap; this only asks the CARD to be a reasonable size
    // for it, not to grow without bound for a hundred-row plan.
    return CHROME + Math.min(rows, 14) * GANTT_ROW + GRID_HEAD;
  }

  // PERIOD_SERIES and anything chart-shaped: a fixed-height chart, already reserved for by the
  // template's own constant. Nothing to add here, and saying so beats guessing.
  return null;
}

/** The tallest content among a set of answers, or null when none of them is known. */
export function tallestContentHeight(componentsList: unknown[]): number | null {
  let max: number | null = null;
  for (const components of componentsList) {
    const h = naturalContentHeight(components);
    if (h !== null && (max === null || h > max)) max = h;
  }
  return max;
}
