/** A policy-refusal `detail` (the declared envelope), with ADR-0062's synthetic names. Test fixture. */
export const POLICY_REFUSAL_DETAIL = {
  error: "policy_refused",
  message: "You are not a member of this program.",
  refusal: {
    policy_id: "program_members",
    missing_binding: "member(NP-MERIDIAN)",
    grantable_by: "program owner NP-MERIDIAN; ask in #meridian-access",
    candidates: ["alice", "carol"],
  },
} as const;

/** An axios-shaped error carrying `detail` at `status`. */
export const httpError = (status: number, detail: unknown) =>
  Object.assign(new Error(String(status)), { response: { status, data: { detail } } });
