import { ShieldCheck } from "lucide-react";
import { useAuth } from "react-oidc-context";
import { verbLabel } from "@/lib/taskDeclaration";
import { dropIdentity } from "@/lib/dropIdentity";
import { usePersonaStore } from "@/store/usePersonaStore";
import { PROPOSED_MOVED_ERROR, type GrantReview } from "@/lib/accessProposal";
import { AFFIRMING, type ApprovalTaskPayload } from "@/components/ApprovalTask/ApprovalTaskCard";
import { useTaskAct } from "@/components/ApprovalTask/useTaskAct";
import { isActBlocked, TaskActBlocked, TaskActNotices } from "@/components/ApprovalTask/TaskActParts";

/**
 * THE GRANTOR'S CARD (docs/specs/access-request-cards.md section 2; PROPOSED payload, see
 * `readGrantReviewTask`). Top line, the changed rows on the left, the diff verbatim on the right,
 * then the task's own verbs and a note. Drawn by `ApprovalTaskCard` only behind `accessRequests`.
 *
 * THE VERBS COME FROM `useTaskAct`, never from a list here; the approve verb is the one in `AFFIRMING`
 * and names the head sha it approves. A verb the hook says needs a reason stays disabled until the
 * note is non-blank. The proposer sees no verbs at all (the server enforces; hiding is a courtesy).
 * "Access granted" is said ONLY when the platform reports the sync complete.
 */
export function GrantReviewCard({ task, review }: { task: ApprovalTaskPayload; review: GrantReview }) {
  const a = useTaskAct(task);
  const { acting, reason, setReason, verbs, needsReason, act, refusal } = a;
  const email = useAuth().user?.profile.email ?? null;
  const entitlements = usePersonaStore((s) => s.entitlements);
  const viewer = dropIdentity(entitlements, email);
  const isProposer = viewer !== null && viewer.trim().toLowerCase() === review.requester.trim().toLowerCase();
  const sha7 = review.head_sha.slice(0, 7);
  const moved = refusal?.code === PROPOSED_MOVED_ERROR;

  return (
    <div className="glass-panel p-6 my-4 border-cyan-500/20" data-grant-review>
      <div className="flex items-center gap-2 mb-3">
        <ShieldCheck className="w-4 h-4 text-neon-cyan" />
        <h3 className="text-lg font-bold text-white tracking-tight leading-none flex-1">{task.title}</h3>
      </div>

      <p className="text-[11px] font-mono text-slate-300 mb-4 flex flex-wrap gap-x-2" data-grant-topline>
        <span data-grant-requester>{review.requester}</span>
        <span>·</span>
        <span>{review.policy_id}</span>
        <span>·</span>
        <span>{review.missing_binding}</span>
        <span>·</span>
        <span>{review.proposal_id}</span>
        <span>·</span>
        <span title={review.head_sha} data-grant-sha>
          {sha7}
        </span>
        <span>·</span>
        <span>{review.target_ref}</span>
      </p>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
        <div className="space-y-1" data-grant-rows>
          {review.changes.map((c, i) => (
            <div key={`${i}:${c.file}`} className="text-[11px] font-mono text-slate-300" data-grant-change>
              <span className="text-slate-500">{c.file}</span> <span>{c.line}</span>
            </div>
          ))}
        </div>
        <pre className="overflow-auto rounded bg-black/30 border border-white/10 p-2 text-[10px] font-mono text-slate-300" data-grant-diff>
          {review.diff}
        </pre>
      </div>

      {moved && (
        <div className="rounded border border-red-500/30 bg-red-500/5 px-3 py-2 mb-3" role="alert" data-grant-moved>
          <p className="text-[11px] text-slate-300">The proposal changed after review.</p>
        </div>
      )}

      {isProposer ? (
        <p className="text-[11px] font-mono text-slate-400" data-grant-own-proposal>
          You proposed this; another grantor must review it.
        </p>
      ) : isActBlocked(a) ? (
        <TaskActBlocked task={task} a={a} />
      ) : (
        <div className="flex flex-col gap-2">
          <TaskActNotices a={a} />
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="note — required for some decisions below"
            aria-label="Note for decision"
            data-grant-note
            className="w-full px-2 py-1.5 rounded bg-black/30 border border-white/10 text-[11px] font-mono text-slate-200 placeholder:text-slate-600"
          />
          <div className="flex flex-wrap gap-2">
            {verbs.map((v) => {
              const blocked = needsReason(v) && !reason.trim();
              return (
                <button
                  key={v}
                  type="button"
                  onClick={() => act(v)}
                  disabled={acting || blocked}
                  data-verb={v}
                  title={blocked ? `${verbLabel(v)} requires a reason` : undefined}
                  className={`flex-1 min-w-[7rem] px-3 py-2 rounded border text-[11px] font-mono uppercase tracking-widest disabled:opacity-40 ${
                    AFFIRMING.has(v)
                      ? "bg-neon-green/10 border-neon-green/50 text-neon-green"
                      : "bg-neon-pink/10 border-neon-pink/50 text-neon-pink"
                  }`}
                >
                  {AFFIRMING.has(v) ? `Grant ${sha7}` : verbLabel(v)}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {review.merge_sha !== null && (
        <div className="mt-3 text-[11px] font-mono text-slate-300 space-y-0.5" data-grant-outcome>
          <p>
            Merge <span data-grant-merge>{review.merge_sha}</span>
          </p>
          <p>
            {review.sync_state === "complete" ? "Access granted." : review.sync_state === null || review.sync_state === "pending" || review.sync_state === "running" ? "Merged; syncing…" : `Merged; sync ${review.sync_state}`}{" "}
            <span data-grant-sync>{review.sync_state ?? "pending"}</span>
          </p>
        </div>
      )}
    </div>
  );
}
