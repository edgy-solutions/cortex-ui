/**
 * The row-conversion seal — leg B. PLACED by doc-tools/lane/7f, 2026-10-21.
 * Not committed by me: this tree's lane owns its commits.
 *
 * ARCHITECT, 2026-10-21, item 3: *"Seal: one fixture row through the converter,
 * drawn by cortex's reader in both shapes, lands on the same cell."*
 *
 * doc-tools converted the review route's row geometry to page fractions at
 * `d9e6118`, dropping `page_dims` in the SAME commit (items 1 and 2 of that
 * packet). The seal is that the conversion is invisible to this reader: the
 * same cell, before and after.
 *
 * WHY THE SEAL NEEDED TWO LEGS. The converter is Python and this reader is
 * TypeScript, so neither suite can run both halves. doc-tools' leg A
 * (`tests/test_row_fraction_seal.py`) transcribes this reader's rule and runs
 * on every commit there; this file runs the REAL reader. The numbers below are
 * NOT re-derived here — they are the committed fixture
 * (doc-tools `tests/fixtures/sustainment/row_fraction_seal.json`), produced BY
 * their converter, so the two legs cannot quietly diverge by each computing
 * its own expectation. If the legs ever disagree, THIS one is the authority.
 *
 * `OLD_REF` is the reference, not merely the "before": it is what the deployed
 * doc-tools image still writes, and what every already-stored row renders as.
 * Nothing is being rewritten, so both forms stay live for the foreseeable
 * future — which is the whole reason `readEvidence` discriminates them.
 */
import { describe, expect, it } from "vitest";

import { scaleBox, type PageDims } from "./bboxScale";
import { isFractionBox } from "./evidenceRef";
import { readExtraction } from "./promotionReview";

/** 200-DPI US-letter, the space doc-tools ships pixel boxes in. */
const PAGE_DIMS: PageDims = { width: 1700, height: 2200 };

/** What the DEPLOYED producer writes: a parts-table cell in layout pixels. */
const OLD_REF = {
  page: 3,
  bbox: [223, 917, 661, 953],
  page_dims: PAGE_DIMS,
  units: "px",
};

/**
 * What `d9e6118` writes. Page fractions, and NO `page_dims` key — omitted, not
 * nulled, because this reader switches on `Object.hasOwn`. Every edge of the
 * fixture divides inexactly on purpose, so the seal covers their rounding
 * (6 decimal places) and not just exact arithmetic.
 */
const NEW_REF = {
  page: 3,
  bbox: [0.131176, 0.416818, 0.388824, 0.433182],
};

/** Their red test renders at two zooms; this one adds a non-integer ratio. */
const RENDER_SIZES = [
  { name: "half", width: 850, height: 1100 },
  { name: "non-integer zoom", width: 1024, height: 1325 },
  { name: "full", width: 1700, height: 2200 },
];

/**
 * A fraction rounded to 6 places carries at most half a unit in the last
 * place; a width is a difference of two, so twice that. Scaled to the rendered
 * page, that is the worst drift the conversion can introduce — ~1e-3 px at
 * full size, three orders below the one-pixel line where an outline could
 * visibly leave the text.
 */
const MAX_FRACTION_ERROR = 0.5e-6;

/** The served review body, reduced to the one row the seal needs. */
function body(ref: unknown) {
  return { rows: [{ mpn: "MC33063ADR2G", row_index: 0, evidence_ref: ref }] };
}

/** Read a served body the way the card does, and place the box. */
function draw(ref: unknown, rendered: { width: number; height: number }) {
  const extraction = readExtraction(body(ref));
  expect(extraction, "readExtraction refused the body").not.toBeNull();
  const evidence = extraction!.rows[0].evidence;
  expect(evidence.state, `this reader refused the ref: ${JSON.stringify(ref)}`).toBe("ok");
  if (evidence.state !== "ok") throw new Error("unreachable");
  const { bbox, page_dims } = evidence.ref;
  expect(bbox, "this ref carries no box to draw").not.toBeNull();
  return scaleBox(bbox!, page_dims, rendered);
}

describe("the row-fraction conversion is invisible to this reader", () => {
  for (const rendered of RENDER_SIZES) {
    it(`lands on the same cell at ${rendered.name} (${rendered.width}x${rendered.height})`, () => {
      const before = draw(OLD_REF, rendered);
      const after = draw(NEW_REF, rendered);

      const slack = MAX_FRACTION_ERROR * Math.max(rendered.width, rendered.height);
      for (const key of ["left", "top", "width", "height"] as const) {
        // A width is a difference of two rounded fractions, so twice the slack.
        const tol = slack * (key === "width" || key === "height" ? 2 : 1);
        expect(
          Math.abs(before[key] - after[key]),
          `${key}: ${before[key]} -> ${after[key]}`,
        ).toBeLessThanOrEqual(tol);
      }
    });
  }

  it("drifts sub-pixel, and the bound is stated rather than merely met", () => {
    const rendered = { width: 1700, height: 2200 };
    const before = draw(OLD_REF, rendered);
    const after = draw(NEW_REF, rendered);
    const worst = Math.max(
      ...(["left", "top", "width", "height"] as const).map((k) =>
        Math.abs(before[k] - after[k]),
      ),
    );
    expect(worst).toBeLessThan(0.01);
  });

  it("accepts the converted box as a fraction box", () => {
    // A refusal here is not local: it drops the whole list, and the producer
    // sees no error at all.
    expect(isFractionBox(NEW_REF.bbox)).toBe(true);
  });

  it("reads a nulled page_dims as the PIXEL form, so omitting it is the signal", () => {
    // doc-tools omits the key. This pins why: a `page_dims: null` takes the
    // pixel branch and is refused, which reaches a steward as a card with no
    // outline and nothing logged anywhere.
    const nulled = { ...NEW_REF, page_dims: null };
    const extraction = readExtraction(body(nulled));
    expect(extraction!.rows[0].evidence.state).toBe("malformed");
  });

  it("draws a corner speck if the box is converted and the dims are KEPT", () => {
    // Cortex's own hazard (a3cf4d1 packet, section 2), and the reason the two
    // halves are one commit upstream: converting the box while leaving the
    // dims behind is WORSE than converting neither, because the result is
    // well-formed and silently wrong.
    const halfConverted = { ...NEW_REF, page_dims: PAGE_DIMS };
    const speck = draw(halfConverted, { width: 1700, height: 2200 });
    expect(speck.width).toBeLessThan(1);
    expect(speck.height).toBeLessThan(1);
    expect(speck.left).toBeLessThan(1);
    expect(speck.top).toBeLessThan(1);
  });
});
