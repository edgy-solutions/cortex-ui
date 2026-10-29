import { fileAccessProposal } from "@/api/client";
import { isAccessRequestsMockEnabled } from "@/lib/accessFlag";
import {
  PROPOSED_FIXTURE_PROPOSAL,
  type AccessProposalBody,
  type AccessProposalFiled,
} from "@/lib/accessProposal";

/** The mock's latency, so the `filing` state is visible. */
export const MOCK_PROPOSAL_DELAY_MS = 400;

/**
 * Where a filed proposal comes from: the fixture in mock mode (no network call at all), the client
 * otherwise. The one seam, so the button never branches on the flag itself.
 */
export async function fileProposal(body: AccessProposalBody): Promise<AccessProposalFiled> {
  if (isAccessRequestsMockEnabled()) {
    await new Promise((r) => setTimeout(r, MOCK_PROPOSAL_DELAY_MS));
    return { ...PROPOSED_FIXTURE_PROPOSAL };
  }
  return fileAccessProposal(body);
}
