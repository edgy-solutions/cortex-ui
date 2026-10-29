import type { CanvasSeedRefusal } from "@/api/generated/bff";

/**
 * A POLICY REFUSAL -- the declared envelope (`CanvasSeedRefusal`, producer: invincible-agent
 * `src/iagent/authz/refusal.py` `policy_refusal`). Any 401, 403 or 409 whose `detail` is
 * `{error, refusal: {policy_id, missing_binding, grantable_by, candidates}, message?}`.
 *
 * A PARTIAL ENVELOPE IS NULL: a half-claim ("you are missing something, ask someone") is worse than
 * drawing nothing, so every one of the four fields must have its type, and the three strings must be
 * non-empty.
 */
export interface PolicyRefusal {
  status: number | null;
  error: string;
  message: string | null;
  refusal: CanvasSeedRefusal;
}

const isRec = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const nonEmpty = (v: unknown): v is string => typeof v === "string" && v.trim() !== "";

/** Accepts an axios-style error (`response.status`, `response.data.detail`) or a bare `detail` object. */
export function readPolicyRefusal(errOrDetail: unknown): PolicyRefusal | null {
  if (!isRec(errOrDetail)) return null;
  let status: number | null = null;
  let detail: unknown = errOrDetail;
  if (isRec(errOrDetail.response)) {
    const r = errOrDetail.response;
    status = typeof r.status === "number" ? r.status : null;
    detail = isRec(r.data) ? r.data.detail : null;
  }
  if (!isRec(detail) || typeof detail.error !== "string" || !isRec(detail.refusal)) return null;
  const f = detail.refusal;
  if (
    !nonEmpty(f.policy_id) ||
    !nonEmpty(f.missing_binding) ||
    !nonEmpty(f.grantable_by) ||
    !Array.isArray(f.candidates) ||
    !f.candidates.every((c) => typeof c === "string")
  ) {
    return null;
  }
  return {
    status,
    error: detail.error,
    message: typeof detail.message === "string" && detail.message.trim() !== "" ? detail.message : null,
    refusal: {
      policy_id: f.policy_id,
      missing_binding: f.missing_binding,
      grantable_by: f.grantable_by,
      candidates: f.candidates as string[],
    },
  };
}

/** `grantable_by` reads "<who>; <how>": split on the FIRST "; ". `how` is null with no separator. */
export function grantorParts(grantableBy: string): { who: string; how: string | null } {
  const i = grantableBy.indexOf("; ");
  return i < 0 ? { who: grantableBy, how: null } : { who: grantableBy.slice(0, i), how: grantableBy.slice(i + 2) };
}
