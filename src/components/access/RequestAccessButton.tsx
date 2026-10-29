import { useState } from "react";
import type { CanvasSeedRefusal } from "@/api/generated/bff";
import type { AccessProposalFiled } from "@/lib/accessProposal";
import { fileProposal } from "@/lib/accessProposalSource";
import { readPolicyRefusal, type PolicyRefusal } from "@/lib/policyRefusal";
import { PolicyRefusalNotice } from "./PolicyRefusalNotice";

type State =
  | { s: "idle" }
  | { s: "filing" }
  | { s: "filed"; filed: AccessProposalFiled }
  | { s: "refused"; policy: PolicyRefusal }
  | { s: "failed"; message: string };

/**
 * "Request access" on a policy refusal (docs/specs/access-request-cards.md section 1). Files ONE
 * proposal naming the envelope's `policy_id` and `missing_binding`; the requester comes from the
 * bearer and the platform derives the grant row.
 *
 * Drawn only when the envelope names a grantor. `filed` shows the platform's ids and NEVER says
 * "granted": filing is not granting. A refused proposal draws its own envelope with no button of its own.
 */
export function RequestAccessButton({ refusal }: { refusal: CanvasSeedRefusal }) {
  const [st, setSt] = useState<State>({ s: "idle" });
  if (typeof refusal.grantable_by !== "string" || refusal.grantable_by.trim() === "") return null;

  const file = async () => {
    setSt({ s: "filing" });
    try {
      const filed = await fileProposal({ policy_id: refusal.policy_id, missing_binding: refusal.missing_binding });
      setSt({ s: "filed", filed });
    } catch (err) {
      const policy = readPolicyRefusal(err);
      if (policy) setSt({ s: "refused", policy });
      else setSt({ s: "failed", message: err instanceof Error ? err.message : "The request could not be filed." });
    }
  };

  if (st.s === "filed") {
    return (
      <div className="text-[10px] font-mono text-slate-300 space-y-0.5" data-access-request="filed">
        <p>Request filed. Waiting on a grantor.</p>
        <p>
          Proposal <span data-access-proposal>{st.filed.proposal_id}</span>
        </p>
        <p>
          Review task <span data-access-review-task>{st.filed.review_task_id}</span>
        </p>
      </div>
    );
  }
  if (st.s === "refused") {
    return (
      <div data-access-request="refused">
        <PolicyRefusalNotice policy={st.policy} withButton={false} />
      </div>
    );
  }
  return (
    <div data-access-request={st.s}>
      <button
        type="button"
        disabled={st.s === "filing"}
        onClick={file}
        className="mt-1 px-2 py-1 rounded border border-neon-cyan/40 text-[10px] font-mono uppercase tracking-wider text-neon-cyan hover:bg-neon-cyan/10 disabled:opacity-50"
        data-request-access
      >
        {st.s === "filing" ? "Requesting…" : "Request access"}
      </button>
      {st.s === "failed" && (
        <p className="mt-1 text-[10px] font-mono text-rose-400" role="alert" data-access-request-failed>
          {st.message}
        </p>
      )}
    </div>
  );
}
