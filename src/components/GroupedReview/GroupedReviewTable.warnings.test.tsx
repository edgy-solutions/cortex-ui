import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render } from "@testing-library/react";
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));
import { GroupedReviewTable } from "./GroupedReviewTable";
import type { ReviewBatch } from "./types";

afterEach(cleanup);
const batch = (w: unknown[]): ReviewBatch => ({
  batch_id: "w-1", notice_id: "N", notice_type: "PCN", notice_fingerprint: "fp", approver: "me",
  items: [{ mpn: "M1", proposed_disposition: "archive", needs_review: false }],
  extraction_warnings: w,
});

describe("GroupedReviewTable extraction warnings", () => {
  it("raw multi-line text never reaches the card; a bounded warning shows", () => {
    const { container } = render(
      <GroupedReviewTable batch={batch(["raw\nRAW_PROMPT_SENTINEL", "2 of 5 crops timed out"])} />,
    );
    expect(container.innerHTML).not.toContain("RAW_PROMPT_SENTINEL");
    expect(container.textContent).toContain("2 of 5 crops timed out");
    expect(container.textContent).toContain("Verify against the source document");
  });
});
