/**
 * accessProposal -- the PROPOSED access-request wire, spelled ONCE, here.
 *
 * Source: invincible-agent ADR-0062 section 7 (Draft) and docs/specs/access-request-cards.md. Every
 * name in this file marked PROPOSED is undeclared at this writing; cortex builds against the
 * declared names only (the policy-refusal envelope, `policyRefusal.ts`). When the ADR lands and
 * the names change, this file is the one place that changes.
 */
import { isAccessRequestsEnabled } from "@/lib/accessFlag";

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

/** PROPOSED: the route that files a grant proposal. */
export const PROPOSED_PROPOSALS_PATH = "/access/proposals";
/** PROPOSED: the `payload.review_shape` of the grantor's task. */
export const PROPOSED_GRANT_REVIEW_SHAPE = "grant_proposal";
/** PROPOSED: the act refusal (409 detail.error) when the proposal moved after review. */
export const PROPOSED_MOVED_ERROR = "proposal_moved";

/** PROPOSED: the body. The requester comes from the bearer; cortex sends nothing else. */
export interface AccessProposalBody {
  policy_id: string;
  missing_binding: string;
}
/** PROPOSED: the response. */
export interface AccessProposalFiled {
  proposal_id: string;
  head_sha: string;
  review_task_id: string;
}

const HEX40 = /^[0-9a-f]{40}$/;
const nonEmpty = (v: unknown): v is string => typeof v === "string" && v.trim() !== "";

/** Null unless all three ids are non-empty strings. */
export function readAccessProposal(raw: unknown): AccessProposalFiled | null {
  if (!isRecord(raw)) return null;
  if (!nonEmpty(raw.proposal_id) || !nonEmpty(raw.head_sha) || !nonEmpty(raw.review_task_id)) return null;
  return { proposal_id: raw.proposal_id, head_sha: raw.head_sha, review_task_id: raw.review_task_id };
}

/** PROPOSED: the post-merge sync state the platform reports. */
export type GrantSyncState = "pending" | "running" | "complete" | "failed";
const SYNC_STATES: readonly string[] = ["pending", "running", "complete", "failed"];

/** PROPOSED: the grantor's task payload. */
export interface GrantReview {
  requester: string;
  policy_id: string;
  missing_binding: string;
  proposal_id: string;
  head_sha: string;
  target_ref: string;
  changes: Array<{ file: string; line: string }>;
  diff: string;
  merge_sha: string | null;
  sync_state: GrantSyncState | null;
}

/**
 * Null unless the flag is on AND the payload names review_shape "grant_proposal" with every
 * required field (head_sha is the full 40 hex). Never half a card.
 */
export function readGrantReviewTask(task: { payload?: unknown } | null | undefined): GrantReview | null {
  if (!isAccessRequestsEnabled()) return null;
  const p = task?.payload;
  if (!isRecord(p) || p.review_shape !== PROPOSED_GRANT_REVIEW_SHAPE) return null;
  if (
    !nonEmpty(p.requester) ||
    !nonEmpty(p.policy_id) ||
    !nonEmpty(p.missing_binding) ||
    !nonEmpty(p.proposal_id) ||
    !nonEmpty(p.target_ref) ||
    typeof p.head_sha !== "string" ||
    !HEX40.test(p.head_sha) ||
    typeof p.diff !== "string" ||
    !Array.isArray(p.changes)
  ) {
    return null;
  }
  const changes: Array<{ file: string; line: string }> = [];
  for (const c of p.changes) {
    if (!isRecord(c) || typeof c.file !== "string" || typeof c.line !== "string") return null;
    changes.push({ file: c.file, line: c.line });
  }
  const ss = p.sync_state;
  return {
    requester: p.requester,
    policy_id: p.policy_id,
    missing_binding: p.missing_binding,
    proposal_id: p.proposal_id,
    head_sha: p.head_sha,
    target_ref: p.target_ref,
    changes,
    diff: p.diff,
    merge_sha: nonEmpty(p.merge_sha) ? p.merge_sha : null,
    sync_state: typeof ss === "string" && SYNC_STATES.includes(ss) ? (ss as GrantSyncState) : null,
  };
}

/** Mock-mode fixtures (ADR-0062's synthetic names). */
export const PROPOSED_FIXTURE_PROPOSAL: AccessProposalFiled = {
  proposal_id: "prop-synthetic-0001",
  head_sha: "0123456789abcdef0123456789abcdef01234567",
  review_task_id: "task-synthetic-0001",
};
export const PROPOSED_FIXTURE_GRANT_TASK = {
  review_shape: PROPOSED_GRANT_REVIEW_SHAPE,
  requester: "bob",
  policy_id: "program_members",
  missing_binding: "member(NP-MERIDIAN)",
  proposal_id: PROPOSED_FIXTURE_PROPOSAL.proposal_id,
  head_sha: PROPOSED_FIXTURE_PROPOSAL.head_sha,
  target_ref: "main",
  changes: [{ file: "capability_grants.yaml", line: "bob  member  NP-MERIDIAN" }],
  diff: "--- a/capability_grants.yaml\n+++ b/capability_grants.yaml\n@@ -1,1 +1,2 @@\n+bob  member  NP-MERIDIAN\n",
  merge_sha: null,
  sync_state: null,
};
