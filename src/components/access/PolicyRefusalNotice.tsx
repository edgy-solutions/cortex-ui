import { ShieldAlert } from "lucide-react";
import type { PolicyRefusal } from "@/lib/policyRefusal";
import { grantorParts } from "@/lib/policyRefusal";
import { isAccessRequestsEnabled } from "@/lib/accessFlag";
import { RequestAccessButton } from "./RequestAccessButton";

/**
 * THE POLICY REFUSAL, DRAWN (the declared envelope: `policy_id`, `missing_binding`, `grantable_by`,
 * `candidates`). It says what was refused, what binding is missing, and who can grant it. The
 * "Request access" button under it is the PROPOSED half and appears only behind `accessRequests`;
 * `withButton={false}` is how a refused proposal draws its own envelope without nesting another.
 */
export function PolicyRefusalNotice({
  policy,
  withButton = true,
}: {
  policy: Pick<PolicyRefusal, "error" | "message" | "refusal">;
  withButton?: boolean;
}) {
  const { refusal } = policy;
  const { who, how } = grantorParts(refusal.grantable_by);
  return (
    <div
      className="rounded border border-amber-500/30 bg-amber-500/5 px-3 py-2 space-y-1"
      role="alert"
      data-policy-refusal={refusal.policy_id}
    >
      <p className="flex items-center gap-1.5 text-[11px] text-slate-200 leading-relaxed">
        <ShieldAlert className="w-3.5 h-3.5 text-amber-400 flex-shrink-0" />
        {policy.message ?? policy.error}
      </p>
      <p className="text-[10px] font-mono text-slate-300" data-policy-missing>
        Missing: {refusal.missing_binding}
      </p>
      <p className="text-[10px] font-mono text-slate-300" data-policy-grantor>
        Who can grant: {who}
        {how !== null && <span className="ml-1 text-[9px] text-slate-500">{how}</span>}
      </p>
      {refusal.candidates.length > 0 && (
        <ul className="text-[10px] font-mono text-slate-400 list-disc pl-4">
          {refusal.candidates.map((c) => (
            <li key={c} data-policy-candidate>
              {c}
            </li>
          ))}
        </ul>
      )}
      {withButton && isAccessRequestsEnabled() && <RequestAccessButton refusal={refusal} />}
    </div>
  );
}
