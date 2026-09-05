import { readFileSync } from "node:fs";
import path from "node:path";
/**
 * THE CARD READS TOP-DOWN: eyebrow, answer, provenance.
 *
 * It used to read eyebrow, provenance, answer — the interpretation strip sat between the header
 * and the body, so a reader met "how the system understood you" before meeting the answer, and
 * it cost a full row of vertical in a card that was already short of it. Provenance is what you
 * look at SECOND, when you want to know how the question was read.
 *
 * Source-level because the subject is ORDER in the DOM, and an order assertion in jsdom would
 * still be an assertion about this file's structure. Ordering is also exactly the property a
 * later refactor changes without noticing.
 */
import { describe, it, expect } from "vitest";

const CARD = readFileSync(path.join(__dirname, "StageCard.tsx"), "utf8");

const iBody = CARD.indexOf('<div className="flex-1 min-h-0 overflow-hidden relative">');
const iStrip = CARD.indexOf("<InterpretationStrip artifact={artifact} />");
const iHeader = CARD.indexOf("Header: subject identifier");

describe("the answer comes before its provenance", () => {
  it("the anchors are found — positive control", () => {
    expect(iHeader).toBeGreaterThan(0);
    expect(iBody).toBeGreaterThan(iHeader);
    expect(iStrip).toBeGreaterThan(0);
  });

  it("the interpretation strip renders AFTER the body, not between header and body", () => {
    expect(iStrip).toBeGreaterThan(iBody);
  });

  it("it is still rendered exactly once — moved, not duplicated or dropped", () => {
    // A move done by copy-paste leaves two, and a card that shows its interpretation twice is
    // worse than one that shows it in the wrong place.
    expect(CARD.split("<InterpretationStrip artifact={artifact} />").length - 1).toBe(1);
  });

  it("and only on a canvas card with a real answer — unchanged from before the move", () => {
    // The gate travelled with it. A task card has no resolved intent to show, and a global
    // preview has no room for one.
    expect(CARD).toContain("const showsStrip = !task && custom && hasInterpretation(artifact)");
    expect(CARD).toContain("{showsStrip && (");
  });

  it("the question is NOT capped at half a row it does not have to share", () => {
    // THE DEFECT THIS PINS. The footer is two columns and the question was capped at 55% so it
    // could not crowd out the strip beside it. On the GLOBAL stage `custom` is false — a
    // computed arrangement passes no grip or remove handler — so the strip never drew, the
    // left column reserved half the row for nothing, and the question truncated into empty
    // space with room to spare.
    const footer = CARD.slice(iStrip);
    expect(footer).toContain('showsStrip ? "max-w-[55%]" : "min-w-0 flex-1 justify-end"');
    // The cap must be CONDITIONAL, never a constant class on the element.
    expect(footer).not.toMatch(/text-slate-500 truncate max-w-\[55%\]/);
  });

  it("and the empty column is not rendered at all when there is no strip", () => {
    // A flex child with `flex-1` claims its share whether or not it has content, so gating the
    // strip INSIDE a permanent wrapper would have left the gap exactly as it was.
    const footer = CARD.slice(iStrip);
    expect(footer).not.toMatch(/<div className="min-w-0 flex-1">\s*\{!task && custom/);
  });
});

describe("the eyebrow carries subject AND verb", () => {
  it("the verb appears in the header for a canvas card", () => {
    // Previously the verb showed only on non-canvas cards, so the workspace card's header said
    // "PORTFOLIO" and nothing about what was asked of it.
    const header = CARD.slice(iHeader, iBody);
    expect(header.length).toBeGreaterThan(200); // positive control on the slice
    expect(header).toContain("spo.verbLabel");
    expect(header).toContain("!task && custom && spo.verbLabel");
  });

  it("the question stays in the footer and is never invented", () => {
    // An absent question renders an em dash. A card that made one up would be captioning the
    // answer with a question nobody asked.
    expect(CARD).toContain('{artifact.question_text || "—"}');
  });
});
