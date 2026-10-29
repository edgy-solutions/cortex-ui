import type { ReviewRow } from "@/lib/promotionReview";
import type { ReviewUnit, UnitPlace } from "@/lib/reviewRuns";
import { UnitMarks } from "./ReviewRunsList";

const BTN_BASE =
  "min-w-8 h-8 px-2 inline-flex items-center justify-center bg-[#111A2B] border border-[#3A4A66] rounded text-[11px] cursor-pointer hover:border-cyan-400 disabled:opacity-40 disabled:cursor-default disabled:hover:border-[#3A4A66]";
const BTN = `${BTN_BASE} text-slate-200`;

/**
 * The note beside the outlined cell: what was extracted for this part, so the eye need not leave the page to
 * compare, where the part sits in its group, and the moves that walk the review from there (previous / next
 * part, start / end / a random part of the group, previous / next unlooked check, fix). Drawn by the pane at
 * the outline box (`PdfEvidencePane`'s `callout`), which is why it is compact and why every click in it stays
 * out of the page-click handler (the pane's slot stops propagation).
 */
export function ReviewCallout({
  unit,
  row,
  looked,
  edited,
  sampled,
  canPrevCheck,
  canNextCheck,
  onPrev,
  onNext,
  onPrevCheck,
  onNextCheck,
  onFix,
  place,
  onGroupStart,
  onGroupEnd,
  onGroupRandom,
}: {
  unit: ReviewUnit;
  row: ReviewRow;
  looked: boolean;
  edited: boolean;
  sampled: boolean;
  canPrevCheck: boolean;
  canNextCheck: boolean;
  onPrev: () => void;
  onNext: () => void;
  onPrevCheck: () => void;
  onNextCheck: () => void;
  /** Present only when the editor is on and this part can be fixed. */
  onFix?: () => void;
  /** Where the part sits in its run; absent when it is not in one. */
  place?: UnitPlace;
  onGroupStart?: () => void;
  onGroupEnd?: () => void;
  onGroupRandom?: () => void;
}) {
  // The pair the steward is comparing: the part and its replacement; on a row of another field (the date) the
  // field and its value follow, since that is what the outlined cell says.
  const other = row.field !== null && row.field !== "replacement_mpn";
  const straggler = unit.flags.some((f) => f.kind === "straggler");
  return (
    <div
      className="rounded border border-cyan-500/40 bg-slate-950/95 px-2 py-1 shadow text-[11px] font-mono text-slate-200"
      data-review-callout
      data-callout-unit={unit.id}
    >
      <div className="flex flex-wrap items-baseline gap-x-2">
        <span data-callout-pair>
          {unit.mpn} <span className="text-slate-600">→</span> {unit.replacement ?? row.extracted_value ?? "—"}
        </span>
        {other && (
          <span className="text-slate-400" data-callout-field>
            {row.field}
            {row.extracted_value !== null ? `: ${row.extracted_value}` : ""}
          </span>
        )}
        <UnitMarks unit={unit} looked={looked} edited={edited} sample={sampled} />
      </div>
      {(place || straggler) && (
        <div className="mt-1 text-[10px] tracking-wide text-slate-400" data-callout-place>
          {place ? `S${place.ordinal} · ${place.pos + 1} of ${place.size}` : "↯ straggler"}
        </div>
      )}
      <div className="mt-1 flex flex-wrap items-center gap-1">
        <button type="button" onClick={onGroupStart} disabled={!place || place.pos === 0} className={BTN} aria-label="Start of group" data-callout="group-start">
          ⇤
        </button>
        <button type="button" onClick={onPrev} className={BTN} aria-label="Previous part" data-callout="prev">
          ▲
        </button>
        <button type="button" onClick={onNext} className={BTN} aria-label="Next part" data-callout="next">
          ▼
        </button>
        <button type="button" onClick={onGroupEnd} disabled={!place || place.pos === place.size - 1} className={BTN} aria-label="End of group" data-callout="group-end">
          ⇥
        </button>
        <button
          type="button"
          onClick={onGroupRandom}
          disabled={!place}
          className={BTN}
          aria-label="Random part in group"
          title="random spot-check in this group, unlooked first"
          data-callout="group-random"
        >
          ⚄
        </button>
        <button type="button" onClick={onPrevCheck} disabled={!canPrevCheck} className={BTN} data-callout="prev-check">
          prev check
        </button>
        <button type="button" onClick={onNextCheck} disabled={!canNextCheck} className={BTN} data-callout="next-check">
          next check
        </button>
        {onFix && (
          <button type="button" onClick={onFix} className={`${BTN_BASE} !border-amber-500/40 text-amber-300 hover:!border-amber-300`} data-callout="fix">
            fix
          </button>
        )}
      </div>
    </div>
  );
}
