import type { KeyboardEvent } from "react";

const navBtn =
  "px-1.5 rounded border border-slate-500/40 text-slate-300 hover:bg-white/5 disabled:opacity-30 disabled:cursor-default cursor-pointer";

/**
 * The shared page navigator: ‹, "page", a numeric input, the extent label, ›.
 * The caller owns the page and the input draft; this is markup only.
 *
 * `total` present: "/ M" (a real document page count, as PdfEvidencePane has).
 * `total` absent: `evidence` gives "k of K evidence pages" instead. The provenance wire carries
 * no page count; Lane 1 has been asked for `ingest_id`, which brings PdfEvidencePane's real count.
 */
export function PageNavigator({
  current,
  total,
  evidence,
  draft,
  onDraft,
  onCommit,
  onCancel,
  onPrev,
  onNext,
  prevDisabled,
  nextDisabled,
  testPrefix = "pdf",
}: {
  current: number;
  total?: number;
  evidence?: { index: number; count: number };
  draft: string | null;
  onDraft: (v: string) => void;
  onCommit: () => void;
  onCancel: () => void;
  onPrev: () => void;
  onNext: () => void;
  prevDisabled: boolean;
  nextDisabled: boolean;
  /** attribute family: "pdf" gives data-pdf-prev/-next/-page-input/-page/-pages. */
  testPrefix?: string;
}) {
  const a = (name: string, v: string | number | true = true) => ({ [`data-${testPrefix}-${name}`]: v });
  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      onCommit();
    } else if (e.key === "Escape") {
      e.stopPropagation();
      onCancel();
    }
  };
  return (
    <span
      className="flex items-center gap-1"
      {...a("page", current)}
      {...(total !== undefined ? a("pages", total) : {})}
    >
      <button type="button" className={navBtn} onClick={onPrev} disabled={prevDisabled} aria-label="previous page" title="previous page ([)" {...a("prev")}>
        ‹
      </button>
      page
      <input
        type="text"
        inputMode="numeric"
        aria-label="page number"
        className="w-8 px-1 rounded border border-slate-500/40 bg-transparent text-center text-slate-300"
        value={draft ?? String(current)}
        onChange={(e) => onDraft(e.target.value)}
        onKeyDown={onKey}
        onBlur={onCommit}
        {...a("page-input")}
      />
      {total !== undefined ? `/ ${total}` : evidence ? `${evidence.index} of ${evidence.count} evidence pages` : null}
      <button type="button" className={navBtn} onClick={onNext} disabled={nextDisabled} aria-label="next page" title="next page (])" {...a("next")}>
        ›
      </button>
    </span>
  );
}
