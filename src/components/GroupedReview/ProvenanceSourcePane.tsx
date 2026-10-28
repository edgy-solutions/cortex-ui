import { useEffect, useMemo, useState } from "react";
import { fetchNoticeProvenance } from "@/api/client";
import { boxFraction } from "@/lib/bboxScale";
import type { ProvenanceItem } from "../Evidence/EvidenceCard";
import { FederatedImage } from "../mesh/FederatedImage";
import { PageNavigator } from "../ApprovalTask/PageNavigator";

type Phase = "loading" | "error" | "ready";

const nearest = (pages: number[], n: number) =>
  pages.reduce((best, p) => (Math.abs(p - n) < Math.abs(best - n) ? p : best), pages[0]!);

/**
 * The in-card source pane of the grouped disposition review. Fetches the notice's provenance ONCE
 * per notice; the card owns selection and `page` (separate state), this only draws them.
 * A row's evidence is the provenance item whose `mpn` equals the row's mpn (as EvidencePane does).
 */
export function ProvenanceSourcePane({
  noticeId,
  mpn,
  page,
  onPage,
  onLoaded,
}: {
  noticeId: string;
  mpn: string | null;
  page: number | null;
  onPage: (p: number) => void;
  onLoaded?: (items: ProvenanceItem[]) => void;
}) {
  const [phase, setPhase] = useState<Phase>("loading");
  const [items, setItems] = useState<ProvenanceItem[]>([]);
  const [pageImg, setPageImg] = useState<string | null>(null);
  const [draft, setDraft] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    setPhase("loading");
    fetchNoticeProvenance(noticeId)
      .then((resp) => {
        if (!live) return;
        setItems(resp.items);
        setPageImg(resp.page_image_url ?? null);
        setPhase("ready");
        onLoaded?.(resp.items);
      })
      .catch(() => live && setPhase("error"));
    return () => {
      live = false;
    };
    // once per notice: selection and page changes must not refetch (onLoaded is deliberately not a dep)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [noticeId]);

  const pages = useMemo(() => [...new Set(items.map((i) => i.page_number))].sort((a, b) => a - b), [items]);
  const item = mpn ? items.find((i) => i.mpn === mpn) : undefined;
  const shown = page ?? item?.page_number ?? pages[0] ?? null;

  const frame = (note: string, extra?: Record<string, string | number>) => (
    <div className="min-w-0" data-provenance-pane data-provenance-mpn={mpn ?? ""} {...extra}>
      <p className="px-2 py-3 text-[11px] font-mono text-slate-400" role={phase === "error" ? "alert" : undefined}>
        {note}
      </p>
    </div>
  );

  if (phase === "loading") return frame("Loading evidence…");
  if (phase === "error")
    return frame("No document provenance for this notice. It may be a synthetic notice with no source PDF.");
  if (items.length === 0 || shown === null) return frame("No provenance for this notice.");

  const idx = pages.indexOf(shown);
  const at = idx >= 0 ? idx : pages.indexOf(nearest(pages, shown));
  const commit = () => {
    if (draft !== null) {
      const n = Number.parseInt(draft, 10);
      if (Number.isFinite(n)) onPage(nearest(pages, n));
    }
    setDraft(null);
  };

  const onPageItem = item && item.page_number === shown ? item : undefined;
  const pageItem = onPageItem ?? items.find((i) => i.page_number === shown);
  const src = pageItem ? pageItem.page_image_url ?? pageImg : null;
  const fracs = onPageItem ? onPageItem.bboxes.map((b) => boxFraction(b, onPageItem.page_dims)) : [];

  return (
    <div
      className="flex flex-col min-w-0"
      data-provenance-pane
      data-provenance-page={shown}
      data-provenance-mpn={mpn ?? ""}
      {...(item ? { "data-provenance-item-page": item.page_number } : {})}
    >
      <div className="flex items-center justify-between mb-1.5 text-[10px] font-mono uppercase tracking-widest text-slate-500">
        <span>source</span>
        <PageNavigator
          current={shown}
          evidence={{ index: at + 1, count: pages.length }}
          draft={draft}
          onDraft={setDraft}
          onCommit={commit}
          onCancel={() => setDraft(null)}
          onPrev={() => onPage(pages[Math.max(at - 1, 0)]!)}
          onNext={() => onPage(pages[Math.min(at + 1, pages.length - 1)]!)}
          prevDisabled={at <= 0}
          nextDisabled={at >= pages.length - 1}
          testPrefix="pagenav"
        />
      </div>
      {mpn && !item && (
        <p className="mb-1.5 text-[11px] text-amber-400/90" data-provenance-no-item>
          No provenance record for {mpn} in this notice.
        </p>
      )}
      {item && !onPageItem && (
        <p className="mb-1.5 text-[11px] text-slate-400" data-provenance-off-page>
          {mpn} is on page {item.page_number}; showing page {shown}.
        </p>
      )}
      {src ? (
        <div className="max-h-[70vh] overflow-y-auto border border-white/10 rounded bg-slate-950">
          <div className="relative w-full">
            <FederatedImage src={src} alt={`Notice page ${shown}`} className="w-full block" />
            {fracs.map((f, i) => (
              <div
                key={i}
                data-provenance-bbox
                className="absolute border-2 border-neon-pink pointer-events-none"
                style={{ left: `${f.left * 100}%`, top: `${f.top * 100}%`, width: `${f.width * 100}%`, height: `${f.height * 100}%` }}
              />
            ))}
          </div>
        </div>
      ) : (
        <p className="text-[10px] font-mono uppercase tracking-wider text-slate-600">no page image · page {shown}</p>
      )}
    </div>
  );
}
