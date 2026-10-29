import { describe, it, expect, afterEach, vi, beforeEach } from "vitest";
import { render, cleanup, fireEvent, waitFor, act } from "@testing-library/react";

const h = vi.hoisted(() => ({ mock: false, on: true }));
const fileAccessProposal = vi.fn();
vi.mock("@/lib/accessFlag", () => ({
  isAccessRequestsEnabled: () => h.on,
  isAccessRequestsMockEnabled: () => h.mock,
}));
vi.mock("@/api/client", () => ({ fileAccessProposal: (...a: unknown[]) => fileAccessProposal(...a) }));

import { RequestAccessButton } from "./RequestAccessButton";
import { POLICY_REFUSAL_DETAIL, httpError } from "@/lib/policyRefusalFixture";
import { PROPOSED_FIXTURE_PROPOSAL } from "@/lib/accessProposal";

const refusal = { ...POLICY_REFUSAL_DETAIL.refusal, candidates: [...POLICY_REFUSAL_DETAIL.refusal.candidates] };
const state = () => document.querySelector("[data-access-request]")?.getAttribute("data-access-request");
const btn = () => document.querySelector("[data-request-access]") as HTMLButtonElement | null;

beforeEach(() => {
  h.mock = false;
  h.on = true;
  fileAccessProposal.mockReset();
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("RequestAccessButton", () => {
  it("draws no button when grantable_by is empty", () => {
    render(<RequestAccessButton refusal={{ ...refusal, grantable_by: "" }} />);
    expect(document.querySelector("[data-access-request]")).toBeNull();
    expect(btn()).toBeNull();
  });
  it("idle draws the button; the click files only policy_id and missing_binding", async () => {
    fileAccessProposal.mockResolvedValue({ proposal_id: "p1", head_sha: "a".repeat(40), review_task_id: "t1" });
    render(<RequestAccessButton refusal={refusal} />);
    expect(state()).toBe("idle");
    fireEvent.click(btn()!);
    await waitFor(() => expect(state()).toBe("filed"));
    expect(fileAccessProposal).toHaveBeenCalledWith({ policy_id: "program_members", missing_binding: "member(NP-MERIDIAN)" });
  });
  it("filing disables the button", async () => {
    fileAccessProposal.mockReturnValue(new Promise(() => {}));
    render(<RequestAccessButton refusal={refusal} />);
    fireEvent.click(btn()!);
    await waitFor(() => expect(state()).toBe("filing"));
    expect(btn()!.disabled).toBe(true);
  });
  it("filed shows the platform's ids and never says granted", async () => {
    fileAccessProposal.mockResolvedValue({ proposal_id: "prop-9", head_sha: "a".repeat(40), review_task_id: "task-9" });
    render(<RequestAccessButton refusal={refusal} />);
    fireEvent.click(btn()!);
    await waitFor(() => expect(state()).toBe("filed"));
    expect(document.querySelector("[data-access-proposal]")?.textContent).toBe("prop-9");
    expect(document.querySelector("[data-access-review-task]")?.textContent).toBe("task-9");
    expect(document.body.textContent ?? "").not.toMatch(/granted/i);
  });
  it("a refused proposal renders its own envelope with no nested button", async () => {
    fileAccessProposal.mockRejectedValue(
      httpError(409, {
        ...POLICY_REFUSAL_DETAIL,
        refusal: { ...refusal, policy_id: "duplicate_open_proposal", grantable_by: "the same owner" },
      }),
    );
    render(<RequestAccessButton refusal={refusal} />);
    fireEvent.click(btn()!);
    await waitFor(() => expect(state()).toBe("refused"));
    expect(document.querySelector('[data-policy-refusal="duplicate_open_proposal"]')).not.toBeNull();
    expect(btn()).toBeNull();
  });
  it("any other failure is failed, with the message, and the button stays", async () => {
    fileAccessProposal.mockRejectedValue(new Error("network down"));
    render(<RequestAccessButton refusal={refusal} />);
    fireEvent.click(btn()!);
    await waitFor(() => expect(state()).toBe("failed"));
    expect(document.querySelector("[data-access-request-failed]")?.textContent).toBe("network down");
    expect(btn()).not.toBeNull();
  });
  it("in mock mode the client is not called and the fixture's ids are shown", async () => {
    h.mock = true;
    vi.useFakeTimers();
    render(<RequestAccessButton refusal={refusal} />);
    fireEvent.click(btn()!);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });
    expect(state()).toBe("filed");
    expect(fileAccessProposal).not.toHaveBeenCalled();
    expect(document.querySelector("[data-access-proposal]")?.textContent).toBe(PROPOSED_FIXTURE_PROPOSAL.proposal_id);
  });
});
