import { readFileSync } from "node:fs";
import path from "node:path";
/**
 * ONE PALETTE, AND A GANTT THAT READS IT.
 *
 * The board drew from three unrelated colour sources — the app accent, a set of hexes
 * `PeriodSeries` chose for itself, and the SVAR gantt's VENDOR theme, which had never been
 * told what this application looks like. Each card was fine; the board read as three products.
 *
 * The gantt half has a trap worth guarding rather than remembering: `WillowDark` must STAY.
 * It is what makes the gantt render at all — it supplies the full `--wx-*` set, and without it
 * every rule resolves to nothing and the bars are invisible against a working table. That was
 * a two-day diagnosis. The recolour therefore LAYERS on the theme and must sit INSIDE it,
 * because custom properties resolve innermost-first and the same declarations on an ancestor
 * would be silently overridden by WillowDark's own.
 *
 * Source-level because the subject is which colours are declared where. Rendering Recharts and
 * a vendor gantt in jsdom to read back computed fills would assert on jsdom's cascade, not the
 * browser's.
 */
import { describe, it, expect } from "vitest";
import { ACCENT, ACCENT_DEEP, OVER, LIMIT, GANTT_THEME_VARS } from "./chartPalette";
import { showMeasure } from "./showMeasure";

const read = (p: string) => readFileSync(path.join(__dirname, p), "utf8");
const TIMELINE = read("../components/planning/IntervalTimeline.tsx");
const SERIES = read("../components/planning/PeriodSeries.tsx");

describe("the palette is one place", () => {
  it("PeriodSeries declares NO colour of its own", () => {
    // It previously carried #22d3ee, #38bdf8, #fb7185, #f43f5e and #fbbf24 — five hexes none
    // of which was the app's accent. A literal here is how the board drifts apart again.
    const hexes = SERIES.match(/#[0-9a-fA-F]{6}/g) ?? [];
    expect(hexes).toEqual([]);
    expect(SERIES).toContain("ACCENT");
  });

  it("breach is ONE colour across bar, cell and gantt", () => {
    // A reader learns it on the cost curve and must read it correctly on the schedule without
    // being taught twice. Same token, not merely the same-looking value.
    expect(SERIES).toContain("OVER");
    expect(GANTT_THEME_VARS["--wx-gantt-task-critical-fill-color"]).toBe(OVER);
    expect(GANTT_THEME_VARS["--wx-gantt-critical-color"]).toBe(OVER);
  });

  it("summaries recede behind leaves rather than competing with them", () => {
    // A summary bar spans its children, so it is the widest thing on the chart. At full accent
    // the roll-up shouts and the actual work whispers.
    expect(GANTT_THEME_VARS["--wx-gantt-task-fill-color"]).toBe(ACCENT);
    expect(GANTT_THEME_VARS["--wx-gantt-summary-fill-color"]).toBe(ACCENT_DEEP);
    expect(ACCENT_DEEP).not.toBe(ACCENT);
  });

  it("the cap line is the LIMIT token, never a data colour", () => {
    expect(SERIES).toContain("LIMIT");
    expect(LIMIT).not.toBe(ACCENT);
    expect(LIMIT).not.toBe(OVER);
  });
});

describe("the gantt recolour cannot un-render the gantt", () => {
  it("WillowDark is STILL THERE — removing it makes the bars invisible", () => {
    // The two-day diagnosis. The stylesheet loads, the selectors match, and every value
    // resolves to nothing: a working left-hand table beside an empty chart region.
    expect(TIMELINE).toContain("WillowDark");
    expect(TIMELINE).toContain("<WillowDark>");
  });

  it("the overrides sit INSIDE the theme, or the theme wins", () => {
    // Custom properties resolve innermost-first. On an ancestor these declarations would be
    // overridden by WillowDark's own and the recolour would silently do nothing.
    const open = TIMELINE.indexOf("<WillowDark>");
    // Searched FROM the theme open tag, because the first occurrence in the file is the
    // import — which is above <WillowDark> and would make this assertion fail on correct code.
    const vars = TIMELINE.indexOf("GANTT_THEME_VARS", open);
    const close = TIMELINE.indexOf("</WillowDark>");
    expect(open).toBeGreaterThan(0); // positive control
    expect(vars).toBeGreaterThan(open);
    expect(vars).toBeLessThan(close);
  });

  it("recolours rather than forks — it redefines only colour variables", () => {
    // Everything not listed still comes from the theme. A variable the vendor stops reading
    // simply has no effect and the default shows through, which is visible; a selector override
    // against a vendor stylesheet breaks silently on their next release.
    const keys = Object.keys(GANTT_THEME_VARS);
    expect(keys.length).toBeGreaterThan(10);
    for (const k of keys) expect(k.startsWith("--wx-")).toBe(true);
    // No layout or sizing variables — those are the theme's business.
    for (const k of keys) {
      expect(k).not.toMatch(/radius|width|height|size|family|weight|offset/);
    }
  });
});

describe("showMeasure — a cell states a magnitude, not a float", () => {
  it("the defect verbatim", () => {
    expect(showMeasure(1.7999999999999998)).toBe("1.8");
  });

  it("drops a manufactured decimal place", () => {
    // A threshold is spoken as "two". `2.0` implies a measurement finer than the one taken.
    expect(showMeasure(2)).toBe("2");
    expect(showMeasure(2.0)).toBe("2");
  });

  it("says nothing rather than NaN", () => {
    expect(showMeasure(NaN)).toBe("—");
    expect(showMeasure(Infinity)).toBe("—");
  });

  it("rounds DISPLAY only — the raw value stays available to the reader", () => {
    // The colour is computed from the raw number, so rounding cannot move a cell across its
    // line. Both grids keep the exact value in the cell title and the detail line.
    const tg = read("../components/planning/ThresholdGrid.tsx");
    const mg = read("../components/planning/MatrixGrid.tsx");
    expect(tg).toContain("title={`${cell.value} of ${cell.threshold}`}");
    expect(mg).toContain("title={`${cell.level} of ${cell.target_level}`}");
    // And the ratio that drives the ramp is not built from the formatted string.
    expect(tg).toMatch(/cell\.value \/ cell\.threshold/);
  });
});
