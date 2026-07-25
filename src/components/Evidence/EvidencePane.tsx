import { useEffect, useState } from "react";
import { FileSearch, X } from "lucide-react";
import { useEvidenceStore } from "@/store/useEvidenceStore";
import { fetchNoticeProvenance } from "@/api/client";
import { EvidenceCard, type ProvenanceItem } from "./EvidenceCard";

/**
 * Host for the SUMMONED evidence card: reads the evidence store, fetches the
 * notice's provenance once (read-side join at display time), finds the item for
 * the summoned part, and renders EvidenceCard. Degrades HONESTLY — a synthetic
 * notice with no source PDF says so rather than faking a highlight.
 *
 * Renders nothing unless something is summoned; the caller places it beside the
 * review card (subordinate, yields on dismiss).
 */
export function EvidencePane() {
  const summoned = useEvidenceStore((s) => s.summoned);
  const dismiss = useEvidenceStore((s) => s.dismiss);
  const [items, setItems] = useState<ProvenanceItem[] | null>(null);
  const [pageImg, setPageImg] = useState<string | null>(null);
  const [state, setState] = useState<"idle" | "loading" | "error">("idle");
  const noticeId = summoned?.noticeId;

  useEffect(() => {
    if (!noticeId) return;
    let live = true;
    setState("loading");
    fetchNoticeProvenance(noticeId)
      .then((resp) => {
        if (!live) return;
        setItems(resp.items);
        setPageImg(resp.page_image_url ?? null);
        setState("idle");
      })
      .catch(() => live && setState("error"));
    return () => {
      live = false;
    };
  }, [noticeId]);

  if (!summoned) return null;

  const item = items?.find((i) => i.mpn === summoned.mpn);

  // Honest empty/degraded states — never a faked highlight.
  if (state === "loading") return <Frame onDismiss={dismiss} note="Loading evidence…" />;
  if (state === "error")
    return (
      <Frame
        onDismiss={dismiss}
        note={`No document provenance for this notice. It may be a synthetic notice with no source PDF (the demo notices are). When doc-tools serves review.json + page images for a real notice, the source region renders here.`}
      />
    );
  if (!item)
    return (
      <Frame onDismiss={dismiss} note={`No provenance record for ${summoned.mpn} in this notice.`} />
    );

  return (
    <EvidenceCard
      item={{ ...item, page_image_url: item.page_image_url ?? pageImg }}
      onDismiss={dismiss}
    />
  );
}

function Frame({ note, onDismiss }: { note: string; onDismiss: () => void }) {
  return (
    <div className="glass-panel h-full flex flex-col border-pink-500/20">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-white/10 bg-white/5">
        <FileSearch className="w-4 h-4 text-neon-pink" />
        <span className="font-mono text-[11px] font-bold text-slate-200 tracking-widest uppercase flex-1">
          Evidence
        </span>
        <button onClick={onDismiss} className="text-slate-500 hover:text-white" title="Dismiss">
          <X className="w-4 h-4" />
        </button>
      </div>
      <div className="flex-1 flex items-center justify-center p-6">
        <p className="text-[11px] font-mono text-slate-400 leading-relaxed text-center max-w-sm">{note}</p>
      </div>
    </div>
  );
}
