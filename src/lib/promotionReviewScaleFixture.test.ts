/**
 * The scale fixture is what it says: 402 parts, 804 rows, boxes inside their pages, the six flagged
 * rows, and a shape the review plan can fold into runs with stragglers between them.
 */
import { describe, it, expect } from "vitest";
import { scaleFixtureExtractionBody, scaleFixturePdfBytes, scaleFixturePromotionPayload, SCALE_FIXTURE_PAGE_COUNT } from "./promotionReviewScaleFixture";
import { readExtraction } from "./promotionReview";
import { buildReviewPlan } from "./reviewRuns";

const body = scaleFixtureExtractionBody("ing-1");
const ex = readExtraction(body)!;

describe("the scale fixture", () => {
  it("has 402 distinct parts and 804 rows, and says so", () => {
    expect(ex.rows).toHaveLength(804);
    expect(new Set(ex.rows.map((r) => r.part_index)).size).toBe(402);
    expect(ex.part_count).toBe(402);
    expect(scaleFixturePromotionPayload("ing-1").part_count).toBe(402);
  });

  it("puts every evidence box inside its page, in its own units", () => {
    const pages = SCALE_FIXTURE_PAGE_COUNT;
    for (const r of ex.rows) {
      if (r.evidence.state !== "ok" || r.evidence.ref.bbox === null) continue;
      const { page, bbox, page_dims } = r.evidence.ref;
      expect(page).toBeGreaterThanOrEqual(1);
      expect(page).toBeLessThanOrEqual(pages);
      expect(bbox[0]).toBeGreaterThanOrEqual(0);
      expect(bbox[1]).toBeGreaterThanOrEqual(0);
      expect(bbox[2]).toBeLessThanOrEqual(page_dims.width);
      expect(bbox[3]).toBeLessThanOrEqual(page_dims.height);
      expect(bbox[2]).toBeGreaterThan(bbox[0]);
      expect(bbox[3]).toBeGreaterThan(bbox[1]);
    }
  });

  it("carries the six flagged rows", () => {
    const rep = ex.rows.filter((r) => r.field === "replacement_mpn");
    expect(rep.filter((r) => r.needs_review && r.review_reason)).toHaveLength(3);
    expect(rep.filter((r) => r.obtained_via === "region_preferred")).toHaveLength(2);
    expect(rep.filter((r) => r.evidence.state === "ok" && r.evidence.ref.bbox === null)).toHaveLength(1);
  });

  it("gives every part one inherited date citing page 1's one sentence", () => {
    const ltb = ex.rows.filter((r) => r.field === "ltb_date");
    expect(ltb).toHaveLength(402);
    expect(ltb.every((r) => r.obtained_via === "inherited_doc_level" && r.extracted_value === "2027-03-31")).toBe(true);
    const plan = buildReviewPlan(ex.rows, "seed");
    expect(plan.sharedFacts).toHaveLength(1);
    expect(plan.sharedFacts[0].rows).toHaveLength(402);
  });

  it("folds into at least three runs with at least ten stragglers between them", () => {
    const plan = buildReviewPlan(ex.rows, "seed");
    expect(plan.segments.filter((s) => s.kind === "run").length).toBeGreaterThanOrEqual(3);
    const stragglers = plan.units.filter((u) => u.flags.some((f) => f.kind === "straggler"));
    expect(stragglers.length).toBeGreaterThanOrEqual(10);
    expect(plan.checks.size).toBeLessThan(plan.units.length / 4);
  });

  it("builds a PDF with the pages the boxes name", () => {
    const bytes = new Uint8Array(scaleFixturePdfBytes());
    expect(String.fromCharCode(...bytes.slice(0, 8))).toBe("%PDF-1.4");
    expect(SCALE_FIXTURE_PAGE_COUNT).toBe(10);
  });
});
