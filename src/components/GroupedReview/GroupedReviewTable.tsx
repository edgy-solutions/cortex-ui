/**
 * PCN/PDN grouped-review table — one approver resolves N affected parts in a single action.
 *
 * The UI face of the backend bulk-resolve core. Four properties it must honor, all visible here:
 *  - accept-all-with-exceptions: every row defaults to its system-proposed disposition; the approver
 *    only touches the exceptions.
 *  - capture-why is structural: an override is not submittable without a reason.
 *  - needs_review is shown, never hidden: a part whose MPN extraction was uncertain wears a loud
 *    UNVERIFIED badge, so a disposition is never a silent laundering of a weak read.
 *  - a row with no proposed disposition and no override cannot be submitted (refuse, don't dispatch
 *    a null effect) — surfaced inline and it blocks the batch submit.
 *
 * `items` is per-approver-filtered server-side (Seal 2); this renders what it's given and never
 * filters. Mirrors SupplyTable's shell + TaskCard's act-with-optimism.
 */
import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { PackageX, AlertTriangle, CheckCircle2, Undo2, ShieldAlert } from "lucide-react";
import { toast } from "sonner";
import {
  DISPOSITIONS,
  presentDisposition,
  type Disposition,
} from "@/lib/dispositions";
import { actOnHumanTask } from "@/api/client";
import type { ReviewBatch, ReviewItem } from "./types";

interface OverrideDraft {
  disposition: Disposition;
  reason: string;
}

const TONE_ACCENT: Record<ReturnType<typeof presentDisposition>["tone"], string> = {
  action: "text-neon-cyan",
  caution: "text-amber-400",
  muted: "text-slate-400",
};

function effectiveDisposition(
  item: ReviewItem,
  override: OverrideDraft | undefined
): Disposition | null {
  return override ? override.disposition : item.proposed_disposition;
}

// Draft cache — an in-progress override set, keyed by batch id, OUTSIDE React so
// it survives a remount. On the canvas a review card can be remounted by an
// unrelated re-render (the constant answer-Electric poll, a reveal-wrapper cycle,
// a stage re-layout); without this, the approver's half-typed override + reason
// would be wiped mid-edit (exactly the observed bug). Cleared on resolve.
const reviewDraftCache = new Map<string, Record<string, OverrideDraft>>();

export function GroupedReviewTable({
  batch,
  onResolved,
}: {
  batch: ReviewBatch;
  onResolved?: (result: { items_resolved: number }) => void;
}) {
  // Only the EXCEPTIONS are held in state; presence of a key means the row is
  // overridden. Initialize from the draft cache so a remount restores the edit.
  const [overrides, setOverrides] = useState<Record<string, OverrideDraft>>(
    () => reviewDraftCache.get(batch.batch_id) ?? {}
  );
  const [submitting, setSubmitting] = useState(false);
  const [resolved, setResolved] = useState(false);

  // Persist every override change to the cache so it outlives a remount.
  useEffect(() => {
    reviewDraftCache.set(batch.batch_id, overrides);
  }, [batch.batch_id, overrides]);

  const setOverride = (mpn: string, patch: Partial<OverrideDraft>) =>
    setOverrides((prev) => {
      const base: OverrideDraft = prev[mpn] ?? { disposition: "dispatchQualification", reason: "" };
      return { ...prev, [mpn]: { ...base, ...patch } };
    });

  const clearOverride = (mpn: string) =>
    setOverrides((prev) => {
      const next = { ...prev };
      delete next[mpn];
      return next;
    });

  // Blockers: a row with no effective disposition; an override missing its reason; or an UNVERIFIED
  // (needs_review) row that hasn't been individually handled. The last is the anti-laundering seal:
  // an unverified part is a MANDATORY EXCEPTION — it may not ride accept-all (visibility isn't
  // friction; a human would "review" it by not noticing it in a batch), so it blocks the whole batch
  // until it is explicitly overridden. Mirrors the backend resolve_batch guard.
  const { needsDisposition, missingReason, unhandledUnverified } = useMemo(() => {
    const nd: string[] = [];
    const mr: string[] = [];
    const uu: string[] = [];
    for (const it of batch.items) {
      const ov = overrides[it.mpn];
      if (!effectiveDisposition(it, ov)) nd.push(it.mpn);
      if (ov && ov.reason.trim() === "") mr.push(it.mpn);
      if (it.needs_review && !ov) uu.push(it.mpn); // unverified + not individually handled
    }
    return { needsDisposition: nd, missingReason: mr, unhandledUnverified: uu };
  }, [batch.items, overrides]);

  const canSubmit =
    !submitting &&
    !resolved &&
    needsDisposition.length === 0 &&
    missingReason.length === 0 &&
    unhandledUnverified.length === 0;

  const needsReviewCount = useMemo(
    () => batch.items.filter((i) => i.needs_review).length,
    [batch.items]
  );

  const submit = async () => {
    setSubmitting(true);
    try {
      // ONLY the exceptions travel — {mpn: {disposition, reason}}. Every other row takes its proposed
      // disposition (accept-all). Submitted through the /act bridge (single durable decision path).
      const overridesDict: Record<string, { disposition: string; reason: string }> = {};
      for (const [mpn, o] of Object.entries(overrides)) {
        overridesDict[mpn] = { disposition: o.disposition, reason: o.reason.trim() };
      }
      const res = await actOnHumanTask(batch.batch_id, "approved", "", overridesDict);
      if (res.accepted === false) {
        // Policy refusal from submit_decision (canSubmit should prevent this, but surface it honestly
        // rather than showing a false success — the review stays pending).
        toast.error(res.reason ? `Refused — ${res.reason}` : "Review refused — still pending");
        return;
      }
      const count = res.resolved_count ?? batch.items.length;
      reviewDraftCache.delete(batch.batch_id); // draft consumed
      setResolved(true);
      toast.success(
        res.review_dispatched
          ? `Resolved ${count} parts — dispatched`
          : `Resolved ${count} parts`
      );
      onResolved?.({ items_resolved: count });
    } catch (err) {
      const status = (err as { response?: { status?: number } })?.response?.status;
      toast.error(
        status === 403
          ? "Not authorized to resolve this batch"
          : status === 404
            ? "Review no longer available"
            : "Resolve failed"
      );
    } finally {
      setSubmitting(false);
    }
  };

  if (!batch.items.length) {
    return (
      <div className="p-4 glass-panel border-white/10 text-slate-500 font-mono text-xs italic">
        NO_PARTS_IN_YOUR_REVIEW_BATCH
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="max-w-full glass-panel border-neon-blue/30 overflow-hidden relative"
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/10 bg-white/5">
        <div className="flex items-center gap-2 min-w-0">
          <PackageX className="w-4 h-4 text-neon-blue shrink-0" />
          <span className="font-mono text-[10px] font-bold text-slate-300 tracking-widest uppercase truncate">
            {batch.notice_type} {batch.notice_id} · {batch.items.length} parts
          </span>
        </div>
        {needsReviewCount > 0 && (
          <div className="flex items-center gap-1.5 text-amber-400" title="Parts with an uncertain MPN extraction">
            <ShieldAlert className="w-3.5 h-3.5" />
            <span className="font-mono text-[9px] uppercase tracking-tighter">
              {needsReviewCount} unverified
            </span>
          </div>
        )}
      </div>

      {/* Table */}
      <div className="overflow-x-auto font-mono">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-slate-900/50">
              {["Part (MPN)", "Disposition", "Replacement / LTB", ""].map((c) => (
                <th
                  key={c}
                  className="px-4 py-2.5 text-[10px] font-bold text-slate-500 uppercase tracking-wider border-b border-white/5"
                >
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {batch.items.map((it) => {
              const ov = overrides[it.mpn];
              const eff = effectiveDisposition(it, ov);
              const pres = eff ? presentDisposition(eff) : null;
              const rowNeedsDisp = !eff;
              const reasonMissing = !!ov && ov.reason.trim() === "";
              return (
                <tr key={it.mpn} className={it.needs_review ? "bg-amber-500/5" : undefined}>
                  {/* Part */}
                  <td className="px-4 py-3 align-top">
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-white break-all">{it.mpn}</span>
                      {it.needs_review && (
                        <span
                          title="MPN extraction uncertain — verify before dispatching an action"
                          className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded border border-amber-500/40 bg-amber-500/10 text-amber-400 text-[8px] font-bold uppercase tracking-tighter shrink-0"
                        >
                          <AlertTriangle className="w-2.5 h-2.5" /> Unverified
                        </span>
                      )}
                    </div>
                    {it.subject == null && (
                      <p className="text-[9px] text-slate-600 mt-1 uppercase tracking-tighter">
                        no catalog subject
                      </p>
                    )}
                  </td>

                  {/* Disposition */}
                  <td className="px-4 py-3 align-top">
                    {ov ? (
                      <div className="space-y-1.5">
                        <select
                          value={ov.disposition}
                          onChange={(e) => setOverride(it.mpn, { disposition: e.target.value as Disposition })}
                          className="w-full bg-slate-900 border border-neon-cyan/40 rounded px-2 py-1 text-[11px] text-white"
                        >
                          {DISPOSITIONS.map((d) => (
                            <option key={d} value={d}>
                              {presentDisposition(d).label}
                            </option>
                          ))}
                        </select>
                        <input
                          value={ov.reason}
                          onChange={(e) => setOverride(it.mpn, { reason: e.target.value })}
                          placeholder="reason required — why is this disposition correct?"
                          // Capture-why is structural: focus the reason the moment the override is
                          // created so it's obvious a reason is required before Resolve un-grays.
                          autoFocus
                          className={`w-full bg-slate-900 border rounded px-2 py-1 text-[10px] text-white placeholder:text-slate-600 ${
                            reasonMissing ? "border-red-500/60 ring-1 ring-red-500/40" : "border-white/10"
                          }`}
                        />
                      </div>
                    ) : it.needs_review ? (
                      // Unverified + not yet individually handled — a mandatory exception, NOT an
                      // accepted member of the bulk. It blocks submit until overridden.
                      <span className="inline-flex items-center gap-1 text-amber-400 text-[10px] uppercase tracking-tighter">
                        <AlertTriangle className="w-3 h-3" /> unverified — override required
                      </span>
                    ) : pres ? (
                      <div>
                        <span className={`text-xs ${TONE_ACCENT[pres.tone]}`}>{pres.label}</span>
                        <p className="text-[9px] text-slate-500 mt-0.5 leading-relaxed max-w-[15rem]">
                          {pres.detail}
                        </p>
                      </div>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-red-400 text-[10px] uppercase tracking-tighter">
                        <AlertTriangle className="w-3 h-3" /> needs a disposition
                      </span>
                    )}
                  </td>

                  {/* Replacement / LTB */}
                  <td className="px-4 py-3 align-top text-[10px] text-slate-400">
                    {it.replacement_mpn && <div className="break-all">→ {it.replacement_mpn}</div>}
                    {it.ltb_date && <div className="text-slate-500">LTB {it.ltb_date}</div>}
                    {!it.replacement_mpn && !it.ltb_date && <span className="text-slate-600">—</span>}
                  </td>

                  {/* Override toggle */}
                  <td className="px-4 py-3 align-top text-right">
                    {ov ? (
                      <button
                        onClick={() => clearOverride(it.mpn)}
                        disabled={submitting || resolved}
                        className="inline-flex items-center gap-1 px-2 py-1 rounded border border-white/15 text-slate-300 text-[10px] uppercase tracking-tighter hover:bg-white/5 disabled:opacity-40 cursor-pointer"
                      >
                        <Undo2 className="w-3 h-3" /> Accept
                      </button>
                    ) : (
                      <button
                        onClick={() => setOverride(it.mpn, {})}
                        disabled={submitting || resolved}
                        className={`inline-flex items-center gap-1 px-2 py-1 rounded border text-[10px] uppercase tracking-tighter disabled:opacity-40 cursor-pointer ${
                          it.needs_review
                            ? "border-amber-500/50 text-amber-400 hover:bg-amber-500/10"
                            : "border-neon-cyan/40 text-neon-cyan hover:bg-neon-cyan/10"
                        }`}
                      >
                        {it.needs_review ? "Disposition *" : `Override${rowNeedsDisp ? " *" : ""}`}
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Footer / submit */}
      <div className="flex items-center justify-between gap-3 px-4 py-3 border-t border-white/10 bg-white/5">
        <div className="text-[10px] font-mono text-slate-500 uppercase tracking-tighter">
          {needsDisposition.length > 0 ? (
            <span className="text-red-400">{needsDisposition.length} row(s) need a disposition</span>
          ) : unhandledUnverified.length > 0 ? (
            <span className="text-amber-400">
              {unhandledUnverified.length} unverified row(s) need individual disposition
            </span>
          ) : missingReason.length > 0 ? (
            <span className="text-red-400">{missingReason.length} override(s) need a reason</span>
          ) : (
            <span>
              {Object.keys(overrides).length} exception(s) · {batch.items.length - Object.keys(overrides).length} accepted
            </span>
          )}
        </div>
        <button
          onClick={submit}
          disabled={!canSubmit}
          title={
            canSubmit
              ? undefined
              : unhandledUnverified.length > 0
                ? `Disposition the ${unhandledUnverified.length} unverified row(s) first`
                : missingReason.length > 0
                  ? `Add a reason to ${missingReason.length} override(s) — capture-why is required`
                  : needsDisposition.length > 0
                    ? `${needsDisposition.length} row(s) still need a disposition`
                    : "Nothing to resolve"
          }
          className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded bg-neon-green/10 border border-neon-green/50 text-neon-green text-[11px] font-mono uppercase tracking-widest hover:bg-neon-green/20 disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer"
        >
          <CheckCircle2 className="w-3.5 h-3.5" />
          {resolved ? "Resolved" : submitting ? "Resolving…" : `Resolve ${batch.items.length}`}
        </button>
      </div>
    </motion.div>
  );
}
