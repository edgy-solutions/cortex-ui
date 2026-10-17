import { useEffect, useRef, useState } from "react";
import { fetchIngestSource } from "@/lib/ingestTransport";
import { openPdf, RenderCancelled, type PdfDoc, type RenderedPage } from "@/lib/pdfSource";
import { scaleBox } from "@/lib/bboxScale";
import { reviewRouteFailure, type EvidenceRef } from "@/lib/promotionReview";

/**
 * The review card's right pane: the dropped document at the selected row's evidence page, with
 * the evidence box outlined and scrolled into view. The steward never pages or scrolls the PDF by
 * hand to find a row; selecting the row does it (the review standard's "few looks" test).
 *
 * THE OUTLINE FOLLOWS THE EVIDENCE PANE'S SEALED RULE (`bboxScale.ts`): the box is normalised
 * against the row's own `page_dims`, then scaled to the size the page was actually DRAWN at. It is
 * never placed in PDF points, so a producer measuring in pixels of a 150-dpi raster and one
 * measuring in points both land on the same text.
 *
 * An outline is drawn only once the page it belongs to has rendered. An outline from the last
 * row drawn over the next row's page would point at the wrong text with full confidence.
 */
type Phase =
  | { phase: "loading" }
  | { phase: "ready"; doc: PdfDoc }
  | { phase: "failed"; why: string };

const DEFAULT_WIDTH = 560;

export function PdfEvidencePane({ ingestId, target }: { ingestId: string | null; target: EvidenceRef | null }) {
  const [state, setState] = useState<Phase>(ingestId ? { phase: "loading" } : { phase: "failed", why: "This task names no ingest_id, so there is no source to fetch." });
  const [rendered, setRendered] = useState<(RenderedPage & { page: number }) | null>(null);
  const [width, setWidth] = useState(DEFAULT_WIDTH);
  const boxRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const outlineRef = useRef<HTMLDivElement | null>(null);

  // Load once per ingest id. The doc is destroyed with the card, and a late answer for a card that
  // has moved on is dropped rather than drawn.
  useEffect(() => {
    if (!ingestId) return;
    let live = true;
    let doc: PdfDoc | null = null;
    setState({ phase: "loading" });
    setRendered(null);
    fetchIngestSource(ingestId)
      .then((bytes) => openPdf(bytes))
      .then((d) => {
        doc = d;
        if (live) setState({ phase: "ready", doc: d });
        else d.destroy();
      })
      .catch((err) => {
        if (live) setState({ phase: "failed", why: reviewRouteFailure(err, "source") });
      });
    return () => {
      live = false;
      doc?.destroy();
    };
  }, [ingestId]);

  // Draw at the pane's own width, re-measured when it changes.
  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const measure = () => {
      const w = Math.floor(el.clientWidth);
      if (w > 0) setWidth(w);
    };
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const doc = state.phase === "ready" ? state.doc : null;
  const outOfRange = doc !== null && target !== null && target.page > doc.numPages;
  const page = target && !outOfRange ? target.page : 1;

  useEffect(() => {
    if (!doc || !canvasRef.current) return;
    let live = true;
    doc
      .renderPage(page, canvasRef.current, width)
      .then((r) => {
        if (live) setRendered({ ...r, page });
      })
      .catch((err) => {
        if (err instanceof RenderCancelled || !live) return;
        setState({ phase: "failed", why: `Page ${page} could not be drawn.` });
      });
    return () => {
      live = false;
    };
  }, [doc, page, width]);

  const box =
    target && !outOfRange && rendered && rendered.page === target.page
      ? scaleBox(target.bbox, target.page_dims, rendered)
      : null;

  // The jump: once the outline sits on its page, bring it to the middle of the pane. Keyed on where
  // the box is, so a re-render that moves nothing does not yank the pane back.
  const boxKey = box && rendered ? `${rendered.page}:${box.left}:${box.top}:${box.width}` : null;
  useEffect(() => {
    if (boxKey) outlineRef.current?.scrollIntoView?.({ block: "center", inline: "nearest" });
  }, [boxKey]);

  return (
    <div className="flex flex-col min-w-0" data-pdf-pane data-pdf-state={state.phase}>
      <div className="flex items-center justify-between mb-1.5 text-[10px] font-mono uppercase tracking-widest text-slate-500">
        <span>source</span>
        {doc && (
          <span data-pdf-page={page} data-pdf-pages={doc.numPages}>
            page {page} / {doc.numPages}
          </span>
        )}
      </div>
      {outOfRange && target && (
        <p className="mb-1.5 text-[11px] text-amber-400/90" role="alert" data-evidence-page-out-of-range={target.page}>
          This row's evidence names page {target.page}; the document has {doc?.numPages}.
        </p>
      )}
      <div
        ref={boxRef}
        className="relative overflow-auto max-h-[70vh] rounded border border-white/10 bg-white/95"
        data-pdf-scroller
      >
        {state.phase === "failed" ? (
          <p className="p-4 text-[11px] text-slate-700" role="alert" data-pdf-failed>
            {state.why} The rows on the left are still the extraction to vet.
          </p>
        ) : (
          <div className="relative" style={rendered ? { width: rendered.width, height: rendered.height } : undefined}>
            <canvas ref={canvasRef} className="block" aria-label={`source page ${page}`} />
            {state.phase === "loading" && (
              <p className="absolute inset-0 p-4 text-[11px] text-slate-500">loading source…</p>
            )}
            {box && (
              <div
                ref={outlineRef}
                className="absolute pointer-events-none rounded-sm border-2 border-pink-500 bg-pink-500/10 shadow-[0_0_0_2px_rgba(236,72,153,0.25)]"
                style={{ left: box.left, top: box.top, width: box.width, height: box.height }}
                data-evidence-outline
                data-evidence-outline-page={rendered?.page}
              />
            )}
          </div>
        )}
      </div>
    </div>
  );
}
