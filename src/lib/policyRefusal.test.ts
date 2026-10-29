import { describe, it, expect } from "vitest";
import { grantorParts, readPolicyRefusal } from "./policyRefusal";
import { POLICY_REFUSAL_DETAIL, httpError } from "./policyRefusalFixture";

const withRefusal = (over: Record<string, unknown>) => ({
  ...POLICY_REFUSAL_DETAIL,
  refusal: { ...POLICY_REFUSAL_DETAIL.refusal, ...over },
});

describe("readPolicyRefusal", () => {
  it("reads the envelope from an axios-style error", () => {
    const r = readPolicyRefusal(httpError(403, POLICY_REFUSAL_DETAIL));
    expect(r?.status).toBe(403);
    expect(r?.error).toBe("policy_refused");
    expect(r?.message).toBe("You are not a member of this program.");
    expect(r?.refusal.policy_id).toBe("program_members");
    expect(r?.refusal.candidates).toEqual(["alice", "carol"]);
  });
  it("reads the envelope from a bare detail", () => {
    const r = readPolicyRefusal(POLICY_REFUSAL_DETAIL);
    expect(r?.status).toBeNull();
    expect(r?.refusal.missing_binding).toBe("member(NP-MERIDIAN)");
  });
  it("message is null when absent", () => {
    const { message: _m, ...rest } = POLICY_REFUSAL_DETAIL;
    expect(readPolicyRefusal(rest)?.message).toBeNull();
  });
  it.each([
    ["policy_id", { policy_id: "" }],
    ["policy_id type", { policy_id: 3 }],
    ["missing_binding", { missing_binding: "  " }],
    ["grantable_by empty", { grantable_by: "" }],
    ["grantable_by absent", { grantable_by: undefined }],
    ["candidates not an array", { candidates: "alice" }],
    ["candidates holds a non-string", { candidates: ["alice", 7] }],
  ])("is null when %s is wrong", (_n, over) => {
    expect(readPolicyRefusal(httpError(403, withRefusal(over)))).toBeNull();
  });
  it("is null for no refusal, no error code, a string detail, or junk", () => {
    expect(readPolicyRefusal(httpError(403, { error: "x" }))).toBeNull();
    expect(readPolicyRefusal(httpError(403, { refusal: POLICY_REFUSAL_DETAIL.refusal }))).toBeNull();
    expect(readPolicyRefusal(httpError(403, "forbidden"))).toBeNull();
    expect(readPolicyRefusal(null)).toBeNull();
    expect(readPolicyRefusal("x")).toBeNull();
  });
});

describe("grantorParts", () => {
  it("splits on the FIRST separator", () => {
    expect(grantorParts("owner; ask here; or there")).toEqual({ who: "owner", how: "ask here; or there" });
  });
  it("how is null with no separator", () => {
    expect(grantorParts("owner")).toEqual({ who: "owner", how: null });
    expect(grantorParts("owner;nospace")).toEqual({ who: "owner;nospace", how: null });
  });
});
