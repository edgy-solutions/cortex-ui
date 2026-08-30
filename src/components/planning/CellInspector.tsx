import type { ReactNode } from "react";
import { X } from "lucide-react";

/**
 * ONE PANEL FOR "WHAT IS THIS CELL", ACROSS EVERY GRID.
 *
 * Three grids had grown three hand-rolled detail blocks with the same skeleton — an identity
 * line, a measurement sentence, some provenance — and three sets of the same class strings.
 * They drifted in small ways nobody would notice one card at a time and everybody notices on
 * a board: different emphasis colours for the same kind of remark, a close affordance in none
 * of them, a heading that was uppercase here and not there.
 *
 * ── WHY THIS REPLACES THE LINES RATHER THAN SITTING BESIDE THEM ──────────────────────────
 *
 * The inspection layer this is the read half of has to work the same way on every card. Built
 * as a fourth surface next to three existing ones it would have been a fourth pattern, and the
 * unification it was supposed to deliver would have made things worse by one. So the grids
 * hand their content to this and keep none of their own frame.
 *
 * ── WHAT IT OWNS AND WHAT IT DOES NOT ────────────────────────────────────────────────────
 *
 * It owns the FRAME: identity, dismissal, spacing, the shape of a detail row. It owns no
 * content. Each grid composes its own headline and lines because the words are the payload's —
 * "over by 1.0", "2 to go", "pledged but not firm" are claims about different measurements and
 * a generic renderer would have to invent a vocabulary that fits none of them.
 *
 * READ ONLY, DELIBERATELY. The original ask was "click a bar and see its values with options
 * to change them", and the second half is not built: changing a value is either a what-if
 * scenario or an edit to plan state, and which one it is has not been ruled. Shipping an edit
 * control before that ruling would pick the answer by accident.
 */
export function CellInspector({
  title,
  headline,
  lines,
  onDismiss,
}: {
  /** Which cell this is — identity, read from the payload's own labels. */
  title: ReactNode;
  /** The measurement, in the grid's own words. */
  headline: ReactNode;
  /** Supporting detail. An entry may be null; nulls are dropped rather than rendered empty. */
  lines?: (ReactNode | null | undefined)[];
  onDismiss: () => void;
}) {
  const shown = (lines ?? []).filter((l) => l !== null && l !== undefined && l !== false);
  return (
    <div className="mt-4 p-3 rounded glass-panel-sm border-cyan-500/20" data-cell-inspector>
      <div className="flex items-start justify-between gap-2">
        <p className="font-mono text-[10px] uppercase tracking-widest text-cyan-400/70 mb-1 min-w-0">
          {title}
        </p>
        {/* A panel that cannot be closed is a panel that eats the card. Selecting another cell
            replaces it, but "I am done looking" had no gesture at all before this. */}
        <button
          type="button"
          onClick={onDismiss}
          className="text-slate-600 hover:text-slate-300 flex-shrink-0"
          title="Close"
          aria-label="Close"
        >
          <X className="w-3 h-3" />
        </button>
      </div>
      <p className="font-mono text-sm text-slate-200">{headline}</p>
      {shown.map((line, i) => (
        <p key={i} className="mt-1 font-mono text-[11px] text-slate-400">
          {line}
        </p>
      ))}
    </div>
  );
}
