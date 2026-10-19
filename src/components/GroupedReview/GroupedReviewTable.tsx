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
import { PackageX, AlertTriangle, CheckCircle2, Undo2, ShieldAlert, FileSearch, Trash2, Pencil, Plus } from "lucide-react";
import { useEvidenceStore } from "@/store/useEvidenceStore";
import { useStageStore } from "@/store/useStageStore";
import { toast } from "sonner";
import { formatRequestedBy } from "@/lib/requestedBy";
import {
  DISPOSITIONS,
  presentDisposition,
  type Disposition,
} from "@/lib/dispositions";
import { actOnHumanTask, type GroupedRejectCode, type RowEdits } from "@/api/client";
import { actFailureFallback, actRefusal, buildRowEdits, isReviewRowEditsEnabled } from "@/lib/reviewRowEdits";
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
//
// Row edits (VITE_REVIEW_ROW_EDITS) ride the same cache entry: deleted (+ reason), added MPNs, and
// corrected MPN text, ALL keyed by the ORIGINAL extracted mpn (the idempotency key). With the flag
// off the three extra maps simply stay empty.
interface ReviewDraft {
  overrides: Record<string, OverrideDraft>;
  deleted: Record<string, { reason: string }>;
  added: string[];
  corrected: Record<string, string>;
  /** evidence for each added row (keyed by its mpn) and each correction (keyed by the EXTRACTED mpn) */
  addedEvidence: Record<string, string>;
  correctedEvidence: Record<string, string>;
}
const reviewDraftCache = new Map<string, ReviewDraft>();

/** A refused /act names what the platform said (row_edits_invalid lists every problem); the draft is
 *  kept, since only the success path consumes it. Nothing recognisable: the status, or "no answer". */
function refused(verb: "Resolve" | "Reject", err: unknown) {
  const r = actRefusal(err);
  if (!r) toast.error(actFailureFallback(verb, err));
  else toast.error(r.title, r.description ? { description: r.description, duration: 15000 } : undefined);
}

/** The three reasons a whole notice can be rejected for. Order is the display order. */
export const REJECT_REASONS = [
  { code: "not_a_notice", label: "Not a PCN/PDN" },
  { code: "parts_list_unusable", label: "Parts list unusable" },
  { code: "superseded_or_duplicate", label: "Superseded or duplicate notice" },
] as const;

type Row = ReviewItem & { added?: boolean };

export function GroupedReviewTable({
  batch,
  onResolved,
  maxPreviewRows,
}: {
  batch: ReviewBatch;
  onResolved?: (result: { items_resolved: number }) => void;
  // Overview-zoom preview cap (declared by the citizen shell for the "dense" tier).
  // Renders the first N rows + a "⌄ K more" affordance so a long list scales by
  // width (readable) instead of by height, and the footer stays above the fold.
  // Unset (focus/full view) = render every row, as before.
  maxPreviewRows?: number;
}) {
  const previewServerItems =
    maxPreviewRows != null ? batch.items.slice(0, maxPreviewRows) : batch.items;
  const hiddenCount = batch.items.length - previewServerItems.length;
  // Only the EXCEPTIONS are held in state; presence of a key means the row is
  // overridden. Initialize from the draft cache so a remount restores the edit.
  const rowEdits = isReviewRowEditsEnabled();
  const [overrides, setOverrides] = useState<Record<string, OverrideDraft>>(
    () => reviewDraftCache.get(batch.batch_id)?.overrides ?? {}
  );
  const [deleted, setDeleted] = useState<Record<string, { reason: string }>>(
    () => reviewDraftCache.get(batch.batch_id)?.deleted ?? {}
  );
  const [addedMpns, setAddedMpns] = useState<string[]>(
    () => reviewDraftCache.get(batch.batch_id)?.added ?? []
  );
  const [corrected, setCorrected] = useState<Record<string, string>>(
    () => reviewDraftCache.get(batch.batch_id)?.corrected ?? {}
  );
  const [addedEvidence, setAddedEvidence] = useState<Record<string, string>>(
    () => reviewDraftCache.get(batch.batch_id)?.addedEvidence ?? {}
  );
  const [correctedEvidence, setCorrectedEvidence] = useState<Record<string, string>>(
    () => reviewDraftCache.get(batch.batch_id)?.correctedEvidence ?? {}
  );
  const [submitting, setSubmitting] = useState(false);
  const [resolved, setResolved] = useState(false);
  // transient UI (not drafted): the add input, the inline correct editor, the reject panel
  const [addOpen, setAddOpen] = useState(false);
  const [addValue, setAddValue] = useState("");
  const [addEvidence, setAddEvidence] = useState("");
  const [addError, setAddError] = useState<string | null>(null);
  const [editing, setEditing] = useState<{ mpn: string; value: string; evidence: string; error: string | null } | null>(null);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [rejectCode, setRejectCode] = useState<string | null>(null);

  // Persist every change to the cache so it outlives a remount.
  useEffect(() => {
    reviewDraftCache.set(batch.batch_id, {
      overrides,
      deleted,
      added: addedMpns,
      corrected,
      addedEvidence,
      correctedEvidence,
    });
  }, [batch.batch_id, overrides, deleted, addedMpns, corrected, addedEvidence, correctedEvidence]);

  // The rows on the table: the server's items plus (flag on) the approver's added parts. Flag off,
  // the two draft collections are empty and this is exactly batch.items.
  const rows: Row[] = useMemo(
    () => [
      ...batch.items,
      ...(rowEdits
        ? addedMpns.map((mpn): Row => ({ mpn, proposed_disposition: null, needs_review: false, subject: null, added: true }))
        : []),
    ],
    [batch.items, addedMpns, rowEdits]
  );
  const isDeleted = (mpn: string) => rowEdits && !!deleted[mpn];
  /** What the row SHOWS as its MPN: the correction if any, else the extracted value. */
  const shownMpn = (mpn: string) => (rowEdits ? corrected[mpn] ?? mpn : mpn);

  // Summon the evidence card for a part — the document region its value came
  // from. Subordinate to this review; leaves when the review does.
  const summon = useEvidenceStore((s) => s.summon);
  const summoned = useEvidenceStore((s) => s.summoned);
  // The part whose evidence is open FOR THIS review — the row that must visually
  // PAIR with the evidence header ("Evidence · <mpn>"), so a reviewer studying the
  // now-majority crop never loses which row the decision belongs to (the review
  // yields SPACE but keeps PRIMACY; this is the connector that keeps it legible).
  const summonedMpn =
    summoned && summoned.reviewId === batch.batch_id ? summoned.mpn : null;
  const showSource = (mpn: string) => {
    summon({ reviewId: batch.batch_id, noticeId: batch.notice_id, mpn });
    // Open the composite (review + evidence flap) so the flap has room to dock —
    // "the review card makes place for the evidence card."
    useStageStore.getState().openFullPane();
  };

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
    for (const it of rows) {
      if (rowEdits && deleted[it.mpn]) {
        // a removed row owes its reason (capture-why) and nothing else — no disposition, no override
        if (deleted[it.mpn]!.reason.trim() === "") mr.push(it.mpn);
        continue;
      }
      const ov = overrides[it.mpn];
      if (!effectiveDisposition(it, ov)) nd.push(it.mpn);
      if (ov && ov.reason.trim() === "") mr.push(it.mpn);
      if (it.needs_review && !ov) uu.push(it.mpn); // unverified + not individually handled
    }
    return { needsDisposition: nd, missingReason: mr, unhandledUnverified: uu };
  }, [rows, overrides, deleted, rowEdits]);

  // Row edits the platform would 422: a required field that is blank after trim. The producer
  // (RowEdits, every string non-blank) is the contract; this names each incomplete row so the
  // approver sees WHICH one. A delete's reason is already counted in missingReason above.
  const missingEvidence = useMemo(() => {
    if (!rowEdits) return [] as string[];
    const out: string[] = [];
    for (const m of addedMpns) if ((addedEvidence[m] ?? "").trim() === "") out.push(m);
    for (const [m, v] of Object.entries(corrected)) {
      if (deleted[m]) continue;
      if (v.trim() === "" || (correctedEvidence[m] ?? "").trim() === "") out.push(m);
    }
    return out;
  }, [rowEdits, addedMpns, addedEvidence, corrected, correctedEvidence, deleted]);

  const canSubmit =
    !submitting &&
    !resolved &&
    needsDisposition.length === 0 &&
    missingReason.length === 0 &&
    missingEvidence.length === 0 &&
    unhandledUnverified.length === 0;

  const needsReviewCount = useMemo(
    () => rows.filter((i) => i.needs_review && !(rowEdits && deleted[i.mpn])).length,
    [rows, deleted, rowEdits]
  );
  const activeCount = rows.filter((r) => !isDeleted(r.mpn)).length;
  // Added rows are the approver's own work: never hidden behind the preview cap.
  const previewItems: Row[] = [...previewServerItems, ...rows.filter((r) => r.added)];
  const exceptionCount = Object.keys(overrides).filter((m) => !isDeleted(m)).length;

  // ---- row-edit handlers (flag on only; the controls that call them are not rendered otherwise) ----
  const takenMpns = (except?: string) => {
    const set = new Set<string>();
    for (const r of rows) {
      if (r.mpn === except) continue;
      set.add(r.mpn.toLowerCase());
      set.add(shownMpn(r.mpn).toLowerCase());
    }
    return set;
  };
  const deleteRow = (mpn: string) => {
    if (rows.find((r) => r.mpn === mpn)?.added) {
      // an added row was never extracted: removing it just takes it back, no reason owed
      setAddedMpns((p) => p.filter((m) => m !== mpn));
      setAddedEvidence((p) => {
        const next = { ...p };
        delete next[mpn];
        return next;
      });
      clearOverride(mpn);
      return;
    }
    setDeleted((p) => ({ ...p, [mpn]: { reason: "" } }));
    if (editing?.mpn === mpn) setEditing(null);
  };
  const undoDelete = (mpn: string) =>
    setDeleted((p) => {
      const next = { ...p };
      delete next[mpn];
      return next;
    });
  const commitAdd = () => {
    const mpn = addValue.trim();
    if (mpn === "") return setAddError("Enter a part number (MPN).");
    if (takenMpns().has(mpn.toLowerCase())) return setAddError(`${mpn} is already a row in this review.`);
    if (addEvidence.trim() === "") return setAddError("Enter the evidence for this part.");
    setAddedMpns((p) => [...p, mpn]);
    setAddedEvidence((p) => ({ ...p, [mpn]: addEvidence.trim() }));
    setAddValue("");
    setAddEvidence("");
    setAddError(null);
    setAddOpen(false);
  };
  const commitCorrection = () => {
    if (!editing) return;
    const value = editing.value.trim();
    if (value === "") return setEditing({ ...editing, error: "Enter a part number (MPN)." });
    if (value !== editing.mpn && value.toLowerCase() === editing.mpn.toLowerCase()) {
      return setEditing({ ...editing, error: `${value} is the extracted part number (case-insensitive) — a correction must change it.` });
    }
    if (takenMpns(editing.mpn).has(value.toLowerCase())) {
      return setEditing({ ...editing, error: `${value} collides with another row in this review.` });
    }
    const unchanged = value === editing.mpn; // back to the extracted value = no correction
    // A blank evidence is NOT refused here: the correction lands, Resolve stays disabled naming this
    // row (missingEvidence), and the pencil reopens the editor prefilled. Same shape as a delete's reason.
    setCorrected((p) => {
      const next = { ...p };
      if (unchanged) delete next[editing.mpn];
      else next[editing.mpn] = value;
      return next;
    });
    setCorrectedEvidence((p) => {
      const next = { ...p };
      if (unchanged) delete next[editing.mpn];
      else next[editing.mpn] = editing.evidence.trim();
      return next;
    });
    setEditing(null);
  };

  const submit = async () => {
    setSubmitting(true);
    try {
      // ONLY the exceptions travel — {mpn: {disposition, reason}}. Every other row takes its proposed
      // disposition (accept-all). Submitted through the /act bridge (single durable decision path).
      const overridesDict: Record<string, { disposition: string; reason: string }> = {};
      const addedSet = new Set(addedMpns);
      for (const [mpn, o] of Object.entries(overrides)) {
        // a deleted row's override is dead; an added row travels in row_edits.added, not overrides
        // (the platform knows no such mpn). Flag off, both sets are empty and nothing is skipped.
        if (rowEdits && (deleted[mpn] || addedSet.has(mpn))) continue;
        overridesDict[mpn] = { disposition: o.disposition, reason: o.reason.trim() };
      }
      let edits: RowEdits | undefined;
      if (rowEdits) {
        edits = buildRowEdits({ deleted, addedMpns, corrected, overrides, addedEvidence, correctedEvidence });
      }
      const res = await actOnHumanTask(batch.batch_id, "approved", "", overridesDict, edits);
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
      const resp = (err as { response?: { status?: number; data?: { detail?: Record<string, unknown> } } })?.response;
      const status = resp?.status;
      const detail = resp?.data?.detail;
      if (status === 409 && detail?.error === "task_already_resolved") {
        // A TEAMMATE resolved it first (any-one-of-the-audience acts for the team).
        // Tell the truth WITH provenance — who settled it and when — instead of the
        // old misleading "no longer available", and DO NOT discard this reviewer's
        // work: the draft cache is deliberately left intact (only the success path
        // deletes it), so their unsent overrides stay on screen to read or re-use.
        const who = typeof detail.acted_by === "string" ? formatRequestedBy(detail.acted_by) : "another reviewer";
        const at = typeof detail.acted_at === "number"
          ? new Date(detail.acted_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
          : null;
        const drafted = Object.keys(overrides).length;
        toast.error(`Already resolved by ${who}${at ? ` at ${at}` : ""}`, {
          description: drafted
            ? `Your ${drafted} unsent change${drafted === 1 ? "" : "s"} ${drafted === 1 ? "is" : "are"} kept below — nothing was applied.`
            : "This review was settled by a member of its audience; nothing was applied.",
          duration: 10000,
        });
        // Reflect the settled truth (disables further editing) WITHOUT clearing the
        // draft — the rows stay visible so the reviewer can read back what they wrote.
        setResolved(true);
        return;
      }
      if (status === 403) toast.error("Not authorized to resolve this batch");
      else if (status === 404) toast.error("Review no longer available");
      else refused("Resolve", err);
    } finally {
      setSubmitting(false);
    }
  };

  // Narrow Reject (flag on only). `reason_code` is the enum value; a reject never carries row_edits.
  const reject = async () => {
    const reason = REJECT_REASONS.find((r) => r.code === rejectCode);
    if (!reason) return;
    setSubmitting(true);
    try {
      // reason_code is its own field (the platform 422s a grouped reject without it); the comment
      // keeps the human-readable line.
      const res = await actOnHumanTask(
        batch.batch_id,
        "rejected",
        `${reason.code}: ${reason.label}`,
        undefined,
        undefined,
        reason.code as GroupedRejectCode
      );
      if (res.accepted === false) {
        toast.error(res.reason ? `Refused — ${res.reason}` : "Rejection refused — still pending");
        return;
      }
      reviewDraftCache.delete(batch.batch_id);
      setResolved(true);
      setRejectOpen(false);
      toast.success(`Rejected — ${reason.label}`);
      onResolved?.({ items_resolved: 0 });
    } catch (err) {
      const status = (err as { response?: { status?: number } })?.response?.status;
      if (status === 403) toast.error("Not authorized to reject this batch");
      else if (status === 404) toast.error("Review no longer available");
      else if (status === 501) toast.error("Reject is not wired on the platform yet");
      else refused("Reject", err);
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
            {batch.notice_type} {batch.notice_id} · {activeCount} parts
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

      {/* EXTRACTION-QUALITY WARNINGS — above the table, before any disposition is chosen.
          These say the parts list itself may be INCOMPLETE (a vision crop timed out, the
          header pass failed), which no per-row badge can express: the rows that ARE here
          look fine, and the missing ones are invisible. Without this the reviewer
          dispositions a partial list believing it complete, and the absent parts silently
          never get one. Proceeding on degraded extraction is fine; proceeding silently
          is not. Empty/absent on a clean extraction — no banner, no noise. */}
      {(batch.extraction_warnings?.length ?? 0) > 0 && (
        <div className="px-4 py-3 border-b border-amber-500/30 bg-amber-500/10">
          <div className="flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
            <div className="min-w-0">
              <p className="font-mono text-[10px] font-bold text-amber-300 uppercase tracking-widest">
                Extraction incomplete — this list may be missing parts
              </p>
              <ul className="mt-1 space-y-0.5">
                {batch.extraction_warnings!.map((w, i) => (
                  <li key={i} className="text-[11px] text-amber-200/90 leading-snug">
                    · {w}
                  </li>
                ))}
              </ul>
              <p className="mt-1.5 text-[10px] text-amber-200/70 leading-snug">
                Verify against the source document before resolving — parts absent from this
                table receive no disposition.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Table */}
      <div className="overflow-x-auto font-mono">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-slate-900/50">
              {[
                { c: "Part (MPN)", w: "" },            // sized to the MPN (nowrap) — one line
                { c: "Disposition", w: "w-[8.5rem]" }, // FIXED — its content may wrap 2 lines
                { c: "Replacement / LTB", w: "" },     // sized to the number (nowrap) — one line
                { c: "", w: "w-[5.5rem]" },            // FIXED — the action button (may wrap)
              ].map(({ c, w }) => (
                <th
                  key={c || "action"}
                  className={`px-2.5 py-2.5 text-[10px] font-bold text-slate-500 uppercase tracking-wider border-b border-white/5 ${w}`}
                >
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {previewItems.map((it) => {
              const ov = overrides[it.mpn];
              const eff = effectiveDisposition(it, ov);
              const pres = eff ? presentDisposition(eff) : null;
              const rowNeedsDisp = !eff;
              const reasonMissing = !!ov && ov.reason.trim() === "";
              if (isDeleted(it.mpn)) {
                // A deleted row STAYS VISIBLE (struck through, dimmed) with an undo — removal is
                // reversible until submit — and owes its reason like any other exception.
                const dr = deleted[it.mpn]!;
                return (
                  <tr key={it.mpn} data-review-row-deleted={it.mpn} className="bg-red-500/5">
                    <td colSpan={3} className="px-2.5 py-3 align-top">
                      <div className="flex items-center gap-2">
                        <span className="text-sm whitespace-nowrap line-through text-slate-500 opacity-60">
                          {shownMpn(it.mpn)}
                        </span>
                        <input
                          data-review-row-delete-reason
                          value={dr.reason}
                          onChange={(e) => setDeleted((p) => ({ ...p, [it.mpn]: { reason: e.target.value } }))}
                          disabled={submitting || resolved}
                          placeholder="reason required — why is this not a part of the notice?"
                          className={`flex-1 min-w-0 bg-slate-900 border rounded px-2 py-1 text-[10px] text-white placeholder:text-slate-600 ${
                            dr.reason.trim() === "" ? "border-red-500/60 ring-1 ring-red-500/40" : "border-white/10"
                          }`}
                        />
                      </div>
                    </td>
                    <td className="px-2.5 py-3 align-top text-right">
                      <button
                        data-review-row-undo
                        onClick={() => undoDelete(it.mpn)}
                        disabled={submitting || resolved}
                        className="inline-flex items-center gap-1 px-2 py-1 rounded border border-white/15 text-slate-300 text-[10px] uppercase tracking-tighter hover:bg-white/5 disabled:opacity-40 cursor-pointer"
                      >
                        <Undo2 className="w-3 h-3" /> Undo
                      </button>
                    </td>
                  </tr>
                );
              }
              return (
                <tr
                  key={it.mpn}
                  className={`transition-colors ${
                    it.mpn === summonedMpn
                      // Strong selected state that PAIRS with the evidence header
                      // (both neon-pink) — the reviewer's anchor between the crop
                      // being studied and the row the decision belongs to.
                      ? "bg-neon-pink/10 ring-1 ring-inset ring-neon-pink/40"
                      : it.needs_review
                        ? "bg-amber-500/5"
                        : ""
                  }`}
                >
                  {/* Part */}
                  <td className="px-2.5 py-3 align-top">
                    <div className="flex items-center gap-2">
                      {/* B1: part reads at text-sm so it's comfortably legible next
                          to the enlarged crop (no eye-zoom between the two). When its
                          evidence is open, it emphasizes + goes neon-pink to pair with
                          the evidence header. */}
                      <span
                        // MPN is a critical identifier — it must ALWAYS read on one
                        // line. break-all split it char-by-char in the narrow sidebar;
                        // whitespace-nowrap keeps it whole (the table scrolls-x if a
                        // long MPN needs it) so the eye never reassembles a part number.
                        className={`text-sm whitespace-nowrap ${
                          it.mpn === summonedMpn ? "font-semibold text-neon-pink" : "text-white"
                        }`}
                      >
                        {shownMpn(it.mpn)}
                      </span>
                      {rowEdits && corrected[it.mpn] && (
                        <>
                          {/* the EXTRACTED value stays on screen beside the correction */}
                          <s data-review-row-extracted className="text-[10px] text-slate-500 whitespace-nowrap">
                            {it.mpn}
                          </s>
                          <span
                            data-review-row-corrected
                            className="px-1.5 py-0.5 rounded border border-neon-cyan/40 bg-neon-cyan/10 text-neon-cyan text-[8px] font-bold uppercase tracking-tighter shrink-0"
                          >
                            corrected
                          </span>
                        </>
                      )}
                      {it.added && (
                        <span
                          data-review-row-added
                          className="px-1.5 py-0.5 rounded border border-neon-green/40 bg-neon-green/10 text-neon-green text-[8px] font-bold uppercase tracking-tighter shrink-0"
                        >
                          added
                        </span>
                      )}
                      {!it.added && (
                      <button
                        onClick={() => showSource(it.mpn)}
                        title="Show where this came from in the notice"
                        className="text-slate-500 hover:text-neon-pink transition-colors shrink-0"
                      >
                        <FileSearch className="w-3 h-3" />
                      </button>
                      )}
                      {rowEdits && !it.added && (
                        <button
                          data-review-row-edit
                          onClick={() => setEditing({ mpn: it.mpn, value: shownMpn(it.mpn), evidence: correctedEvidence[it.mpn] ?? "", error: null })}
                          disabled={submitting || resolved}
                          title="Correct this part number"
                          className="text-slate-500 hover:text-neon-cyan transition-colors shrink-0 disabled:opacity-40"
                        >
                          <Pencil className="w-3 h-3" />
                        </button>
                      )}
                      {rowEdits && (
                        <button
                          data-review-row-delete
                          onClick={() => deleteRow(it.mpn)}
                          disabled={submitting || resolved}
                          title={it.added ? "Take this added part back" : "Remove this row — not a part of the notice"}
                          className="text-slate-500 hover:text-red-400 transition-colors shrink-0 disabled:opacity-40"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      )}
                      {it.needs_review && (
                        <span
                          title="MPN extraction uncertain — verify before dispatching an action"
                          className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded border border-amber-500/40 bg-amber-500/10 text-amber-400 text-[8px] font-bold uppercase tracking-tighter shrink-0"
                        >
                          <AlertTriangle className="w-2.5 h-2.5" /> Unverified
                        </span>
                      )}
                    </div>
                    {rowEdits && editing?.mpn === it.mpn && (
                      <div className="mt-1.5 space-y-1">
                        <div className="flex items-center gap-1.5">
                          <input
                            data-review-row-edit-input
                            value={editing.value}
                            onChange={(e) => setEditing({ ...editing, value: e.target.value, error: null })}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") commitCorrection();
                              if (e.key === "Escape") setEditing(null);
                            }}
                            autoFocus
                            className="bg-slate-900 border border-neon-cyan/40 rounded px-2 py-1 text-[11px] text-white"
                          />
                          <button
                            data-review-row-edit-apply
                            onClick={commitCorrection}
                            className="px-2 py-1 rounded border border-neon-cyan/40 text-neon-cyan text-[10px] uppercase tracking-tighter hover:bg-neon-cyan/10 cursor-pointer"
                          >
                            Apply
                          </button>
                          <button
                            onClick={() => setEditing(null)}
                            className="px-2 py-1 rounded border border-white/15 text-slate-300 text-[10px] uppercase tracking-tighter hover:bg-white/5 cursor-pointer"
                          >
                            Cancel
                          </button>
                        </div>
                        <input
                          data-review-row-edit-evidence
                          value={editing.evidence}
                          onChange={(e) => setEditing({ ...editing, evidence: e.target.value, error: null })}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") commitCorrection();
                            if (e.key === "Escape") setEditing(null);
                          }}
                          placeholder="evidence for the correction"
                          className="w-full bg-slate-900 border border-neon-cyan/40 rounded px-2 py-1 text-[11px] text-white placeholder:text-slate-600"
                        />
                        {editing.error && (
                          <p data-review-row-edit-error className="text-[10px] text-red-400">{editing.error}</p>
                        )}
                      </div>
                    )}
                    {it.subject == null && !it.added && (
                      <p className="text-[9px] text-slate-600 mt-1 uppercase tracking-tighter">
                        no catalog subject
                      </p>
                    )}
                  </td>

                  {/* Disposition */}
                  <td className="px-2.5 py-3 align-top">
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
                  <td className="px-2.5 py-3 align-top text-[10px] text-slate-400">
                    {it.replacement_mpn && <div className="whitespace-nowrap">→ {it.replacement_mpn}</div>}
                    {it.ltb_date && <div className="text-slate-500">LTB {it.ltb_date}</div>}
                    {!it.replacement_mpn && !it.ltb_date && <span className="text-slate-600">—</span>}
                  </td>

                  {/* Override toggle. When a row IS overridden this button CANCELS the
                      override (reverts the row to the system default) — it is NOT a
                      per-row confirm. The override is already live as you edit it; the
                      only submit is the footer "Resolve N". Labeling it "Accept" read as
                      "confirm my override" and made approvers discard their own edit, so
                      it pairs with "Override" as its literal inverse: Override ↔ Cancel. */}
                  <td className="px-2.5 py-3 align-top text-right">
                    {ov ? (
                      <button
                        onClick={() => clearOverride(it.mpn)}
                        disabled={submitting || resolved}
                        title="Discard this override — revert the row to the system-proposed disposition"
                        className="inline-flex items-center gap-1 px-2 py-1 rounded border border-white/15 text-slate-300 text-[10px] uppercase tracking-tighter hover:bg-white/5 disabled:opacity-40 cursor-pointer"
                      >
                        <Undo2 className="w-3 h-3" /> Cancel
                      </button>
                    ) : (
                      <button
                        onClick={() => {
                          setOverride(it.mpn, {});
                          // The unverified row exists BECAUSE verification failed —
                          // summon its evidence eagerly as the override form opens,
                          // so the reason field isn't asking the human to attest to
                          // something they were given no way to check.
                          if (it.needs_review) showSource(it.mpn);
                        }}
                        disabled={submitting || resolved}
                        className={`inline-flex items-center gap-1 px-2 py-1 rounded border text-[10px] uppercase tracking-tighter disabled:opacity-40 cursor-pointer ${
                          it.needs_review
                            ? "border-amber-500/50 text-amber-400 hover:bg-amber-500/10"
                            : "border-neon-cyan/40 text-neon-cyan hover:bg-neon-cyan/10"
                        }`}
                      >
                        {it.needs_review
                          ? "Disposition *"
                          : rowNeedsDisp
                            // No system-proposed disposition — the approver is SETTING one, not
                            // overriding a proposal that never existed. "Override" here read as
                            // "override what?" for every part when the proposer abstained.
                            ? "Set disposition *"
                            : "Override"}
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
            {/* Count-remaining affordance (dense-tier preview): "⌄ K more" reads as
                designed; silent truncation reads as a bug. The full list is one
                zoom/open away — this is a scan surface, not the acting surface. */}
            {hiddenCount > 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-2 text-center text-[11px] font-mono uppercase tracking-widest text-neon-cyan/70">
                  ⌄ {hiddenCount} more part{hiddenCount === 1 ? "" : "s"} · open to review all {batch.items.length}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* ROW EDITS (flag on): add a part the extraction missed. The row has no proposal, so it needs
          an override disposition + reason like any null-proposal row — the blocker logic is shared. */}
      {rowEdits && (
        <div className="px-4 py-2 border-t border-white/10">
          {addOpen ? (
            <div className="space-y-1">
              <div className="flex items-center gap-1.5">
                <input
                  data-review-row-add-input
                  value={addValue}
                  onChange={(e) => {
                    setAddValue(e.target.value);
                    setAddError(null);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") commitAdd();
                    if (e.key === "Escape") setAddOpen(false);
                  }}
                  placeholder="part number (MPN)"
                  autoFocus
                  className="bg-slate-900 border border-neon-green/40 rounded px-2 py-1 text-[11px] text-white placeholder:text-slate-600"
                />
                <button
                  data-review-row-add-confirm
                  onClick={commitAdd}
                  className="px-2 py-1 rounded border border-neon-green/40 text-neon-green text-[10px] uppercase tracking-tighter hover:bg-neon-green/10 cursor-pointer"
                >
                  Add
                </button>
                <button
                  onClick={() => {
                    setAddOpen(false);
                    setAddError(null);
                    setAddEvidence("");
                  }}
                  className="px-2 py-1 rounded border border-white/15 text-slate-300 text-[10px] uppercase tracking-tighter hover:bg-white/5 cursor-pointer"
                >
                  Cancel
                </button>
              </div>
              <input
                data-review-row-add-evidence
                value={addEvidence}
                onChange={(e) => {
                  setAddEvidence(e.target.value);
                  setAddError(null);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") commitAdd();
                  if (e.key === "Escape") setAddOpen(false);
                }}
                placeholder="evidence (where in the notice)"
                className="w-full bg-slate-900 border border-neon-green/40 rounded px-2 py-1 text-[11px] text-white placeholder:text-slate-600"
              />
              {addError && <p data-review-row-add-error className="text-[10px] text-red-400">{addError}</p>}
            </div>
          ) : (
            <button
              data-review-row-add
              onClick={() => setAddOpen(true)}
              disabled={submitting || resolved}
              className="inline-flex items-center gap-1 text-[10px] font-mono uppercase tracking-tighter text-slate-400 hover:text-neon-green disabled:opacity-40 cursor-pointer"
            >
              <Plus className="w-3 h-3" /> Add part
            </button>
          )}
        </div>
      )}

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
          ) : missingEvidence.length > 0 ? (
            <span data-review-incomplete className="text-red-400">
              Incomplete edit — evidence missing: {missingEvidence.join(", ")}
            </span>
          ) : (
            <span>
              {exceptionCount} exception(s) · {activeCount - exceptionCount} accepted
            </span>
          )}
        </div>
        <div className="flex items-center gap-3">
        {rowEdits && (
          <button
            data-review-reject
            onClick={() => setRejectOpen((o) => !o)}
            disabled={submitting || resolved}
            className="text-[10px] font-mono uppercase tracking-tighter text-slate-500 underline-offset-2 hover:text-slate-300 hover:underline disabled:opacity-40 cursor-pointer"
          >
            Reject…
          </button>
        )}
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
                  : missingEvidence.length > 0
                    ? `Add evidence to: ${missingEvidence.join(", ")}`
                    : needsDisposition.length > 0
                    ? `${needsDisposition.length} row(s) still need a disposition`
                    : "Nothing to resolve"
          }
          className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded bg-neon-green/10 border border-neon-green/50 text-neon-green text-[11px] font-mono uppercase tracking-widest hover:bg-neon-green/20 disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer"
        >
          <CheckCircle2 className="w-3.5 h-3.5" />
          {resolved ? "Resolved" : submitting ? "Resolving…" : `Resolve ${activeCount}`}
        </button>
        </div>
      </div>
      {rowEdits && rejectOpen && !resolved && (
        <div className="px-4 py-3 border-t border-white/10 bg-slate-900/40 space-y-2">
          <p className="text-[10px] font-mono uppercase tracking-widest text-slate-400">
            Reject this notice — pick the reason
          </p>
          <div role="radiogroup" className="space-y-1">
            {REJECT_REASONS.map((r) => (
              <label key={r.code} className="flex items-center gap-2 text-[11px] text-slate-300 cursor-pointer">
                <input
                  type="radio"
                  name={`reject-${batch.batch_id}`}
                  data-review-reject-reason={r.code}
                  checked={rejectCode === r.code}
                  onChange={() => setRejectCode(r.code)}
                />
                {r.label}
              </label>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <button
              data-review-reject-confirm
              onClick={reject}
              disabled={rejectCode === null || submitting}
              className="px-2 py-1 rounded border border-white/20 text-slate-200 text-[10px] uppercase tracking-tighter hover:bg-white/5 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
            >
              Confirm reject
            </button>
            <button
              onClick={() => {
                setRejectOpen(false);
                setRejectCode(null);
              }}
              className="px-2 py-1 rounded border border-white/10 text-slate-400 text-[10px] uppercase tracking-tighter hover:bg-white/5 cursor-pointer"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </motion.div>
  );
}
