/**
 * CI tripwire for the parts-table split. The REAL proof is e2e/groupedReviewTableLayout.spec.ts, run by hand in
 * Chromium (jsdom cannot measure layout and CI does not run Playwright); this only pins the class names that
 * make it pass: the card is a container, and the table/pane split keys on the CARD, never the viewport.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render } from "@testing-library/react";

vi.mock("@/api/client", async (orig) => ({
  ...(await orig<typeof import("@/api/client")>()),
  fetchNoticeProvenance: vi.fn().mockResolvedValue({ notice_id: "N", page_image_url: "", source: "test", items: [] }),
}));
vi.mock("../mesh/FederatedImage", () => ({ FederatedImage: () => null }));
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

import { GroupedReviewTable } from "./GroupedReviewTable";
import type { ReviewBatch } from "./types";

afterEach(cleanup);

const HINT = "The parts table is clipped when the split is viewport-keyed or the track is narrower than the table. The real proof is e2e/groupedReviewTableLayout.spec.ts (Chromium, by hand).";

describe("parts table split keys on the card, not the viewport", () => {
  it("root is @container; the body grid is @5xl max-content; no viewport grid-cols", () => {
    const batch = {
      batch_id: "layout-1",
      notice_id: "N",
      notice_type: "PCN",
      notice_fingerprint: "fp",
      approver: "me",
      items: [{ mpn: "M1", proposed_disposition: null, needs_review: true }],
    } as unknown as ReviewBatch;
    const { container } = render(<GroupedReviewTable batch={batch} />);
    const root = container.querySelector(".glass-panel") as HTMLElement;
    expect(root.className, `root must carry @container. ${HINT}`).toContain("@container");
    const grid = container.querySelector("table")!.closest("div.overflow-x-auto")!.parentElement as HTMLElement;
    expect(grid.className, `grid must split at @5xl with a max-content table track. ${HINT}`).toContain("@5xl:grid-cols-[max-content");
    expect(grid.className, `no viewport md:grid-cols. ${HINT}`).not.toMatch(/(^|\s)md:grid-cols/);
    expect(grid.className, `no viewport lg:grid-cols. ${HINT}`).not.toMatch(/(^|\s)lg:grid-cols/);
  });
});
