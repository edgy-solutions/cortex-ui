import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { CheckCircle2, XCircle, FileSearch } from "lucide-react";
import { formatRequestedBy } from "@/lib/requestedBy";
import { verbLabel } from "@/lib/taskDeclaration";
import { isReviewRowEditsEnabled } from "@/lib/reviewRowEdits";
import { fetchIngestExtraction } from "@/lib/ingestTransport";
import {
  mergeReview,
  readExtraction,
  readPromotionHeader,
  rejectReason,
  reviewFlags,
  reviewRouteFailure,
  shaPrefix,
  type Extraction,
  type HeaderField,
  evidenceQuality,
  rowsSharingEvidence,
} from "@/lib/promotionReview";
import type { ApprovalTaskPayload } from "./ApprovalTaskCard";
import { useTaskAct } from "./useTaskAct";
import { isActBlocked, TaskActBlocked, TaskActNotices } from "./TaskActParts";
import { PdfEvidencePane } from "./PdfEvidencePane";

/**
 * THE PROMOTION REVIEW CARD — a `document_promotion` task vetted "in a few looks" (the
 * architect's review standard, overnight directive 2026-10-17):
 *
 *   top line   notice id (the title, never the sha), kind, manufacturer, notice date, N parts,
 *              attempt, dropped_by, sha prefix
 *   left       the extracted rows: mpn, change/field, extracted_value, obtained_via, and a "show"
 *              that jumps the PDF to the row's evidence
 *   right      the source PDF at the evidence page, the evidence box outlined; row 1's on open
 *   bottom     Promote / Reject (narrow codes)
 *
 * The test it is built to pass: a steward who has never seen the notice can confirm mpn + value
 * against the outlined crop for every row without scrolling the PDF by hand. `j`/`k` walk the rows
 * and the pane follows, so "every row" is one key per row.
 *
 * THE DECISION IS THE GENERIC CARD'S, NOT A COPY. `useTaskAct` is the one `/act` path, and the
 * blocked/done/refused states are `TaskActParts`, so this card cannot offer a verb the declaration
 * does not, send a reject without a reason, or claim a resume the gateway did not report.
 *
 * KEYBOARD, while the card has focus and no text field does:
 *   j / k     next / previous row
 *   p         ARMS promote; a second p, or Enter, sends it; Esc disarms. One key is too easy to hit
 *             on a surface whose every decision is archived (ADR-0034); a click on Promote is
 *             already deliberate and sends at once.
 *   r         opens the reject codes; 1–9 picks one; Enter sends it.
 *
 * CHIP RULE: bordered means clickable. Kind, codes and every fact on the top line are muted text.
 *
 * DATA: the top line from the task payload (193's header) and `GET /ingest/{id}/extraction`,
 * merged by `mergeReview`; the rows from the extraction alone; the PDF from `/source`. Each of the
 * two fetches fails on its own and says why, and the decision stays available either way.
 */
type ExtractionPhase = { phase: "loading" } | { phase: "ready"; ex: Extraction } | { phase: "failed"; why: string };

const HEADER_LABEL: Record<HeaderField, string> = {
  notice_id: "notice id",
  manufacturer: "manufacturer",
  notice_date: "notice date",
  attempt: "attempt",
  part_count: "part count",
};

function isObj(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}
const str = (v: unknown): string | null => (typeof v === "string" && v.trim() !== "" ? v : null);

export function PromotionReviewCard({ task, ingestId }: { task: ApprovalTaskPayload; ingestId: string }) {
  const a = useTaskAct(task);
  const { acting, act, verbs, needsReason } = a;
  const [sel, setSel] = useState(0);
  const [armed, setArmed] = useState(false);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [code, setCode] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const rootRef = useRef<HTMLDivElement | null>(null);
  const rowRefs = useRef<Array<HTMLTableRowElement | null>>([]);
  const [extraction, setExtraction] = useState<ExtractionPhase>({ phase: "loading" });

  useEffect(() => {
    let live = true;
    setExtraction({ phase: "loading" });
    fetchIngestExtraction(ingestId)
      .then((body) => {
        if (!live) return;
        const ex = readExtraction(body);
        setExtraction(ex ? { phase: "ready", ex } : { phase: "failed", why: "The extraction answered, but with no rows array to draw." });
      })
      .catch((err) => {
        if (live) setExtraction({ phase: "failed", why: reviewRouteFailure(err, "extraction") });
      });
    return () => {
      live = false;
    };
  }, [ingestId]);

  const payload = isObj(task.payload) ? task.payload : {};
  const droppedBy = isObj(payload.dropped_by) ? str(payload.dropped_by.authz_id) : str(payload.dropped_by);
  const header = useMemo(() => readPromotionHeader(task.payload), [task.payload]);
  const ex = extraction.phase === "ready" ? extraction.ex : null;
  const review = useMemo(() => mergeReview(header, ex), [header, ex]);
  const sha = ingestId;
  const flags = reviewFlags(review);
  const rows = review.rows;
  const selected = rows[sel] ?? null;
  const target = selected && selected.evidence.state === "ok" ? selected.evidence.ref : null;
  const targetQuality = selected ? evidenceQuality(selected.obtained_via) : "unknown";
  const targetShared = target ? rowsSharingEvidence(rows, target) : 0;

  const blocked = isActBlocked(a);
  const canAct = !blocked && !acting;
  const promoteVerb = verbs.includes("promoted") ? "promoted" : null;
  const rejectVerb = verbs.includes("rejected") ? "rejected" : null;
  const otherVerbs = verbs.filter((v) => v !== promoteVerb && v !== rejectVerb);

  useEffect(() => {
    rowRefs.current[sel]?.scrollIntoView?.({ block: "nearest" });
  }, [sel]);

  const select = (i: number) => {
    setSel(i);
    rootRef.current?.focus({ preventScroll: true });
  };
  const move = (d: number) => setSel((s) => Math.min(Math.max(s + d, 0), Math.max(rows.length - 1, 0)));

  const promote = () => {
    if (!canAct || !promoteVerb) return;
    setArmed(false);
    void act(promoteVerb, note);
  };
  const reject = () => {
    if (!canAct || !rejectVerb || !code) return;
    void act(rejectVerb, rejectReason(code, note));
  };

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    const el = e.target as HTMLElement;
    const typing = el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT" || el.isContentEditable;
    if (e.key === "Escape") {
      if (!armed && !rejectOpen) return;
      setArmed(false);
      setRejectOpen(false);
      e.preventDefault();
      return;
    }
    if (typing) return;
    if (e.key === "j") move(1);
    else if (e.key === "k") move(-1);
    else if (e.key === "p" && canAct && promoteVerb) {
      setRejectOpen(false);
      if (armed) promote();
      else setArmed(true);
    } else if (e.key === "r" && canAct && rejectVerb) {
      setArmed(false);
      setRejectOpen(true);
    } else if (rejectOpen && /^[1-9]$/.test(e.key) && review.rejectCodes[Number(e.key) - 1]) {
      setCode(review.rejectCodes[Number(e.key) - 1].code);
    } else if (e.key === "Enter" && el === rootRef.current && armed) promote();
    else if (e.key === "Enter" && el === rootRef.current && rejectOpen && code) reject();
    else return;
    e.preventDefault();
  };

  const topline: Array<[string, string]> = [
    ["kind", "kind ?"],
    ["manufacturer", review.manufacturer ?? "—"],
    ["notice-date", review.notice_date ?? "—"],
    ["parts", `${review.part_count ?? "?"} parts`],
    ["attempt", `attempt ${review.attempt ?? "?"}`],
    ["dropped-by", `dropped by ${droppedBy ?? "—"}`],
  ];

  return (
    <div
      ref={rootRef}
      tabIndex={0}
      onKeyDown={onKeyDown}
      className="glass-panel p-5 my-4 border-cyan-500/20 outline-none focus-visible:ring-1 focus-visible:ring-cyan-400/40"
      data-promotion-review
      aria-label={`Review ${review.notice_id ?? "document"}: j and k move between rows, p promotes, r rejects`}
    >
      {/* TOP LINE. The notice id is the title; the sha never is (it sits in the provenance line). */}
      <div className="mb-3">
        <div className="flex items-center gap-2 mb-1">
          <FileSearch className="w-4 h-4 text-neon-pink shrink-0" />
          <h3 className="text-lg font-bold text-white tracking-tight leading-none flex-1 break-all" data-review-title>
            {review.notice_id ?? "Document promotion"}
          </h3>
          <span className="text-[9px] font-mono uppercase tracking-widest text-slate-400" data-review-state>
            {a.done ? (a.done.resumed ? verbLabel(a.done.decision) : "recorded") : (task.task_state ?? "pending")}
          </span>
        </div>
        <p className="text-[11px] font-mono text-slate-300" data-review-topline>
          {topline.map(([k, v], i) => (
            <span key={k} data-topline={k} title={k === "kind" ? "PCN or PDN: not served by the payload or the extraction (asked of Lane 1)" : undefined}>
              {i > 0 && <span className="text-slate-600"> · </span>}
              {v}
            </span>
          ))}
          {sha && (
            <span data-topline="sha" title={sha}>
              <span className="text-slate-600"> · </span>
              {shaPrefix(sha)}
            </span>
          )}
        </p>
        <p className="mt-1 text-[10px] font-mono text-slate-500 break-all" data-review-provenance>
          {sha}
          {task.requested_by && <> · requested by {formatRequestedBy(task.requested_by)}</>}
          {" · "}
          {task.audience}
        </p>
      </div>

      {/* FLAGS — each a separate fact with a separate owner (promotionReview.ts). Muted, not chips. */}
      {((review.notice_id === null && extraction.phase !== "loading") ||
        review.headerConflicts.length > 0 ||
        (flags &&
          (flags.absentEvidence > 0 ||
            flags.malformedEvidence > 0 ||
            flags.partsMismatch ||
            flags.partsUnknown ||
            flags.evidenceCountMismatch ||
            flags.regionEvidence > 0 ||
            flags.unknownMethod > 0 ||
            (ex?.droppedRows ?? 0) > 0))) && (
        <ul className="mb-3 space-y-0.5 text-[11px] text-amber-400/90" data-review-flags>
          {review.notice_id === null && extraction.phase !== "loading" && (
            <li data-review-flag="no-notice-id">The notice id did not travel, so the title cannot name the notice.</li>
          )}
          {review.headerConflicts.length > 0 && (
            <li data-review-flag="header-conflict">
              The task and its extraction disagree on {review.headerConflicts.map((k) => HEADER_LABEL[k]).join(", ")}. The
              top line shows the task's.
            </li>
          )}
          {flags && flags.evidenceCountMismatch && (
            <li data-review-flag="evidence-count-mismatch">
              The extraction counts {flags.evidenceCountMismatch.served} row
              {flags.evidenceCountMismatch.served === 1 ? "" : "s"} without evidence; {flags.evidenceCountMismatch.drawn} drawn
              here have none.
            </li>
          )}
          {flags && flags.absentEvidence > 0 && (
            <li data-review-flag="absent-evidence">
              {flags.absentEvidence} row{flags.absentEvidence === 1 ? "" : "s"} carry no evidence_ref: nothing to check
              against (a corpus-gate miss).
            </li>
          )}
          {flags && flags.malformedEvidence > 0 && (
            <li data-review-flag="malformed-evidence">
              {flags.malformedEvidence} row{flags.malformedEvidence === 1 ? "" : "s"} carry an evidence_ref that cannot be read.
            </li>
          )}
          {flags?.partsMismatch && (
            <li data-review-flag="parts-mismatch">
              The notice declares {flags.partsMismatch.declared} parts; the rows name {flags.partsMismatch.drawn}.
            </li>
          )}
          {flags?.partsUnknown && (
            <li data-review-flag="parts-unknown">part_count did not travel, so the table cannot be shown to be whole.</li>
          )}
          {flags && flags.regionEvidence > 0 && (
            <li data-review-flag="region-evidence">
              {flags.regionEvidence} row{flags.regionEvidence === 1 ? "'s" : "s'"} outline is the whole table box, not the cell:
              find the row inside it.
            </li>
          )}
          {flags && flags.unknownMethod > 0 && (
            <li data-review-flag="unknown-method">
              {flags.unknownMethod} row{flags.unknownMethod === 1 ? "" : "s"} came by a method this card does not know; their
              outline is not claimed to be the cell.
            </li>
          )}
          {ex && ex.droppedRows > 0 && (
            <li data-review-flag="dropped-rows">
              {ex.droppedRows} row{ex.droppedRows === 1 ? "" : "s"} had no mpn and are not drawn.
            </li>
          )}
        </ul>
      )}

      <div className="grid gap-4 md:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
        {/* LEFT — the extracted rows. */}
        <div className="min-w-0">
          {extraction.phase === "loading" && (
            <p className="px-2 py-3 text-[11px] text-slate-500" data-extraction-state="loading">
              loading extraction…
            </p>
          )}
          {extraction.phase === "failed" && (
            <p className="px-2 py-3 text-[11px] text-amber-400/90" role="alert" data-extraction-failed>
              {extraction.why} There are no rows to vet against the source.
            </p>
          )}
          {ex && ex.rows.length === 0 && (
            <p className="px-2 py-3 text-[11px] text-amber-400/90" data-extraction-state="empty">
              The extraction has no rows.
            </p>
          )}
          <div className="max-h-[70vh] overflow-auto rounded border border-white/5" hidden={rows.length === 0}>
            <table className="w-full text-[11px] font-mono" data-review-rows>
              <thead className="text-[9px] uppercase tracking-widest text-slate-500 text-left">
                <tr>
                  <th className="px-2 py-1 font-normal">mpn</th>
                  <th className="px-2 py-1 font-normal">change</th>
                  <th className="px-2 py-1 font-normal">value</th>
                  <th className="px-2 py-1 font-normal">via</th>
                  <th className="px-2 py-1 font-normal" />
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr
                    key={r.key}
                    ref={(el) => {
                      rowRefs.current[i] = el;
                    }}
                    onClick={() => select(i)}
                    aria-selected={i === sel}
                    data-review-row={r.key}
                    data-selected={i === sel ? "" : undefined}
                    className={`cursor-pointer align-top ${i === sel ? "bg-pink-500/10 text-slate-100" : "text-slate-300 hover:bg-white/5"}`}
                  >
                    <td className="px-2 py-1 whitespace-nowrap" data-cell="mpn">{r.mpn}</td>
                    <td className="px-2 py-1 text-slate-400" data-cell="field">{r.field ?? "—"}</td>
                    <td className="px-2 py-1 break-all" data-cell="value">
                      {r.extracted_value ?? "—"}
                      {r.needs_review && (
                        <span className="block text-[9px] text-amber-400/80" data-needs-review>
                          extractor unsure{r.review_reason ? `: ${r.review_reason}` : ""}
                        </span>
                      )}
                    </td>
                    <td className="px-2 py-1 text-slate-500" data-cell="via">
                      {r.obtained_via ?? "—"}
                      {r.evidence.state === "ok" && evidenceQuality(r.obtained_via) === "inherited" && (
                        <span className="block text-[9px] text-violet-300/70" data-evidence-note="inherited">
                          from the document-level date
                        </span>
                      )}
                      {r.evidence.state === "ok" && evidenceQuality(r.obtained_via) === "region" && (
                        <span className="block text-[9px] text-amber-400/70" data-evidence-note="region">
                          table box, not the cell
                        </span>
                      )}
                    </td>
                    <td className="px-2 py-1 whitespace-nowrap text-right">
                      {r.evidence.state === "ok" ? (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            select(i);
                          }}
                          className="px-1.5 py-0.5 rounded border border-cyan-500/40 text-cyan-300 hover:bg-cyan-500/10 text-[9px] uppercase tracking-widest cursor-pointer"
                          data-show-row={r.key}
                        >
                          show p{r.evidence.ref.page}
                        </button>
                      ) : (
                        <span className="text-[9px] uppercase tracking-widest text-amber-400/80" data-evidence-state={r.evidence.state}>
                          {r.evidence.state === "absent" ? "no evidence" : "unreadable"}
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-1.5 text-[9px] font-mono uppercase tracking-widest text-slate-600">
            j/k rows · p promote · r reject
          </p>
          {isReviewRowEditsEnabled() && (
            <p className="mt-1 text-[10px] text-slate-500" data-review-row-edits="no-wire">
              Row edits are on, but document_promotion has no row-edit wire yet; asked of Lane 1.
            </p>
          )}
        </div>

        {/* RIGHT — the source, at the selected row's evidence. */}
        <PdfEvidencePane ingestId={ingestId} target={target} quality={targetQuality} sharedBy={targetShared} />
      </div>

      {/* BOTTOM — the decision. */}
      <div className="mt-4">
        {blocked ? (
          <TaskActBlocked task={task} a={a} />
        ) : (
          <div className="flex flex-col gap-2" data-review-actions>
            <TaskActNotices a={a} />
            {armed && (
              <p className="text-[11px] font-mono text-neon-green" role="status" data-promote-armed>
                Press p again, or Enter, to promote. Esc cancels.
              </p>
            )}
            <input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="note (optional; sent with the decision)"
              aria-label="Note for decision"
              data-review-note
              className="w-full px-2 py-1.5 rounded bg-black/30 border border-white/10 text-[11px] font-mono text-slate-200 placeholder:text-slate-600"
            />
            <div className="flex flex-wrap gap-2">
              {promoteVerb && (
                <button
                  type="button"
                  onClick={promote}
                  disabled={!canAct}
                  data-verb={promoteVerb}
                  className="flex-1 min-w-[7rem] flex items-center justify-center gap-1.5 px-3 py-2 rounded border text-[11px] font-mono uppercase tracking-widest disabled:opacity-40 cursor-pointer bg-neon-green/10 border-neon-green/50 text-neon-green hover:bg-neon-green/20"
                >
                  <CheckCircle2 className="w-3.5 h-3.5" /> {verbLabel(promoteVerb)}
                </button>
              )}
              {rejectVerb && (
                <button
                  type="button"
                  onClick={() => {
                    setArmed(false);
                    setRejectOpen((o) => !o);
                  }}
                  disabled={!canAct}
                  aria-expanded={rejectOpen}
                  data-verb={rejectVerb}
                  className="flex-1 min-w-[7rem] flex items-center justify-center gap-1.5 px-3 py-2 rounded border text-[11px] font-mono uppercase tracking-widest disabled:opacity-40 cursor-pointer bg-neon-pink/10 border-neon-pink/50 text-neon-pink hover:bg-neon-pink/20"
                >
                  <XCircle className="w-3.5 h-3.5" /> {verbLabel(rejectVerb)}…
                </button>
              )}
              {otherVerbs.map((v) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => void act(v, note)}
                  disabled={!canAct || (needsReason(v) && !note.trim())}
                  data-verb={v}
                  title={needsReason(v) && !note.trim() ? `${verbLabel(v)} requires a reason: write it in the note` : undefined}
                  className="flex-1 min-w-[7rem] px-3 py-2 rounded border text-[11px] font-mono uppercase tracking-widest disabled:opacity-40 cursor-pointer bg-white/5 border-white/20 text-slate-300 hover:bg-white/10"
                >
                  {verbLabel(v)}
                </button>
              ))}
            </div>
            {rejectOpen && rejectVerb && (
              <fieldset className="rounded border border-pink-500/20 bg-pink-500/5 px-3 py-2" data-reject-codes>
                <legend className="px-1 text-[10px] font-mono uppercase tracking-widest text-pink-300/80">
                  reject: why (cortex-proposed codes)
                </legend>
                <div className="flex flex-col gap-1">
                  {review.rejectCodes.map((c, i) => (
                    <label key={c.code} className="flex items-baseline gap-2 text-[11px] cursor-pointer" data-reject-code={c.code}>
                      <input
                        type="radio"
                        name={`reject-code-${task.task_id}`}
                        checked={code === c.code}
                        onChange={() => setCode(c.code)}
                      />
                      <span className="font-mono text-slate-500">{i + 1}</span>
                      <span className="font-mono text-slate-200">{c.code}</span>
                      <span className="text-slate-500">{c.label}</span>
                    </label>
                  ))}
                </div>
                <button
                  type="button"
                  onClick={reject}
                  disabled={!canAct || !code}
                  data-reject-confirm
                  className="mt-2 px-3 py-1.5 rounded border text-[11px] font-mono uppercase tracking-widest disabled:opacity-40 cursor-pointer bg-neon-pink/10 border-neon-pink/50 text-neon-pink hover:bg-neon-pink/20"
                >
                  {verbLabel(rejectVerb)}
                  {code ? `: ${code}` : ""}
                </button>
              </fieldset>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
