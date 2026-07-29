import { useEffect, useRef } from "react";
import { FileSearch, AlertTriangle, X } from "lucide-react";
import { boxFraction, type Bbox, type PageDims } from "@/lib/bboxScale";
import { FederatedImage } from "../mesh/FederatedImage";

/**
 * EVIDENCE card — the document region a review value came from, SUMMONED beside
 * its review card (never a timeline citizen; it's evidence FOR a decision, not a
 * thing awaiting one). Closes the provenance chain visually.
 *
 * TWO HALVES, both needed (the card was standing on one leg until the page render
 * landed):
 *  - CONTEXT (main body): the full page with the source region HIGHLIGHTED. Answers
 *    "where in the document did this come from" — which table among the page's
 *    several, where it sits, what surrounds it. This is the SELF-VERIFYING form:
 *    the reviewer sees with their own eyes that the highlight sits on a table
 *    containing their MPN (after the crop-mismatch bug, worth a lot). The overlay
 *    is a FRACTION of the page (boxFraction) so it tracks the text at any render
 *    size — the sealed bbox-scale rule, drift-free by construction.
 *  - DETAIL (zoom panel below): the table CROP. Answers "what does it say" — the
 *    row-level read the element-granular box can't give.
 *
 * Doc-tools contract (values from the LLM, boxes from `unstructured`, joined by
 * verbatim text match): boxes are TABLE-element granular, so the highlight marks
 * the source TABLE, not the cell. `not_found` (bboxes empty) is UNLOCATED, not
 * MISSING: the page still renders (no highlight) with a "scan for it yourself"
 * instruction — "here's the document, we couldn't anchor it, you look" is the
 * state the override ceremony fires on, so it's designed first, not as an edge.
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
  coherent?: boolean;
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
  const hasPage = !!item.page_image_url;
  const hasCrop = !!item.crop_url;

  // Scroll the highlighted region into view within the card's own scroll area —
  // the page renders taller than the card, so center the eye on the box.
  const regionRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    regionRef.current?.scrollIntoView({ block: "center", inline: "nearest" });
  }, [item.page_image_url, item.mpn]);

  // Honesty summary, pulled UNDER the title (where the eye is): what this evidence
  // IS, given element-granularity — a table region, not a cell.
  const summary = located
    ? `source table · page ${item.page_number} · matched verbatim`
    : `unlocated · page ${item.page_number} · verify manually`;

  return (
    // Content-sized (max-h caps + scrolls) so a short card reads SUMMONED, not a
    // resident full-height rail.
    <div className="glass-panel border-pink-500/20 max-h-full overflow-y-auto custom-scrollbar">
      {/* Header — title + the honesty summary directly under it. */}
      <div className="px-4 py-3 border-b border-white/10 bg-white/5 sticky top-0 z-10 backdrop-blur">
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
              {hasPage ? " below" : ""}. This is why this part is flagged for review.
            </div>
          </div>
        )}

        {/* CONTEXT — the full page with the source region highlighted. Primary,
            self-verifying: the highlight visibly sits on the table containing the
            value. The %-overlay tracks the text at any render size (sealed scale
            rule). For not_found there's no box — the page renders plain with a
            "scan for it yourself" instruction. */}
        {hasPage ? (
          <div>
            {/* When SUMMONED, evidence is the thing being STUDIED and takes the
                canvas majority (the review yields it space; primacy stays with the
                review via the acting sidebar + lifecycle, not by starving the
                render). So the page render fills most of the viewport height, with
                its own scroll for the tail. The %-overlay stays relative to the
                image wrapper, so the box tracks the text regardless of scroll. */}
            <div className="max-h-[78vh] overflow-y-auto custom-scrollbar border border-white/10 rounded bg-slate-950">
              <div className="relative w-full">
                <FederatedImage
                  src={item.page_image_url!}
                  alt={`Notice page ${item.page_number}`}
                  className="w-full block"
                />
                {frac && (
                  <div
                    ref={regionRef}
                    className="absolute border-2 border-neon-pink shadow-[0_0_0_9999px_rgba(0,0,0,0.45)] pointer-events-none"
                    style={{
                      left: `${frac.left * 100}%`,
                      top: `${frac.top * 100}%`,
                      width: `${frac.width * 100}%`,
                      height: `${frac.height * 100}%`,
                    }}
                  />
                )}
              </div>
            </div>
            <p className="mt-1.5 text-[9px] font-mono uppercase tracking-wider text-slate-500">
              {located
                ? `source page ${item.page_number} · highlight marks the source table (not the cell)`
                : `source page ${item.page_number} · value not located — scan the page yourself`}
            </p>
          </div>
        ) : (
          // No page render (notice ingested before the rasterizer, or synthetic).
          // The crop below is the fallback source region; if neither, say so.
          !hasCrop && (
            <p className="text-[10px] font-mono uppercase tracking-wider text-slate-600">
              no source region located · page {item.page_number}
            </p>
          )
        )}

        {/* DETAIL — the table crop, the row-level read. Secondary to the page:
            labeled a zoom panel when we have the page context above, the primary
            region when we don't. */}
        {hasCrop && (
          <div>
            <p className="mb-1.5 text-[9px] font-mono uppercase tracking-wider text-slate-500">
              {hasPage ? "table crop · zoom · scan for the value" : `source table · page ${item.page_number} · scan for the value`}
            </p>
            <FederatedImage
              src={item.crop_url!}
              alt="Source table crop"
              className="w-full block border border-white/10 rounded bg-slate-950"
            />
          </div>
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
