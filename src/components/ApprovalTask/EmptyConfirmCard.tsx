import { useState } from "react";
import { CheckCircle2, ClipboardCheck, FileSearch } from "lucide-react";
import { formatRequestedBy } from "@/lib/requestedBy";
import { verbLabel } from "@/lib/taskDeclaration";
import { ADD_MISSED_PART_NOT_BUILT_MESSAGE, whyInWords, type EmptyConfirmTask } from "@/lib/emptyConfirm";
import type { ApprovalTaskPayload } from "./ApprovalTaskCard";
import { PdfEvidencePane } from "./PdfEvidencePane";
import { useTaskAct } from "./useTaskAct";
import { isActBlocked, TaskActBlocked, TaskActNotices } from "./TaskActParts";

/**
 * THE `document_empty_confirm` CARD (producer spec 208): an extraction found no parts, and a
 * steward says whether that is TRUE. Drawn by `ApprovalTaskCard` when `readEmptyConfirmTask` reads
 * the task; every other task keeps the card it had.
 *
 * THE DECISION PATH IS `useTaskAct`, NOT A FORK OF IT. A steward answers through the ACT route (the
 * dropper's `POST /ingest/{id}/empty` refuses a steward with 403, and is not built here), so the
 * declared menu, the contradiction/undeclared/done states and the inline refusals are the shared
 * ones. This card adds only what this species needs: the source to look at, the extraction's
 * account of why it found nothing, and a page number for "it has parts".
 *
 * THE VERBS COME FROM THE DECLARATION, IN ITS ORDER; the two this card knows get their own
 * wording and `has_parts` gets its page field. A verb the card has never heard of is still a plain
 * button (`verbLabel`), as on the generic card — nothing the menu offers is hidden.
 *
 * "NOT REPORTED" IS NOT ZERO: a figure the extraction did not give reads "not reported", because
 * "0 tables" would tell the steward the document was inspected and found empty.
 *
 * `add_missed_part` TRUE means the producer will refuse `has_parts` (409 `add_missed_part_not_built`:
 * hand entry on an empty extraction is awaiting a ruling). Telling the steward AFTER they typed a
 * page wastes the press and the typed page, so the button is disabled up front with the producer's
 * own sentence beside it. `confirmed_no_parts` stays available: it is a different answer.
 *
 * NO HOOK AFTER AN EARLY RETURN (`hooksAfterEarlyReturn.test.ts`): every hook is above the one
 * conditional branch, which only chooses what to draw.
 */
export function EmptyConfirmCard({ task, empty }: { task: ApprovalTaskPayload; empty: EmptyConfirmTask }) {
  const a = useTaskAct(task);
  const { acting, done, verbs, act } = a;
  const [pageText, setPageText] = useState("");

  const page = /^\d+$/.test(pageText.trim()) ? Number(pageText.trim()) : NaN;
  const pageOk = Number.isInteger(page) && page >= 1;
  const { account } = empty;
  const figure = (n: number | null) => (n === null ? "not reported" : String(n));

  return (
    <div className="glass-panel p-6 my-4 border-cyan-500/20" data-empty-confirm>
      <div className="mb-4">
        <div className="flex items-center gap-2 mb-1">
          <ClipboardCheck className="w-4 h-4 text-neon-pink" />
          <h3 className="text-lg font-bold text-white tracking-tight leading-none flex-1">{task.title}</h3>
          <span
            className={`px-1.5 py-0.5 rounded text-[8px] font-mono font-bold uppercase tracking-wider border ${
              done || task.task_state !== "pending"
                ? "text-slate-400 border-white/10 bg-white/5"
                : "text-pink-300 border-pink-500/40 bg-pink-500/10"
            }`}
          >
            {done ? "Recorded" : (task.task_state ?? "pending")}
          </span>
        </div>
        <p className="text-[10px] text-cyan-400/70 uppercase tracking-[0.2em] font-mono font-bold">
          {task.kind} · {task.audience}
        </p>
      </div>

      {task.summary && <p className="text-sm text-slate-300 mb-4 leading-relaxed">{task.summary}</p>}

      <div className="space-y-0.5 text-[10px] font-mono text-slate-500 uppercase tracking-wider mb-4">
        {task.requested_by && <p>requested by · {formatRequestedBy(task.requested_by)}</p>}
        {task.subject_ref && <p className="break-all">subject · {task.subject_ref}</p>}
        {empty.attempt !== null && <p>attempt · {empty.attempt}</p>}
      </div>

      {/* The source, with no box: nothing was extracted, so there is nothing to point at. */}
      <div className="mb-4" data-empty-source>
        <PdfEvidencePane ingestId={empty.ingestId} target={null} />
      </div>

      <div className="rounded border border-cyan-500/20 bg-cyan-500/5 px-3 py-2.5 mb-4" data-empty-account>
        <p className="flex items-center gap-1.5 text-[11px] text-slate-200 leading-relaxed" data-empty-why>
          <FileSearch className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
          {whyInWords(account.why)}
        </p>
        <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-[11px] font-mono text-slate-300">
          <dt className="text-slate-500">Tables found</dt>
          <dd data-figure="n_tables">{figure(account.nTables)}</dd>
          <dt className="text-slate-500">Tables with no part-number column</dt>
          <dd data-figure="grid_no_parts_col">{figure(account.gridNoPartsCol)}</dd>
          <dt className="text-slate-500">Rows emitted</dt>
          <dd data-figure="grid_rows_emitted">{figure(account.gridRowsEmitted)}</dd>
        </dl>
        {account.reviewReasons.length > 0 && (
          <ul className="mt-2 list-disc pl-4 text-[11px] text-slate-300" data-empty-reasons>
            {account.reviewReasons.map((r, i) => (
              <li key={`${i}:${r}`}>{r}</li>
            ))}
          </ul>
        )}
        {empty.forcedTextFallback && (
          <p className="mt-2 text-[11px] text-amber-400/90" data-empty-forced-fallback>
            Forced text fallback was already used
          </p>
        )}
      </div>

      {isActBlocked(a) ? (
        <TaskActBlocked task={task} a={a} />
      ) : (
        <div className="flex flex-col gap-2">
          <TaskActNotices a={a} />
          <div className="flex flex-wrap items-center gap-2">
            {verbs.map((v) => {
              if (v === "confirmed_no_parts") {
                return (
                  <button
                    key={v}
                    type="button"
                    onClick={() => act(v)}
                    disabled={acting}
                    data-verb={v}
                    className="flex-1 min-w-[7rem] flex items-center justify-center gap-1.5 px-3 py-2 rounded border text-[11px] font-mono uppercase tracking-widest disabled:opacity-40 transition-colors cursor-pointer bg-neon-green/10 border-neon-green/50 text-neon-green hover:bg-neon-green/20"
                  >
                    <CheckCircle2 className="w-3.5 h-3.5" /> No parts in this document
                  </button>
                );
              }
              if (v === "has_parts") {
                return (
                  <div key={v} className="flex flex-1 min-w-[7rem] items-center gap-2" data-has-parts-group>
                    <input
                      type="number"
                      inputMode="numeric"
                      min={1}
                      step={1}
                      required
                      value={pageText}
                      onChange={(e) => setPageText(e.target.value)}
                      aria-label="Page the parts are on"
                      placeholder="page"
                      data-page-input
                      className="w-20 px-2 py-1.5 rounded bg-black/30 border border-white/10 text-[11px] font-mono text-slate-200 placeholder:text-slate-600"
                    />
                    <button
                      type="button"
                      onClick={() => act(v, undefined, undefined, undefined, undefined, page)}
                      disabled={acting || !pageOk || empty.addMissedPart}
                      data-verb={v}
                      title={empty.addMissedPart ? ADD_MISSED_PART_NOT_BUILT_MESSAGE : undefined}
                      className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded border text-[11px] font-mono uppercase tracking-widest disabled:opacity-40 transition-colors cursor-pointer bg-neon-pink/10 border-neon-pink/50 text-neon-pink hover:bg-neon-pink/20"
                    >
                      {pageOk ? `It has parts — page ${page}` : "It has parts — page N"}
                    </button>
                  </div>
                );
              }
              return (
                <button
                  key={v}
                  type="button"
                  onClick={() => act(v)}
                  disabled={acting}
                  data-verb={v}
                  className="flex-1 min-w-[7rem] px-3 py-2 rounded border text-[11px] font-mono uppercase tracking-widest disabled:opacity-40 transition-colors cursor-pointer bg-neon-pink/10 border-neon-pink/50 text-neon-pink hover:bg-neon-pink/20"
                >
                  {verbLabel(v)}
                </button>
              );
            })}
          </div>
          {empty.addMissedPart && (
            <div className="flex flex-wrap items-center gap-2" data-add-missed-part>
              <button
                type="button"
                disabled
                className="px-3 py-1.5 rounded border border-white/10 text-[11px] font-mono uppercase tracking-widest text-slate-500 opacity-60"
              >
                Add a missed part
              </button>
              <span className="text-[11px] text-slate-400" data-add-missed-part-message>
                {ADD_MISSED_PART_NOT_BUILT_MESSAGE}
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
