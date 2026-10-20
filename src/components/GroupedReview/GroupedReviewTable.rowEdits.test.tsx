/**
 * Grouped-review ROW EDITS (delete / add / correct) and the narrow three-reason Reject.
 *
 * Behind VITE_REVIEW_ROW_EDITS, default ON (only the exact string "false" turns it off): the live
 * platform (49aa5e28) declares row_edits + reason_code on HumanTaskActRequest. The key sets are
 * sealed against the producer's source in src/lib/rowEditsWireParity.test.ts. These tests run the REAL actOnHumanTask
 * against a mocked axios `post`, so the body the platform would receive is what is asserted.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render } from "@testing-library/react";

const { mockPost } = vi.hoisted(() => ({ mockPost: vi.fn() }));
vi.mock("axios", () => ({
  default: {
    get: vi.fn(),
    create: vi.fn(() => ({
      post: mockPost,
      get: vi.fn(),
      interceptors: { request: { use: vi.fn() }, response: { use: vi.fn() } },
    })),
  },
}));
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

import { GroupedReviewTable, REJECT_REASONS } from "./GroupedReviewTable";
import type { ReviewBatch } from "./types";
import { toast } from "sonner";

let seq = 0;
function batch(): ReviewBatch {
  return {
    batch_id: `task-${++seq}`,
    notice_id: "PCN-1",
    notice_type: "PCN",
    notice_fingerprint: "fp",
    approver: "me",
    items: [
      { mpn: "AAA-1", proposed_disposition: "dispatchLTB", needs_review: false },
      { mpn: "BBB-2", proposed_disposition: "archive", needs_review: false },
    ],
  };
}
const flag = (on: boolean) => {
  (window as { __RUNTIME_CONFIG__?: unknown }).__RUNTIME_CONFIG__ = on ? { VITE_REVIEW_ROW_EDITS: "true" } : { VITE_REVIEW_ROW_EDITS: "false" };
};
const q = (c: HTMLElement, attr: string, val?: string) =>
  c.querySelector(val === undefined ? `[${attr}]` : `[${attr}="${val}"]`) as HTMLElement | null;
const qa = (c: HTMLElement, attr: string) => Array.from(c.querySelectorAll(`[${attr}]`)) as HTMLElement[];
const type = (el: HTMLElement | null, value: string) => fireEvent.change(el!, { target: { value } });
const resolveBtn = (c: HTMLElement) =>
  Array.from(c.querySelectorAll("button")).find((b) => /^Resolve/.test(b.textContent ?? "")) as HTMLButtonElement;
const body = () => mockPost.mock.calls[0]![1] as Record<string, unknown>;

beforeEach(() => {
  mockPost.mockReset();
  mockPost.mockResolvedValue({ data: { accepted: true, resolved_count: 2 } });
  vi.mocked(toast.error).mockReset();
});
afterEach(() => {
  cleanup();
  (window as { __RUNTIME_CONFIG__?: unknown }).__RUNTIME_CONFIG__ = undefined;
});

describe("flag OFF — the card is what it was", () => {
  it("renders no row-edit or reject controls", () => {
    flag(false);
    const { container } = render(<GroupedReviewTable batch={batch()} />);
    for (const a of [
      "data-review-row-delete",
      "data-review-row-add",
      "data-review-row-edit",
      "data-review-reject",
    ]) {
      expect(q(container, a), a).toBeNull();
    }
  });

  it("an approve body has no row_edits key", async () => {
    flag(false);
    const { container } = render(<GroupedReviewTable batch={batch()} />);
    fireEvent.click(resolveBtn(container));
    await vi.waitFor(() => expect(mockPost).toHaveBeenCalledTimes(1));
    expect(Object.keys(body()), "flag off must never send row_edits").toEqual(["decision", "comment"]);
  });
});

describe("flag ON — delete", () => {
  it("strikes the row through, offers undo, and a missing reason blocks Resolve", () => {
    flag(true);
    const { container } = render(<GroupedReviewTable batch={batch()} />);
    fireEvent.click(qa(container, "data-review-row-delete")[0]!);
    const row = q(container, "data-review-row-deleted", "AAA-1")!;
    expect(row).not.toBeNull();
    expect(row.querySelector(".line-through")?.textContent).toBe("AAA-1");
    expect(q(row, "data-review-row-undo")).not.toBeNull();
    expect(resolveBtn(container).disabled, "no reason yet").toBe(true);
    type(q(row, "data-review-row-delete-reason"), "not a part");
    expect(resolveBtn(container).disabled).toBe(false);
    fireEvent.click(q(container, "data-review-row-undo")!);
    expect(q(container, "data-review-row-deleted")).toBeNull();
  });

  it("a deleted row is absent from overrides and present in row_edits.deleted", async () => {
    flag(true);
    const { container } = render(<GroupedReviewTable batch={batch()} />);
    // override AAA-1 first, then delete it: the dead override must not travel
    fireEvent.click(Array.from(container.querySelectorAll("button")).find((b) => b.textContent === "Override")!);
    type(container.querySelector("input[placeholder^='reason required']"), "because");
    fireEvent.click(qa(container, "data-review-row-delete")[0]!);
    type(q(container, "data-review-row-delete-reason"), " not a part ");
    fireEvent.click(resolveBtn(container));
    await vi.waitFor(() => expect(mockPost).toHaveBeenCalledTimes(1));
    expect(body().overrides).toBeUndefined();
    expect(body().row_edits).toEqual({ deleted: [{ mpn: "AAA-1", reason: "not a part" }], added: [], corrected: [] });
  });
});

describe("flag ON — add", () => {
  const openAdd = (c: HTMLElement) => {
    fireEvent.click(q(c, "data-review-row-add")!);
    return q(c, "data-review-row-add-input")!;
  };

  it("refuses an empty MPN and a duplicate, inline", () => {
    flag(true);
    const { container } = render(<GroupedReviewTable batch={batch()} />);
    openAdd(container);
    fireEvent.click(q(container, "data-review-row-add-confirm")!);
    expect(q(container, "data-review-row-add-error")?.textContent).toBe("Enter a part number (MPN).");
    type(q(container, "data-review-row-add-input"), "  AAA-1 ");
    fireEvent.click(q(container, "data-review-row-add-confirm")!);
    expect(q(container, "data-review-row-add-error")?.textContent).toBe("AAA-1 is already a row in this review.");
    expect(q(container, "data-review-row-added")).toBeNull();
  });

  it("refuses an add with blank evidence, inline, and never copies the reason into it", () => {
    flag(true);
    const { container } = render(<GroupedReviewTable batch={batch()} />);
    type(openAdd(container), "NEW-9");
    type(q(container, "data-review-row-add-evidence"), "   ");
    fireEvent.click(q(container, "data-review-row-add-confirm")!);
    expect(q(container, "data-review-row-add-error")?.textContent).toBe("Enter the evidence for this part.");
    expect(q(container, "data-review-row-added")).toBeNull();
  });

  it("an added row with no override blocks Resolve; with one it lands in row_edits.added, not overrides", async () => {
    flag(true);
    const { container } = render(<GroupedReviewTable batch={batch()} />);
    type(openAdd(container), "  NEW-9  ");
    type(q(container, "data-review-row-add-evidence"), "  PCN p.2 table 1  ");
    fireEvent.click(q(container, "data-review-row-add-confirm")!);
    expect(q(container, "data-review-row-added")?.textContent).toBe("added");
    expect(resolveBtn(container).disabled, "null proposal, no override").toBe(true);

    fireEvent.click(Array.from(container.querySelectorAll("button")).find((b) => /^Set disposition/.test(b.textContent ?? ""))!);
    expect(resolveBtn(container).disabled, "override needs its reason").toBe(true);
    type(container.querySelector("input[placeholder^='reason required']"), "missed by extraction");
    expect(resolveBtn(container).disabled).toBe(false);
    fireEvent.click(resolveBtn(container));
    await vi.waitFor(() => expect(mockPost).toHaveBeenCalledTimes(1));
    expect(body().overrides).toBeUndefined();
    expect(body().row_edits).toEqual({
      deleted: [],
      added: [
        { mpn: "NEW-9", disposition: "dispatchQualification", reason: "missed by extraction", evidence: "PCN p.2 table 1" },
      ],
      corrected: [],
    });
  });
});

describe("flag ON — correct", () => {
  const correct = (c: HTMLElement, value: string, evidence = "PCN p.3") => {
    fireEvent.click(qa(c, "data-review-row-edit")[0]!);
    type(q(c, "data-review-row-edit-input"), value);
    type(q(c, "data-review-row-edit-evidence"), evidence);
    fireEvent.click(q(c, "data-review-row-edit-apply")!);
  };

  it("shows the corrected value, the badge and the struck-through extracted value", () => {
    flag(true);
    const { container } = render(<GroupedReviewTable batch={batch()} />);
    correct(container, " AAA-1X ");
    expect(q(container, "data-review-row-corrected")?.textContent).toBe("corrected");
    const extracted = q(container, "data-review-row-extracted")!;
    expect(extracted.tagName).toBe("S");
    expect(extracted.textContent).toBe("AAA-1");
    expect(container.textContent).toContain("AAA-1X");
  });

  it("keeps the override keyed by the EXTRACTED mpn and sends the correction beside it", async () => {
    flag(true);
    const { container } = render(<GroupedReviewTable batch={batch()} />);
    correct(container, "AAA-1X");
    fireEvent.click(Array.from(container.querySelectorAll("button")).find((b) => b.textContent === "Override")!);
    type(container.querySelector("input[placeholder^='reason required']"), "why");
    fireEvent.click(resolveBtn(container));
    await vi.waitFor(() => expect(mockPost).toHaveBeenCalledTimes(1));
    expect(Object.keys(body().overrides as object)).toEqual(["AAA-1"]);
    expect(body().row_edits).toEqual({ deleted: [], added: [], corrected: [{ mpn: "AAA-1", corrected_mpn: "AAA-1X", evidence: "PCN p.3" }],
    });
  });

  it("a correction with blank evidence blocks Resolve, names the row, and unblocks once evidence is typed", () => {
    flag(true);
    const { container } = render(<GroupedReviewTable batch={batch()} />);
    correct(container, "AAA-1X", "  ");
    expect(q(container, "data-review-row-corrected")).not.toBeNull();
    expect(resolveBtn(container).disabled, "blank evidence").toBe(true);
    expect(q(container, "data-review-incomplete")?.textContent).toContain("AAA-1");
    fireEvent.click(qa(container, "data-review-row-edit")[0]!);
    type(q(container, "data-review-row-edit-evidence"), "PCN p.3");
    fireEvent.click(q(container, "data-review-row-edit-apply")!);
    expect(resolveBtn(container).disabled).toBe(false);
  });

  it("refuses a correction that only changes case", () => {
    flag(true);
    const { container } = render(<GroupedReviewTable batch={batch()} />);
    fireEvent.click(qa(container, "data-review-row-edit")[0]!);
    type(q(container, "data-review-row-edit-input"), "aaa-1");
    type(q(container, "data-review-row-edit-evidence"), "x");
    fireEvent.click(q(container, "data-review-row-edit-apply")!);
    expect(q(container, "data-review-row-edit-error")?.textContent).toMatch(/must change it/);
    expect(q(container, "data-review-row-corrected")).toBeNull();
  });

  it("refuses a correction that collides with another row", () => {
    flag(true);
    const { container } = render(<GroupedReviewTable batch={batch()} />);
    correct(container, "BBB-2");
    expect(q(container, "data-review-row-edit-error")?.textContent).toBe("BBB-2 collides with another row in this review.");
    expect(q(container, "data-review-row-corrected")).toBeNull();
  });
});

describe("flag ON — narrow Reject", () => {
  it("offers exactly the four reasons, in order, and Confirm waits for a pick", () => {
    flag(true);
    const { container } = render(<GroupedReviewTable batch={batch()} />);
    fireEvent.click(q(container, "data-review-reject")!);
    const codes = qa(container, "data-review-reject-reason").map((e) => e.getAttribute("data-review-reject-reason"));
    expect(codes).toEqual(["not_a_notice", "unreadable", "parts_unusable", "duplicate"]);
    expect(REJECT_REASONS.length).toBe(4);
    const confirm = q(container, "data-review-reject-confirm") as HTMLButtonElement;
    expect(confirm.disabled, "no reason picked").toBe(true);
    fireEvent.click(q(container, "data-review-reject-reason", "parts_unusable")!);
    expect(confirm.disabled).toBe(false);
  });

  it("sends exactly {decision, comment, reason_code} — no overrides, no row_edits", async () => {
    flag(true);
    const { container } = render(<GroupedReviewTable batch={batch()} />);
    fireEvent.click(q(container, "data-review-reject")!);
    fireEvent.click(q(container, "data-review-reject-reason", "parts_unusable")!);
    fireEvent.click(q(container, "data-review-reject-confirm")!);
    await vi.waitFor(() => expect(mockPost).toHaveBeenCalledTimes(1));
    expect(body()).toEqual({
      decision: "rejected",
      comment: "parts_unusable: The parts list cannot be used",
      reason_code: "parts_unusable",
    });
    expect(Object.keys(body()).sort()).toEqual(["comment", "decision", "reason_code"]);
  });

  it("toasts when the server refuses (501)", async () => {
    flag(true);
    mockPost.mockRejectedValueOnce({ response: { status: 501 } });
    const { container } = render(<GroupedReviewTable batch={batch()} />);
    fireEvent.click(q(container, "data-review-reject")!);
    fireEvent.click(q(container, "data-review-reject-reason", "not_a_notice")!);
    fireEvent.click(q(container, "data-review-reject-confirm")!);
    await vi.waitFor(() => expect(toast.error).toHaveBeenCalledWith("Reject is not wired on the platform yet"));
  });
});

describe("flag ON — a refused /act names the platform's reasons and keeps the draft (197)", () => {
  const del = (c: HTMLElement) => {
    fireEvent.click(qa(c, "data-review-row-delete")[0]!);
    type(q(c, "data-review-row-delete-reason"), "not a part");
  };

  it("422 row_edits_invalid: every problem in the toast, the deletion still on screen, Resolve still live", async () => {
    flag(true);
    const problems = ["mpn 'AAA-1' is not a row of this review", "added mpn 'X' collides with an extracted row"];
    mockPost.mockRejectedValueOnce({ response: { status: 422, data: { detail: { error: "row_edits_invalid", message: problems[0], problems } } } });
    const { container } = render(<GroupedReviewTable batch={batch()} />);
    del(container);
    fireEvent.click(resolveBtn(container));
    await vi.waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith("Row edits refused — 2 problems; nothing was applied", {
        description: problems.join("\n"),
        duration: 15000,
      }),
    );
    expect(q(container, "data-review-row-deleted", "AAA-1"), "the draft survives a refusal").not.toBeNull();
    expect(resolveBtn(container).disabled, "the steward can fix and resend").toBe(false);
  });

  it("a 500 on Resolve names the status, never a bare 'Resolve failed'", async () => {
    flag(true);
    mockPost.mockRejectedValueOnce({ response: { status: 500, data: {} } });
    const { container } = render(<GroupedReviewTable batch={batch()} />);
    fireEvent.click(resolveBtn(container));
    await vi.waitFor(() => expect(toast.error).toHaveBeenCalledWith("Resolve failed (HTTP 500)"));
  });

  it("422 reason_code_required on Reject names the codes the server takes", async () => {
    flag(true);
    mockPost.mockRejectedValueOnce({ response: { status: 422, data: { detail: {
      error: "reason_code_required", message: "a grouped-review reject needs a reason_code",
      codes: ["not_a_notice", "unreadable", "parts_unusable", "duplicate"] } } } });
    const { container } = render(<GroupedReviewTable batch={batch()} />);
    fireEvent.click(q(container, "data-review-reject")!);
    fireEvent.click(q(container, "data-review-reject-reason", "not_a_notice")!);
    fireEvent.click(q(container, "data-review-reject-confirm")!);
    await vi.waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(
        "a grouped-review reject needs a reason_code (one of: not_a_notice, unreadable, parts_unusable, duplicate)",
        undefined,
      ),
    );
  });

  it("a Reject with no answer at all says so", async () => {
    flag(true);
    mockPost.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    const { container } = render(<GroupedReviewTable batch={batch()} />);
    fireEvent.click(q(container, "data-review-reject")!);
    fireEvent.click(q(container, "data-review-reject-reason", "not_a_notice")!);
    fireEvent.click(q(container, "data-review-reject-confirm")!);
    await vi.waitFor(() => expect(toast.error).toHaveBeenCalledWith("Reject failed before any answer (Failed to fetch)"));
  });
});
