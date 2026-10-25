import { useState } from "react";
import { CheckCircle2, XCircle, FileText } from "lucide-react";
import { formatRequestedBy } from "@/lib/requestedBy";
import {
  actOnDocumentReview,
  buildDocumentVerdicts,
  type DocumentReviewTask,
  type DocumentSection,
  type SectionVerdict,
} from "@/lib/documentReview";
import type { EvidenceRef } from "@/lib/promotionReview";
import type { ApprovalTaskPayload } from "./ApprovalTaskCard";
import { useTaskAct } from "./useTaskAct";
import { isActBlocked, TaskActBlocked, TaskActNotices } from "./TaskActParts";
import { PdfEvidencePane } from "./PdfEvidencePane";

/**
 * The document review card: section list left, the page right, Accept/Flag per section, one submit.
 * Drawn only for a task `readDocumentReviewTask` accepts. The shape is PROPOSED (see
 * `documentReview.ts`); this file spells none of the wire names, it imports the reader's types.
 */

const NOT_STATED = "not stated";
const pagesText = (s: DocumentSection) => (s.pageEnd !== null ? `pp. ${s.page}–${s.pageEnd}` : `p. ${s.page}`);
const pageTarget = (page: number): EvidenceRef => ({ page, bbox: null, page_dims: { width: 1, height: 1 }, units: null });

export function DocumentReviewCard({ task, review }: { task: ApprovalTaskPayload; review: DocumentReviewTask }) {
  const a = useTaskAct(task);
  const { acting } = a;
  const { sections, header, droppedSections } = review;

  const [selectedId, setSelectedId] = useState<string>(sections[0].sectionId);
  const [jumpKey, setJumpKey] = useState(0);
  const [verdicts, setVerdicts] = useState<Record<string, SectionVerdict | undefined>>({});
  const [notes, setNotes] = useState<Record<string, string | undefined>>({});

  const selected = sections.find((s) => s.sectionId === selectedId) ?? sections[0];
  const reviewed = sections.filter((s) => verdicts[s.sectionId] !== undefined).length;
  const flagged = sections.filter((s) => verdicts[s.sectionId] === "flagged").length;
  const complete = reviewed === sections.length;
  const blocked = isActBlocked(a);
  const canSubmit = complete && droppedSections === 0 && !acting && !blocked;
  const submitDecision = flagged > 0 ? "rejected" : "promoted";

  const select = (id: string) => {
    setSelectedId(id);
    setJumpKey((k) => k + 1);
  };
  const setVerdict = (id: string, v: SectionVerdict) => setVerdicts((m) => ({ ...m, [id]: v }));

  const submit = () => {
    if (!canSubmit) return;
    void actOnDocumentReview(a.act, buildDocumentVerdicts(sections, verdicts, notes));
  };

  const headerRows: Array<[string, string | null]> = [
    ["title", header.title],
    ["doc id", header.docId],
    ["revision", header.revision],
    ["date", header.date],
  ];

  return (
    <div className="glass-panel p-6 my-4 border-cyan-500/20" data-document-review>
      <div className="mb-4">
        <div className="flex items-center gap-2 mb-1">
          <FileText className="w-4 h-4 text-neon-pink" />
          <h3 className="text-lg font-bold text-white tracking-tight leading-none flex-1">{task.title}</h3>
        </div>
        <p className="text-[10px] text-cyan-400/70 uppercase tracking-[0.2em] font-mono font-bold">
          {task.kind} · {task.audience}
        </p>
        {task.requested_by && (
          <p className="mt-1 text-[10px] font-mono text-slate-500 uppercase tracking-wider">
            requested by · {formatRequestedBy(task.requested_by)}
          </p>
        )}
      </div>

      <div className="grid gap-4 md:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
        {/* LEFT — the header, then the sections. */}
        <div className="min-w-0">
          <dl className="mb-3 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-[11px] font-mono" data-document-header>
            {headerRows.map(([label, value]) => (
              <div key={label} className="contents">
                <dt className="text-[9px] uppercase tracking-widest text-slate-500">{label}</dt>
                <dd className={value === null ? "text-slate-500 italic" : "text-slate-200"} data-header-field={label}>
                  {value ?? NOT_STATED}
                </dd>
              </div>
            ))}
          </dl>

          <ul className="max-h-[60vh] overflow-auto rounded border border-white/5 divide-y divide-white/5" data-section-list>
            {sections.map((s) => {
              const v = verdicts[s.sectionId];
              const isSel = s.sectionId === selected.sectionId;
              return (
                <li
                  key={s.sectionId}
                  data-section-id={s.sectionId}
                  data-verdict={v ?? "none"}
                  data-selected={isSel ? "" : undefined}
                  aria-selected={isSel}
                  onClick={() => select(s.sectionId)}
                  className={`px-2 py-2 cursor-pointer text-[11px] ${isSel ? "bg-pink-500/10 text-slate-100" : "text-slate-300 hover:bg-white/5"}`}
                >
                  <div className="flex items-baseline gap-2">
                    <span className="flex-1 min-w-0 truncate">{s.title}</span>
                    <span className="font-mono text-slate-500">{pagesText(s)}</span>
                  </div>
                  <div className="mt-1.5 flex gap-2">
                    <button
                      type="button"
                      aria-pressed={v === "accepted"}
                      disabled={acting}
                      data-accept
                      onClick={(e) => {
                        e.stopPropagation();
                        setVerdict(s.sectionId, "accepted");
                      }}
                      className={`flex items-center gap-1 px-2 py-1 rounded border text-[10px] font-mono uppercase tracking-widest disabled:opacity-40 cursor-pointer ${
                        v === "accepted" ? "bg-neon-green/20 border-neon-green/60 text-neon-green" : "bg-white/5 border-white/20 text-slate-300 hover:bg-white/10"
                      }`}
                    >
                      <CheckCircle2 className="w-3 h-3" /> Accept
                    </button>
                    <button
                      type="button"
                      aria-pressed={v === "flagged"}
                      disabled={acting}
                      data-flag
                      onClick={(e) => {
                        e.stopPropagation();
                        setVerdict(s.sectionId, "flagged");
                      }}
                      className={`flex items-center gap-1 px-2 py-1 rounded border text-[10px] font-mono uppercase tracking-widest disabled:opacity-40 cursor-pointer ${
                        v === "flagged" ? "bg-neon-pink/20 border-neon-pink/60 text-neon-pink" : "bg-white/5 border-white/20 text-slate-300 hover:bg-white/10"
                      }`}
                    >
                      <XCircle className="w-3 h-3" /> Flag
                    </button>
                  </div>
                  {v === "flagged" && (
                    <input
                      value={notes[s.sectionId] ?? ""}
                      onClick={(e) => e.stopPropagation()}
                      onChange={(e) => setNotes((m) => ({ ...m, [s.sectionId]: e.target.value }))}
                      placeholder="note (optional)"
                      aria-label={`Note for ${s.title}`}
                      data-section-note
                      className="mt-1.5 w-full px-2 py-1.5 rounded bg-black/30 border border-white/10 text-[11px] font-mono text-slate-200 placeholder:text-slate-600"
                    />
                  )}
                </li>
              );
            })}
          </ul>
        </div>

        {/* RIGHT — the source, at the selected section's first page. */}
        <PdfEvidencePane ingestId={review.ingestId} target={pageTarget(selected.page)} jumpKey={jumpKey} />
      </div>

      {/* BOTTOM — the decision. */}
      <div className="mt-4">
        {blocked ? (
          <TaskActBlocked task={task} a={a} />
        ) : (
          <div className="flex flex-col gap-2" data-review-actions>
            <TaskActNotices a={a} />
            <p className="text-[11px] font-mono text-slate-400" data-review-counter>
              {reviewed} of {sections.length} sections reviewed · {flagged} flagged
            </p>
            {droppedSections > 0 && (
              <p className="text-[11px] text-amber-400/90" data-dropped-sections>
                {droppedSections} section(s) in this task were malformed and are not shown — the review cannot be submitted
              </p>
            )}
            <button
              type="button"
              onClick={submit}
              disabled={!canSubmit}
              data-submit-decision={submitDecision}
              className={`px-3 py-2 rounded border text-[11px] font-mono uppercase tracking-widest disabled:opacity-40 cursor-pointer ${
                flagged > 0 ? "bg-neon-pink/10 border-neon-pink/50 text-neon-pink hover:bg-neon-pink/20" : "bg-neon-green/10 border-neon-green/50 text-neon-green hover:bg-neon-green/20"
              }`}
            >
              {flagged > 0 ? `Send back — ${flagged} flagged` : "Promote document"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
