import { describe, it, expect, afterEach, vi, beforeEach } from "vitest";
import { render, cleanup } from "@testing-library/react";

const flag = vi.hoisted(() => ({ on: false }));
vi.mock("@/lib/accessFlag", () => ({
  isAccessRequestsEnabled: () => flag.on,
  isAccessRequestsMockEnabled: () => false,
}));
vi.mock("@/api/client", () => ({ fileAccessProposal: vi.fn() }));

import { PolicyRefusalNotice } from "./PolicyRefusalNotice";
import { readPolicyRefusal } from "@/lib/policyRefusal";
import { POLICY_REFUSAL_DETAIL } from "@/lib/policyRefusalFixture";

const policy = readPolicyRefusal(POLICY_REFUSAL_DETAIL)!;
beforeEach(() => {
  flag.on = false;
});
afterEach(cleanup);

describe("PolicyRefusalNotice", () => {
  it("shows the message, the binding, who, how and the candidates", () => {
    render(<PolicyRefusalNotice policy={policy} />);
    const root = document.querySelector("[data-policy-refusal]")!;
    expect(root.getAttribute("data-policy-refusal")).toBe("program_members");
    expect(root.textContent).toContain("You are not a member of this program.");
    expect(document.querySelector("[data-policy-missing]")?.textContent).toBe("Missing: member(NP-MERIDIAN)");
    const g = document.querySelector("[data-policy-grantor]")!;
    expect(g.textContent).toContain("Who can grant: program owner NP-MERIDIAN");
    expect(g.textContent).toContain("ask in #meridian-access");
    expect([...document.querySelectorAll("[data-policy-candidate]")].map((e) => e.textContent)).toEqual(["alice", "carol"]);
  });
  it("falls back to the error code without a message, and draws no list without candidates", () => {
    const p = { ...policy, message: null, refusal: { ...policy.refusal, candidates: [] } };
    render(<PolicyRefusalNotice policy={p} />);
    expect(document.querySelector("[data-policy-refusal]")?.textContent).toContain("policy_refused");
    expect(document.querySelector("[data-policy-candidate]")).toBeNull();
  });
  it("draws no button with the flag off", () => {
    render(<PolicyRefusalNotice policy={policy} />);
    expect(document.querySelector("[data-request-access]")).toBeNull();
  });
  it("draws a button with the flag on", () => {
    flag.on = true;
    render(<PolicyRefusalNotice policy={policy} />);
    expect(document.querySelector("[data-request-access]")).not.toBeNull();
  });
});
