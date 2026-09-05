/**
 * FOUR LAYOUT DECISIONS THAT LOOK LIKE TASTE AND ARE NOT.
 *
 * Each of these was reported from a screenshot, and each has the same shape: a rule that is
 * correct for the case it was written against and wrong for a case that arrived later. None of
 * them break a test, none of them throw, and all of them are visible from across a room.
 *
 * Asserted against the source, which is this repo's existing practice for layout invariants
 * (see `StageCard.layout.test.ts`): jsdom computes no geometry, so a rendered assertion here
 * would pass on a card that is visibly broken. What CAN be pinned is the decision — and every
 * one of these regressed by someone changing a class that looked arbitrary.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

const read = (p: string) => readFileSync(path.join(__dirname, p), "utf8");
const FITBOX = read("FitBox.tsx");
const CARD = read("StageCard.tsx");
const GRID = read("../planning/ShortfallGrid.tsx");
const SERIES = read("../planning/MultiSeries.tsx");

describe("the funding grid's label column does not claim the row", () => {
  it("labels WRAP — a long one must not demand its full single-line width", () => {
    // "Research, Development, Test and Evaluation" on one line took half the card and pushed
    // the later periods off the right edge behind a scrollbar. The row-header cell is the only
    // place `whitespace-nowrap` appeared, and it was the cause.
    const labelCell = GRID.slice(GRID.indexOf("<td"), GRID.indexOf("{periods.map((p) => {"));
    expect(labelCell).toContain("{names.get(s)}");
    expect(labelCell).not.toContain("whitespace-nowrap");
  });

  it("the column shrinks to its content instead of absorbing spare width", () => {
    // The SECOND cause, and fixing only the first leaves it: in a `w-full` auto-layout table
    // this column takes whatever is going, which is the dead band between the labels and the
    // first period at full card width. Nothing was overflowing there — the column was greedy.
    expect(GRID).toMatch(/<td className="[^"]*w-\[1%\]/);
  });

  it("the width cap is on an inner block, because a `td` ignores max-width", () => {
    // `max-width` on a table cell is not honoured under auto table layout. A cap written on the
    // `td` would read as correct, test as present, and do nothing at all.
    expect(GRID).toMatch(/<span className="block max-w-\[\d+rem\]">\{names\.get\(s\)\}<\/span>/);
  });

  it("the cells still scroll rather than clip, which the fix must not have removed", () => {
    // A card sized slightly too small should still be readable. Positive control that the fix
    // narrowed the label column rather than hiding the overflow.
    expect(GRID).toContain('<div className="overflow-x-auto">');
  });
});

describe("the reference label stays inside the plot", () => {
  it("is positioned INSIDE, never in the margin", () => {
    // `position: "right"` draws it outside the plot into a 12px right margin, so "target 1.00"
    // arrived as "t.". It read fine near mid-plot because the eye fills in a half-seen label;
    // at the top of the domain there is nothing to fill in with.
    expect(SERIES).toMatch(/position:\s*"inside[A-Za-z]*Right"/);
    expect(SERIES).not.toMatch(/position:\s*"right"/);
  });

  it("the chart reserves top margin for it, since the domain includes the reference", () => {
    // A declared line can sit flush against the top edge and its label sits above the line.
    // Without the margin, moving the label inside just moves where it is clipped.
    const margin = SERIES.match(/margin=\{\{\s*top:\s*(\d+)/);
    expect(margin, "no LineChart margin found").toBeTruthy();
    expect(Number(margin![1])).toBeGreaterThanOrEqual(16);
  });

  it("and the placement is NOT chosen by comparing the reference to the data", () => {
    // The first attempt picked the side by asking whether the reference sat high or low in the
    // domain, and this file's sibling seal refused it: no comparison of a datum against the
    // reference, anywhere. "It only chooses a text anchor" is how a card starts deciding what
    // its numbers mean. One side for every case, and the top margin is what makes that safe.
    expect(SERIES).not.toMatch(/ref\.value\s*[<>]/);
  });
});

describe("the eyebrow keeps the half that disambiguates", () => {
  it("the subject can shrink — `truncate` alone does nothing to a flex child", () => {
    // A flex item will not go below its content width without `min-w-0`, so the subject span
    // never actually yielded and both halves clipped together.
    expect(CARD).toMatch(/text-\[11px\] font-mono uppercase tracking-widest truncate min-w-0/);
  });

  it("the verb shrinks LAST", () => {
    // Six cards on one program share a subject and differ only by verb. When both truncate the
    // reader loses the one word that tells them apart.
    const verb = CARD.slice(CARD.indexOf("!custom && spo.verbLabel && ("));
    expect(verb).toMatch(/ml-auto flex-shrink-0 text-\[10px\][^"]*text-neon-purple/);
  });
});

describe("every card's content starts at the same place", () => {
  it("FitBox aligns to the TOP, not the middle", () => {
    // Centering made vertical position a function of content height: a short answer floated
    // mid-card between empty bands while a tall one sat flush at the top, so two cards side by
    // side read as two different layouts.
    expect(FITBOX).toContain("flex items-start justify-center");
    expect(FITBOX).not.toContain("flex items-center justify-center");
  });

  it("and scales from the top, because the two must agree", () => {
    // `center center` scales toward the middle: the box shrinks from its centre and leaves half
    // the removed height above it, reintroducing exactly the gap the alignment removed. The
    // alignment alone looks like the fix and is half of it.
    expect(FITBOX).toContain('transformOrigin: "top center"');
    expect(FITBOX).not.toContain('transformOrigin: "center center"');
  });

  it("horizontal centring is kept, so this is a vertical decision only", () => {
    // Positive control: a blanket replace of the flex classes would fail this.
    expect(FITBOX).toContain("justify-center");
  });
});
