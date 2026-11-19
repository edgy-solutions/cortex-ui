import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render } from "@testing-library/react";
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));
import { GroupedReviewTable } from "./GroupedReviewTable";
import type { ReviewBatch, ReviewItem } from "./types";

afterEach(cleanup);
const batch = (items: Partial<ReviewItem>[]): ReviewBatch => ({
  batch_id: "w-1", notice_id: "N", notice_type: "PCN", notice_fingerprint: "fp", approver: "me",
  items: items.map((i, n) => ({ mpn: `M${n}`, proposed_disposition: null, needs_review: false, ...i })) as ReviewItem[],
});
const draw = (items: Partial<ReviewItem>[]) => render(<GroupedReviewTable batch={batch(items)} />).container;
const resolveBtn = (c: HTMLElement) =>
  Array.from(c.querySelectorAll("button")).find((b) => /^Resolve/.test(b.textContent ?? "")) as HTMLButtonElement;
const cands = (c: HTMLElement) => [...c.querySelectorAll("[data-review-candidate]")].map((e) => e.textContent);

describe("why a row has no proposal", () => {
  it("unclassifiable: the reason, no candidates line", () => {
    const c = draw([{ proposal_outcome: "unclassifiable", abstention_reason: "no rule matched", candidate_dispositions: [] }]);
    expect(c.querySelector("[data-review-abstention]")!.textContent).toBe("no rule matched");
    expect(c.querySelector("[data-review-candidates]")).toBeNull();
    expect(c.textContent).toContain("needs a disposition");
  });
  it("conflict with two candidates: labelled, none selected, submit still blocked", () => {
    const c = draw([{ proposal_outcome: "conflict", abstention_reason: "rules disagree", candidate_dispositions: ["archive", "dispatchLTB"] }]);
    expect(c.querySelector("[data-review-candidates]")!.textContent).toBe("candidates: Archive · Dispatch LTB".replace("Archive", cands(c)[0]!).replace("Dispatch LTB", cands(c)[1]!));
    expect(cands(c)).toHaveLength(2);
    expect(cands(c)[0]).not.toBe("archive");
    expect(c.querySelector("select")).toBeNull();
    expect(c.textContent).toContain("needs a disposition");
    expect(resolveBtn(c).disabled).toBe(true);
  });
  it("conflict with ONE candidate is still listed", () => {
    const c = draw([{ abstention_reason: "rules disagree", candidate_dispositions: ["archive"] }]);
    expect(cands(c)).toHaveLength(1);
    expect(c.querySelector("[data-review-candidate]")!.getAttribute("data-review-candidate")).toBe("archive");
  });
  it("a matched row with candidates draws nothing", () => {
    const c = draw([{ proposed_disposition: "archive", abstention_reason: "stale", candidate_dispositions: ["archive"] }]);
    expect(c.querySelector("[data-review-abstention]")).toBeNull();
    expect(c.querySelector("[data-review-candidates]")).toBeNull();
  });
  it("an old-shape row draws nothing new", () => {
    const c = draw([{ proposal_outcome: null, candidate_dispositions: [], abstention_reason: null }]);
    expect(c.querySelector("[data-review-abstention]")).toBeNull();
    expect(c.querySelector("[data-review-candidates]")).toBeNull();
    expect(c.textContent).toContain("needs a disposition");
  });
  it("a non-array candidates value is []", () => {
    for (const bad of ["archive", { 0: "archive" }, 3, null]) {
      const c = draw([{ candidate_dispositions: bad }]);
      expect(c.querySelector("[data-review-candidates]")).toBeNull();
      cleanup();
    }
  });
  it("non-string and unbounded candidates are dropped", () => {
    const c = draw([{ candidate_dispositions: [3, null, "x".repeat(161), "a\nb", "archive"] }]);
    expect(cands(c)).toHaveLength(1);
  });
  it("a multi-line reason is not drawn", () => {
    const c = draw([{ abstention_reason: "no rule\nRAW_SENTINEL" }]);
    expect(c.querySelector("[data-review-abstention]")).toBeNull();
    expect(c.innerHTML).not.toContain("RAW_SENTINEL");
  });
  it("an unknown disposition string is drawn raw", () => {
    const c = draw([{ candidate_dispositions: ["scrap_it"] }]);
    expect(cands(c)).toEqual(["scrap_it"]);
    expect(c.querySelector("[data-review-candidate]")!.getAttribute("data-review-candidate")).toBe("scrap_it");
  });
  it("an unverified null-proposal row keeps its text, with the reason beneath", () => {
    const c = draw([{ needs_review: true, abstention_reason: "no rule matched" }]);
    expect(c.textContent).toContain("unverified — override required");
    expect(c.querySelector("[data-review-abstention]")).not.toBeNull();
  });
});
