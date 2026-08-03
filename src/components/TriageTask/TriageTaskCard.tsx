import { useState } from "react";
import { AlertTriangle, CheckCircle2, RotateCw } from "lucide-react";
import { toast } from "sonner";
import { FederatedImage } from "@/components/mesh/FederatedImage";
import { actOnHumanTask } from "@/api/client";
import { markTaskResolvedByTaskId } from "@/lib/useTaskArtifactSync";
import { formatRequestedBy } from "@/lib/requestedBy";

/**
 * TRIAGE_TASK archetype — a notice the pipeline could NOT prepare for review.
 *
 * A THIRD SPECIES, not an approval. This card exists because the triage task first shipped
 * rendering as APPROVAL_TASK, offering **Approve / Reject** on *"Notice PCN-2683-CROPFAIL
 * could not be prepared for review."* Approve… the failure? The task's semantics are
 * DISPOSITION OF A BROKEN INPUT, not a decision on a proposal — and the cost was never the
 * wording: whichever button was clicked would record a decision the data cannot represent,
 * and ADR-0034's decision records would archive that IMMUTABLY, as evidence, into the corpus
 * that governs vendor promotion.
 *
 * The honest verbs:
 *   ACKNOWLEDGE (reason REQUIRED) — seen; genuinely unprocessable or handled out-of-band.
 *     The reason is load-bearing, not a form nicety: "parts entered in the legacy system" and
 *     "notice withdrawn by the vendor" are different facts about the pipeline, and a bare
 *     acknowledgement erases the difference. It is also v1 of key-it-in, until the
 *     manual-entry lane wakes (see docs/plans/triage-card-archetype.md).
 *   RE-DRIVE — the underlying issue is fixed; re-fire extraction. Nothing new underneath: a
 *     re-extract writes a new review.json whose new ETag the sensor sees as new work.
 *   (ESCALATE — deferred.)
 *
 * The API refuses approve/reject on this kind (422), so this card is the honest surface over
 * a gate that holds regardless of what the UI offers.
 */
export interface TriageTaskPayload {
  task_id: string;
  kind: string;
  task_state?: "pending" | "acknowledged" | "redriven" | "approved" | "rejected" | "expired";
  title: string;
  summary: string;
  audience: string;
  requested_by: string;
  subject_ref: string | null;
  /** Extraction-quality warnings ("PARTS MAY BE MISSING: 2/5 table crops failed") — the WHY
   *  that makes the refusal actionable. Threaded from the triage payload. */
  warnings?: string[];
  reason_code?: string;
  /** Page renders from the extraction that FAILED. The card's instrument: alice is asked to
   *  judge whether a notice the machine could not read matters, and without the pages she has
   *  strictly less to look at than for a notice it read fine — which is backwards. */
  pages?: { page: number; s3_url: string }[];
}

export function TriageTaskCard({ task }: { task: TriageTaskPayload }) {
  const [acting, setActing] = useState(false);
  const [done, setDone] = useState<null | "acknowledged" | "redriven">(null);
  const [reason, setReason] = useState("");
  const [showReason, setShowReason] = useState(false);

  // Mirrors the server's rule rather than inventing a second one. The server is still the
  // authority (422 on a blank reason); this only avoids a round-trip to be told so.
  const reasonMissing = !reason.trim();

  const act = async (decision: "acknowledged" | "redriven") => {
    if (decision === "acknowledged" && reasonMissing) {
      setShowReason(true);
      toast.error("A reason is required — it is the difference between the outcomes this covers");
      return;
    }
    setActing(true);
    try {
      await actOnHumanTask(task.task_id, decision, reason.trim());
      setDone(decision);
      markTaskResolvedByTaskId(task.task_id);
      toast.success(
        decision === "acknowledged" ? "Acknowledged" : "Re-drive requested — re-extraction will re-fire the review"
      );
    } catch (err) {
      const status = (err as { response?: { status?: number } })?.response?.status;
      toast.error(
        status === 403
          ? "Not authorized to act on this task"
          : status === 404
            ? "Task no longer available"
            : status === 422
              ? "That action is not valid for this task"
              : "Action failed"
      );
    } finally {
      setActing(false);
    }
  };

  return (
    <div className="glass-panel p-6 my-4 border-amber-500/30">
      <div className="mb-4">
        <div className="flex items-center gap-2 mb-1">
          <AlertTriangle className="w-4 h-4 text-amber-400" />
          <h3 className="text-lg font-bold text-white tracking-tight leading-none flex-1">
            {task.title}
          </h3>
          <span
            className={`px-1.5 py-0.5 rounded text-[8px] font-mono font-bold uppercase tracking-wider border ${
              done || task.task_state !== "pending"
                ? "text-slate-400 border-white/10 bg-white/5"
                : "text-amber-300 border-amber-500/40 bg-amber-500/10"
            }`}
          >
            {done ?? task.task_state ?? "pending"}
          </span>
        </div>
        <p className="text-[10px] text-amber-400/70 uppercase tracking-[0.2em] font-mono font-bold">
          {task.reason_code ? `${task.reason_code} · ` : ""}{task.audience}
        </p>
      </div>

      {task.summary && (
        <p className="text-sm text-slate-300 mb-4 leading-relaxed">{task.summary}</p>
      )}

      {/* The WHY, given its own weight rather than buried in the summary line — this is the
          one thing that makes the refusal actionable to a human. */}
      {task.warnings && task.warnings.length > 0 && (
        <div className="mb-4 rounded border border-amber-500/25 bg-amber-500/[0.06] p-3">
          <p className="text-[9px] font-mono uppercase tracking-[0.2em] text-amber-400/80 mb-1.5">
            why the extraction could not prepare this
          </p>
          <ul className="space-y-1">
            {task.warnings.map((w, i) => (
              <li key={i} className="text-[12px] text-amber-100/90 leading-snug">{w}</li>
            ))}
          </ul>
        </div>
      )}

      {/* THE INSTRUMENT. Deliberately the `not_found` treatment the review card already uses
          for an unlocated value: UNLOCATED IS NOT MISSING — the page renders, nothing is
          highlighted, and the reader is told plainly to scan it themselves. That is the honest
          shape here too, because the extraction genuinely could not anchor anything: pretending
          to a highlight would be inventing a location the pipeline never found. */}
      {task.pages && task.pages.length > 0 && (
        <div className="mb-4">
          <p className="text-[9px] font-mono uppercase tracking-[0.2em] text-cyan-400/70 mb-1.5">
            source pages · nothing could be anchored — scan for the parts table yourself
          </p>
          <div className="flex gap-2 overflow-x-auto pb-1">
            {/* No anchor around each figure: `s3://` is not a navigable href either — the same
                reason the raw <img> failed. Full-size viewing needs a real route, filed rather
                than faked with a link that goes nowhere. */}
            {task.pages.map((p) => (
              <div
                key={p.page}
                className="shrink-0 rounded border border-white/10 hover:border-cyan-500/50 transition-colors"
                title={`page ${p.page}`}
              >
                {/* FederatedImage, not a raw <img>: the payload carries `s3://bucket/key`,
                    which a browser cannot fetch — the page slots rendered as empty frames
                    (witnessed 2026-08-03). The BFF's /federated_image endpoint streams it with
                    the caller's JWT, which is also why this must not be a plain <img> with a
                    query URL: the token has to ride the request. Reusing the component the
                    review card already uses rather than inventing a second image path. */}
                <FederatedImage
                  src={p.s3_url}
                  alt={`page ${p.page}`}
                  className="h-40 w-auto rounded opacity-90 hover:opacity-100"
                />
                <span className="block text-center text-[9px] font-mono text-slate-500 py-0.5">
                  page {p.page}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* NO PAGES IS ITS OWN STATE, said out loud rather than rendered as an empty region.
          A silently absent instrument reads as "there was nothing to see"; the truth is that
          the extraction produced no renders, which is a fact about the PIPELINE that a
          reviewer deciding what to do next needs. */}
      {(!task.pages || task.pages.length === 0) && (
        <p className="mb-4 text-[11px] text-slate-500 italic">
          No page renders were produced for this notice — open the source artifact directly.
        </p>
      )}

      <div className="space-y-0.5 text-[10px] font-mono text-slate-500 uppercase tracking-wider mb-5">
        {task.requested_by && <p>requested by · {formatRequestedBy(task.requested_by)}</p>}
        {task.subject_ref && <p className="break-all">subject · {task.subject_ref}</p>}
      </div>

      {done ? (
        <div className="text-[11px] font-mono uppercase tracking-widest text-neon-green">
          {done === "acknowledged" ? "Acknowledged" : "Re-drive requested"}
        </div>
      ) : (
        <>
          {showReason && (
            <div className="mb-3">
              <label className="block text-[9px] font-mono uppercase tracking-[0.2em] text-slate-400 mb-1.5">
                reason · required
              </label>
              <input
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                autoFocus
                placeholder="e.g. parts entered in the legacy system · notice withdrawn by vendor"
                className="w-full px-3 py-2 rounded bg-black/30 border border-white/10 text-[12px] text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-amber-500/50"
              />
            </div>
          )}
          <div className="flex gap-2">
            <button
              onClick={() => (showReason ? act("acknowledged") : setShowReason(true))}
              disabled={acting}
              className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded bg-neon-green/10 border border-neon-green/50 text-neon-green text-[11px] font-mono uppercase tracking-widest hover:bg-neon-green/20 disabled:opacity-40 transition-colors cursor-pointer"
            >
              <CheckCircle2 className="w-3.5 h-3.5" /> Acknowledge
            </button>
            <button
              onClick={() => act("redriven")}
              disabled={acting}
              className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded bg-cyan-500/10 border border-cyan-500/50 text-cyan-300 text-[11px] font-mono uppercase tracking-widest hover:bg-cyan-500/20 disabled:opacity-40 transition-colors cursor-pointer"
            >
              <RotateCw className="w-3.5 h-3.5" /> Re-drive
            </button>
          </div>
        </>
      )}
    </div>
  );
}
