import { FileSearch, AlertTriangle, X } from "lucide-react";
import { boxFraction, type Bbox, type PageDims } from "@/lib/bboxScale";
import { FederatedImage } from "../mesh/FederatedImage";

/**
 * EVIDENCE card — the document region a review value came from, SUMMONED beside
 * its review card (never a timeline citizen; it's evidence FOR a decision, not a
 * thing awaiting one). Closes the provenance chain visually: the approver sees
 * the verbatim string in the actual page region it was extracted from.
 *
 * Doc-tools contract (values from the LLM, boxes from `unstructured`, joined by
 * verbatim text match):
 *  - Boxes are TABLE-ELEMENT granular, not row/cell — every part from one table
 *    shares the same box. So the highlight is labeled "source table for this
 *    part", NOT "this value", and the S3 table CROP is shown as the second panel
 *    (a human scanning the crop for the MPN is the row-level check the box can't
 *    give).
 *  - `not_found` (bboxes empty) is UNLOCATED, not MISSING: no box, an explicit
 *    "could not be located — verify manually" state, and the crop anyway. This is
 *    the state the override ceremony fires on, so it's the state this card exists
 *    for — designed first, not as an edge case.
 *  - The box overlay is positioned as a FRACTION of the page (boxFraction), so it
 *    tracks the text at any render size — the scale rule (bboxScale) enforced by
 *    construction (see the overlay-drift red test).
 */
export interface ProvenanceItem {
  field_path: string;
  mpn?: string;
  value: string;
  source_snippet: string;
  page_number: number; // 1-based
  bboxes: Bbox[];
  page_dims: PageDims;
  region: "table" | "header/narrative" | "derived";
  match_method: "unique" | "region_preferred" | "ambiguous" | "not_found";
  match_confidence: number;
  needs_review: boolean;
  review_reason: string | null;
  crop_url?: string | null;
  page_image_url?: string | null;
}

const METHOD_TONE: Record<ProvenanceItem["match_method"], string> = {
  unique: "text-neon-cyan border-neon-cyan/40 bg-neon-cyan/10",
  region_preferred: "text-neon-cyan/80 border-neon-cyan/30 bg-neon-cyan/5",
  ambiguous: "text-amber-400 border-amber-500/40 bg-amber-500/10",
  not_found: "text-neon-pink border-pink-500/40 bg-pink-500/10",
};

export function EvidenceCard({
  item,
  onDismiss,
}: {
  item: ProvenanceItem;
  onDismiss?: () => void;
}) {
  const located = item.bboxes.length > 0;
  const frac = located ? boxFraction(item.bboxes[0], item.page_dims) : null;
  // Honesty summary, pulled UNDER the title (not buried in a footer): what this
  // evidence IS, given element-granularity — a table region, not a cell.
  const summary = located
    ? `source table · page ${item.page_number} · matched verbatim`
    : `unlocated · page ${item.page_number} · verify manually`;

  return (
    // Content-sized (max-h caps + scrolls) so a short card reads SUMMONED, not a
    // resident full-height rail.
    <div className="glass-panel border-pink-500/20 max-h-full overflow-y-auto custom-scrollbar">
      {/* Header — title + the honesty summary directly under it. */}
      <div className="px-4 py-3 border-b border-white/10 bg-white/5">
        <div className="flex items-center gap-2">
          <FileSearch className="w-4 h-4 text-neon-pink shrink-0" />
          <span className="font-mono text-[11px] font-bold text-slate-200 tracking-widest uppercase truncate flex-1">
            Evidence · {item.value || item.field_path}
          </span>
          <span
            className={`px-1.5 py-0.5 rounded text-[8px] font-mono font-bold uppercase tracking-wider border ${METHOD_TONE[item.match_method]}`}
          >
            {item.match_method} · {(item.match_confidence * 100).toFixed(0)}%
          </span>
          {onDismiss && (
            <button onClick={onDismiss} className="text-slate-500 hover:text-white transition-colors" title="Dismiss evidence">
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
        <p className="mt-1.5 pl-6 text-[9px] font-mono uppercase tracking-wider text-slate-500">
          {summary} · region {item.region}
        </p>
      </div>

      <div className="p-4 space-y-4">
        {/* not_found first: unlocated ≠ missing. */}
        {!located && (
          <div className="flex items-start gap-2 p-3 rounded border border-pink-500/30 bg-pink-500/5">
            <AlertTriangle className="w-4 h-4 text-neon-pink shrink-0 mt-0.5" />
            <div className="text-[11px] font-mono text-pink-200 leading-relaxed">
              Could not be located in the document — verify manually against{" "}
              <span className="text-white">page {item.page_number}</span>
              {item.crop_url ? " / the table crop below" : ""}. This is why this
              part is flagged for review.
            </div>
          </div>
        )}

        {/* Source region. No full-page render exists yet (doc-tools Phase 5.8),
            so the TABLE CROP is the region — element-granular, "source table"
            not "this cell", and the crop is the row-level scan the bbox can't
            give. When a full-page render lands (page_image_url), the drift-free
            %-overlay box draws on the page instead. */}
        {item.page_image_url ? (
          <div>
            <div className="relative w-full border border-white/10 rounded overflow-hidden bg-slate-950">
              <img src={item.page_image_url} alt={`Notice page ${item.page_number}`} className="w-full block" />
              {frac && (
                <div
                  className="absolute border-2 border-neon-pink/80 bg-neon-pink/10 pointer-events-none"
                  style={{
                    left: `${frac.left * 100}%`,
                    top: `${frac.top * 100}%`,
                    width: `${frac.width * 100}%`,
                    height: `${frac.height * 100}%`,
                  }}
                />
              )}
            </div>
            <p className="mt-1.5 text-[9px] font-mono uppercase tracking-wider text-slate-500">
              source table · page {item.page_number} · highlights the table, not the row
            </p>
          </div>
        ) : item.crop_url ? (
          <div>
            <p className="mb-1.5 text-[9px] font-mono uppercase tracking-wider text-slate-500">
              source table · page {item.page_number} · scan for the value
            </p>
            <FederatedImage
              src={item.crop_url}
              alt="Source table crop"
              className="w-full block border border-white/10 rounded bg-slate-950"
            />
          </div>
        ) : (
          <p className="text-[10px] font-mono uppercase tracking-wider text-slate-600">
            no source region located · page {item.page_number}
          </p>
        )}

        {/* The verbatim matched string. */}
        {item.source_snippet && (
          <div>
            <p className="mb-1 text-[9px] font-mono uppercase tracking-wider text-slate-500">Matched text (verbatim)</p>
            <p className="text-[11px] font-mono text-slate-200 bg-slate-950/60 border border-white/10 rounded px-2 py-1.5 break-all">
              {item.source_snippet}
            </p>
          </div>
        )}
        {/* field path — quiet, for provenance completeness. */}
        <p className="text-[8px] font-mono uppercase tracking-wider text-slate-600 pt-1">
          field · {item.field_path}
        </p>
      </div>
    </div>
  );
}
