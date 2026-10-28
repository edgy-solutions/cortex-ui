import { useEffect, useImperativeHandle, useRef, useState, type Ref } from "react";
import { PageNavigator } from "./PageNavigator";
import { fetchIngestSource } from "@/lib/ingestTransport";
import type { IngestSource } from "@/api/client";
import { openPdf, RenderCancelled, type PdfDoc, type RenderedPage } from "@/lib/pdfSource";
import { scaleBox } from "@/lib/bboxScale";
import { errorText, reviewRouteFailure, sourceOpenFailure, type EvidenceQuality, type EvidenceRef } from "@/lib/promotionReview";

/** The outline says what it is: solid for the cell, dashed for a box that is not the row's own. */
const OUTLINE_CLASS: Record<EvidenceQuality, string> = {
  cell: "border-2 border-pink-500 bg-pink-500/10 shadow-[0_0_0_2px_rgba(236,72,153,0.25)]",
  region: "border-2 border-dashed border-amber-500 bg-amber-500/5",
  inherited: "border-2 border-dashed border-violet-500 bg-violet-500/10",
  unknown: "border-2 border-dashed border-slate-500 bg-slate-500/5",
};

function outlineCaption(quality: EvidenceQuality, page: number, sharedBy: number): string {
  if (quality === "cell") return "Outlined: the cell this row was read from.";
  if (quality === "region") {
    return `Outlined: the whole table on p${page}, not the cell. Every row read from this table shares this box.`;
  }
  if (quality === "inherited") {
    const all = sharedBy > 1 ? ` ${sharedBy} rows inherit it: confirming it once confirms them all.` : "";
    return `Outlined: the sentence on p${page} that states the document-level date; the row inherits it.${all}`;
  }
  return "Outlined: a box from a method this card does not know. It is not claimed to be the cell.";
}

/**
 * The review card's right pane: the dropped document, every page of it, scrolled to the selected
 * row's evidence with the evidence box outlined (a null bbox jumps to the page with no outline and says "no box"). Selecting a row (or its "show") jumps there, so
 * the steward never hunts for a row's crop (the review standard's "few looks" test); and the whole
 * document scrolls, with prev/next, a page box and `[` / `]`, because a steward must be able to
 * read every page before promoting (the architect, 197: "PAGE 1 / 2 with no way to page").
 *
 * Pages draw as they come near the view (an IntersectionObserver on the scroller), the target page
 * first; with no observer (jsdom) every page draws. A page not yet drawn holds its place at the
 * last drawn page's proportions, so the scroll length is roughly right before it is exact.
 *
 * THE OUTLINE FOLLOWS THE EVIDENCE PANE'S SEALED RULE (`bboxScale.ts`): the box is normalised
 * against the row's own `page_dims`, then scaled to the size the page was actually DRAWN at. It is
 * never placed in PDF points, so a producer measuring in pixels of a 150-dpi raster and one
 * measuring in points both land on the same text.
 *
 * An outline is drawn only on its own page, and only once that page has drawn. An outline placed
 * on a page still drawing would point at text that is not there yet with full confidence.
 */
export type SourcePhase = "loading" | "ready" | "failed";

/** What the card drives from its keyboard (`[` / `]`). */
export interface PdfPaneHandle {
  step(delta: number): void;
  /** The page the pane is showing (1-based). */
  page(): number;
}

type Phase =
  | { phase: "loading" }
  | { phase: "ready"; doc: PdfDoc }
  | { phase: "failed"; why: string };

type Drawn = RenderedPage & { at: number };

const DEFAULT_WIDTH = 560;
const LETTER = 792 / 612;

export function PdfEvidencePane({
  ingestId,
  target,
  quality = "unknown",
  sharedBy = 0,
  caption,
  onPhase,
  jumpKey = 0,
  ref,
}: {
  ingestId: string | null;
  target: EvidenceRef | null;
  quality?: EvidenceQuality;
  sharedBy?: number;
  /** Replaces the outline caption's text when given. */
  caption?: string;
  /**
   * The source as the steward sees it: "ready" only once the page in front of them has DRAWN (the
   * target's page, else page 1; an opened document with nothing on screen is still "loading"),
   * "failed" for a refused fetch, an unreadable file, or ANY page that would not draw, since a
   * steward who cannot read a page cannot vet the document. The card offers Promote only on "ready".
   */
  onPhase?: (phase: SourcePhase) => void;
  /** Bumped by the card on every row selection, so "show" on the row already selected jumps again. */
  jumpKey?: number;
  ref?: Ref<PdfPaneHandle>;
}) {
  const [state, setState] = useState<Phase>(ingestId ? { phase: "loading" } : { phase: "failed", why: "This task names no ingest_id, so there is no source to fetch." });
  const [drawn, setDrawn] = useState<Record<number, Drawn>>({});
  const [broken, setBroken] = useState<Record<number, string>>({});
  const [near, setNear] = useState<ReadonlySet<number>>(() => new Set());
  const [current, setCurrent] = useState(1);
  const [draft, setDraft] = useState<string | null>(null);
  const [width, setWidth] = useState(DEFAULT_WIDTH);
  const boxRef = useRef<HTMLDivElement | null>(null);
  const slotRefs = useRef<Record<number, HTMLDivElement | null>>({});
  const canvasRefs = useRef<Record<number, HTMLCanvasElement | null>>({});
  const outlineRef = useRef<HTMLDivElement | null>(null);
  const docRef = useRef<PdfDoc | null>(null);
  const inFlight = useRef(new Set<string>());
  const pendingJump = useRef(false);

  // Load once per ingest id. The doc is destroyed with the card, and a late answer for a card that
  // has moved on is dropped rather than drawn.
  useEffect(() => {
    if (!ingestId) return;
    let live = true;
    let doc: PdfDoc | null = null;
    setState({ phase: "loading" });
    setDrawn({});
    setBroken({});
    setNear(new Set());
    setCurrent(1);
    inFlight.current.clear();
    // Which stage failed decides what the pane can say: before an answer, the HTTP status; after
    // one, what came back and pdf.js's own error. Never one sentence for both.
    let got: IngestSource | null = null;
    fetchIngestSource(ingestId)
      .then((src) => {
        got = src;
        return openPdf(src.bytes);
      })
      .then((d) => {
        doc = d;
        if (!live) return d.destroy();
        docRef.current = d;
        setState({ phase: "ready", doc: d });
      })
      .catch((err) => {
        const why = got ? sourceOpenFailure(err, got) : reviewRouteFailure(err, "source");
        console.error(`[source] ${ingestId}: ${why}`, err);
        if (live) setState({ phase: "failed", why });
      });
    return () => {
      live = false;
      docRef.current = null;
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
  const numPages = doc?.numPages ?? 0;
  const outOfRange = doc !== null && target !== null && target.page > doc.numPages;
  const targetPage = target && doc && !outOfRange ? target.page : null;
  const facing = targetPage ?? 1;

  // Which pages are near the view. With no observer, all of them.
  useEffect(() => {
    if (!doc) return;
    const root = boxRef.current;
    const all = Array.from({ length: doc.numPages }, (_, i) => i + 1);
    if (typeof IntersectionObserver === "undefined" || !root) {
      setNear(new Set(all));
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        const seen = entries.filter((e) => e.isIntersecting).map((e) => Number((e.target as HTMLElement).dataset.pdfSlot));
        if (seen.length === 0) return;
        setNear((prev) => {
          if (seen.every((n) => prev.has(n))) return prev;
          const next = new Set(prev);
          for (const n of seen) next.add(n);
          return next;
        });
      },
      { root, rootMargin: "100% 0px" },
    );
    for (const n of all) {
      const slot = slotRefs.current[n];
      if (slot) io.observe(slot);
    }
    return () => io.disconnect();
  }, [doc]);

  // Draw what is wanted: the target page first, then every page near the view, each at the current
  // width. A page drawn at an older width is drawn again; a page that failed is not retried.
  useEffect(() => {
    if (!doc) return;
    const want = [facing, ...[...near].sort((a, b) => a - b)];
    for (const n of want) {
      if (n < 1 || n > doc.numPages) continue;
      if (drawn[n]?.at === width || broken[n]) continue;
      const key = `${width}:${n}`;
      const canvas = canvasRefs.current[n];
      if (inFlight.current.has(key) || !canvas) continue;
      inFlight.current.add(key);
      doc
        .renderPage(n, canvas, width)
        .then((r) => {
          inFlight.current.delete(key);
          if (docRef.current === doc) setDrawn((prev) => ({ ...prev, [n]: { ...r, at: width } }));
        })
        .catch((err) => {
          inFlight.current.delete(key);
          if (err instanceof RenderCancelled || docRef.current !== doc) return;
          const why = `Page ${n} could not be drawn: ${errorText(err)}`;
          console.error(`[source] ${why}`, err);
          setBroken((prev) => ({ ...prev, [n]: why }));
        });
    }
  }, [doc, width, near, facing, drawn, broken]);

  const anyBroken = Object.keys(broken).length > 0;
  const shown: SourcePhase =
    state.phase === "ready" ? (anyBroken ? "failed" : drawn[facing] ? "ready" : "loading") : state.phase;
  useEffect(() => {
    onPhase?.(shown);
  }, [shown, onPhase]);

  const scrollToPage = (n: number) => {
    const slot = slotRefs.current[n];
    const sc = boxRef.current;
    if (slot && sc) sc.scrollTop = slot.offsetTop;
  };

  const goTo = (n: number) => {
    if (!doc) return;
    const p = Math.min(Math.max(Math.round(n), 1), doc.numPages);
    pendingJump.current = false;
    setCurrent(p);
    scrollToPage(p);
  };

  useImperativeHandle(ref, () => ({ step: (d: number) => goTo(current + d), page: () => current }));

  // The jump: on a new target (or "show" again), bring its page into view at once, then centre the
  // outline once the page has drawn. Paging away cancels a jump still waiting on its page.
  useEffect(() => {
    if (!doc || targetPage === null) {
      pendingJump.current = false;
      return;
    }
    pendingJump.current = true;
    setCurrent(targetPage);
    scrollToPage(targetPage);
  }, [doc, targetPage, target, jumpKey]);

  const targetDrawn = targetPage !== null ? drawn[targetPage] : undefined;
  const box = target && target.bbox !== null && targetDrawn ? scaleBox(target.bbox, target.page_dims, targetDrawn) : null;

  const boxKey = box ? `${targetPage}:${box.left}:${box.top}:${box.width}` : null;
  useEffect(() => {
    if (boxKey && pendingJump.current) {
      pendingJump.current = false;
      outlineRef.current?.scrollIntoView?.({ block: "center", inline: "nearest" });
    }
  }, [boxKey, jumpKey, target]);

  // The page indicator follows the scroll: the page under the upper quarter of the view, or the
  // last page once the scroll can go no further.
  const onScroll = () => {
    const sc = boxRef.current;
    if (!sc || !doc) return;
    if (sc.scrollTop > 0 && sc.scrollTop + sc.clientHeight >= sc.scrollHeight - 2) {
      setCurrent(doc.numPages);
      return;
    }
    const probe = sc.scrollTop + sc.clientHeight / 4;
    let n = 1;
    for (let i = 1; i <= doc.numPages; i++) {
      const s = slotRefs.current[i];
      if (s && s.offsetTop <= probe) n = i;
    }
    setCurrent(n);
  };

  const commitDraft = () => {
    if (draft !== null) {
      const n = Number.parseInt(draft, 10);
      if (Number.isFinite(n)) goTo(n);
    }
    setDraft(null);
  };
  const aspect = (() => {
    const first = Object.values(drawn)[0];
    return first && first.width > 0 ? first.height / first.width : LETTER;
  })();
  const pages = Array.from({ length: numPages }, (_, i) => i + 1);

  return (
    <div className="flex flex-col min-w-0" data-pdf-pane data-pdf-state={state.phase}>
      <div className="flex items-center justify-between mb-1.5 text-[10px] font-mono uppercase tracking-widest text-slate-500">
        <span>source</span>
        {doc && (
          <PageNavigator
            current={current}
            total={numPages}
            draft={draft}
            onDraft={setDraft}
            onCommit={commitDraft}
            onCancel={() => setDraft(null)}
            onPrev={() => goTo(current - 1)}
            onNext={() => goTo(current + 1)}
            prevDisabled={current <= 1}
            nextDisabled={current >= numPages}
          />
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
        onScroll={onScroll}
        data-pdf-scroller
      >
        {state.phase === "failed" ? (
          <p className="p-4 text-[11px] text-slate-700" role="alert" data-pdf-failed>
            {state.why} The rows on the left are still the extraction to vet.
          </p>
        ) : state.phase === "loading" ? (
          <p className="p-4 text-[11px] text-slate-500">loading source…</p>
        ) : (
          <div className="flex flex-col gap-1.5 bg-slate-400/60">
            {pages.map((n) => {
              const d = drawn[n];
              return (
                <div
                  key={n}
                  ref={(el) => {
                    slotRefs.current[n] = el;
                  }}
                  className="relative bg-white"
                  style={{ width: d?.width ?? width, height: d?.height ?? Math.round(width * aspect) }}
                  data-pdf-slot={n}
                  data-pdf-slot-drawn={d ? "" : undefined}
                >
                  <canvas
                    ref={(el) => {
                      canvasRefs.current[n] = el;
                    }}
                    className="block"
                    aria-label={`source page ${n}`}
                  />
                  {!d && !broken[n] && <p className="absolute inset-0 p-4 text-[11px] text-slate-500">drawing page {n}…</p>}
                  {broken[n] && (
                    <p className="absolute inset-0 p-4 text-[11px] text-slate-700" role="alert" data-pdf-failed>
                      {broken[n]} The rows on the left are still the extraction to vet.
                    </p>
                  )}
                  {box && n === targetPage && (
                    <div
                      ref={outlineRef}
                      className={`absolute pointer-events-none rounded-sm ${OUTLINE_CLASS[quality]}`}
                      style={{ left: box.left, top: box.top, width: box.width, height: box.height }}
                      data-evidence-outline
                      data-evidence-outline-page={n}
                      data-evidence-quality={quality}
                    />
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
      {target && target.bbox === null && targetPage !== null && targetDrawn && (
        <p className="mt-1.5 text-[10px] text-slate-400" data-evidence-caption="no-box">
          {`on page ${targetPage}, no box: the value is stated on this page, with no box to outline.`}
        </p>
      )}
      {box && targetPage !== null && (
        <p className="mt-1.5 text-[10px] text-slate-400" data-evidence-caption={quality}>
          {caption ?? outlineCaption(quality, targetPage, sharedBy)}
        </p>
      )}
    </div>
  );
}
