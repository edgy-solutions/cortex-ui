/**
 * FiguresSlideIn — figure-view panel triggered from a Source card click.
 *
 * Reads `GET /data_module/figures?uri=<source URI>` on the cortex-bff
 * and renders each figure per the rendering-origin discipline:
 *
 *   - `pipeline`             → inline image via FederatedImage
 *   - `supplied_override`    → inline image + visible "supplied
 *                              rendering" badge so the operator-
 *                              supplied override never reads as a
 *                              pipeline result
 *   - `format_not_supported` → honest placeholder card with figure ID,
 *                              source format note, no broken image
 *   - "" (unknown / legacy)  → caption-only fallback
 *
 * The slide-in opens from the right edge as a fixed-position panel.
 * The trigger lives on SourcesTrail's SourceRow (see the
 * "View figures" button added there). Closing returns to the trail.
 *
 * Per the architect's 2026-06-30 framing: the slide-in is the
 * deterministic verifier for figures — independent of whether the
 * LLM cooperatively included `![alt](s3://...)` markdown in the
 * answer text, the figures linked to the data module are surfaced
 * here.
 */
import { motion, AnimatePresence } from "framer-motion";
import { useEffect, useState } from "react";
import { useAuth } from "react-oidc-context";
import { X, Image as ImageIcon, AlertTriangle, Sparkles } from "lucide-react";
import { FederatedImage } from "@/components/mesh/FederatedImage";
import { config } from "@/config";

interface Figure {
  uri: string;
  label: string;
  url: string;
  rendering_origin: string; // "pipeline" | "supplied_override" | "format_not_supported" | ""
}

interface FiguresResponse {
  uri: string;
  figures: Figure[];
}

interface Props {
  /** Data module URI to fetch figures for. When null, panel is closed. */
  sourceUri: string | null;
  /** Display label for the source (shown in the panel header). */
  sourceLabel?: string;
  onClose: () => void;
}

export function FiguresSlideIn({ sourceUri, sourceLabel, onClose }: Props) {
  const [data, setData] = useState<FiguresResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const auth = useAuth();
  const token = auth.user?.access_token;

  useEffect(() => {
    if (!sourceUri) {
      setData(null);
      setError(null);
      return;
    }
    if (!token) {
      setError("not authenticated");
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    const url = `${config.VITE_API_URL}/data_module/figures?uri=${encodeURIComponent(sourceUri)}`;
    fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => {
        if (!r.ok) throw new Error(`${r.status} ${r.statusText}`);
        return r.json() as Promise<FiguresResponse>;
      })
      .then((json) => {
        if (!cancelled) setData(json);
      })
      .catch((e: unknown) => {
        if (!cancelled) {
          const msg = e instanceof Error ? e.message : String(e);
          setError(msg);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [sourceUri, token]);

  const open = sourceUri !== null;

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop — click to close. */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm"
            onClick={onClose}
          />

          {/* Slide-in panel from right. Fixed-width on lg, full-width on
              narrow viewports. */}
          <motion.aside
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "spring", stiffness: 340, damping: 32 }}
            className="fixed right-0 top-0 bottom-0 z-50 w-full sm:w-[520px] lg:w-[640px] bg-slate-950 border-l border-slate-800 shadow-2xl overflow-y-auto"
          >
            {/* Header */}
            <div className="sticky top-0 z-10 backdrop-blur-md bg-slate-950/90 border-b border-slate-800 px-5 py-4 flex items-start gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <ImageIcon className="w-4 h-4 text-neon-cyan/80" />
                  <span className="text-[10px] font-mono uppercase tracking-widest text-slate-500">
                    Data Module · Figures
                  </span>
                </div>
                <p className="text-sm font-mono text-slate-200 truncate" title={sourceLabel ?? sourceUri ?? ""}>
                  {sourceLabel ?? sourceUri}
                </p>
              </div>
              <button
                onClick={onClose}
                className="rounded-md p-1.5 text-slate-400 hover:text-slate-100 hover:bg-slate-800/60 transition-colors"
                aria-label="Close figures panel"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Body */}
            <div className="p-5 space-y-4">
              {loading && (
                <p className="text-xs font-mono text-slate-500 italic">
                  Loading figures from this data module…
                </p>
              )}
              {error && (
                <div className="rounded-md border border-rose-500/40 bg-rose-500/5 p-3">
                  <p className="text-xs font-mono text-rose-300">
                    Could not load figures: {error}
                  </p>
                </div>
              )}
              {!loading && !error && data && data.figures.length === 0 && (
                <p className="text-xs font-mono text-slate-500 italic">
                  No figures are linked to this data module.
                </p>
              )}
              {!loading && !error && data && data.figures.map((fig) => (
                <FigureCard key={fig.uri} figure={fig} />
              ))}
            </div>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}

function FigureCard({ figure }: { figure: Figure }) {
  const origin = figure.rendering_origin;
  const isRenderable = origin === "pipeline" || origin === "supplied_override";
  const isSupplied = origin === "supplied_override";
  const isUnsupported = origin === "format_not_supported";

  return (
    <div className="rounded-lg border border-slate-800/80 bg-slate-900/40 overflow-hidden">
      {/* Caption / header */}
      <div className="px-3 py-2 border-b border-slate-800/60 flex items-center gap-2">
        <span className="text-xs font-mono text-slate-200 flex-1 truncate" title={figure.label}>
          {figure.label}
        </span>
        {isSupplied && (
          <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-amber-500/15 border border-amber-500/40 text-amber-300 uppercase tracking-widest flex items-center gap-1">
            <Sparkles className="w-2.5 h-2.5" />
            Supplied Rendering
          </span>
        )}
        {isUnsupported && (
          <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-slate-700/30 border border-slate-600/40 text-slate-400 uppercase tracking-widest flex items-center gap-1">
            <AlertTriangle className="w-2.5 h-2.5" />
            Format Not Supported
          </span>
        )}
      </div>

      {/* Body */}
      <div className="bg-black/40 p-3">
        {isRenderable && (
          <FederatedImage
            src={figure.url}
            alt={figure.label}
            className="w-full max-h-[480px] object-contain rounded"
          />
        )}
        {isUnsupported && (
          <div className="rounded border border-slate-700/50 bg-slate-800/30 px-4 py-6">
            <p className="text-xs font-mono text-slate-400 mb-2">
              This figure's source format isn't renderable inline.
            </p>
            <p className="text-[10px] font-mono text-slate-600 break-all">
              Source: {figure.url}
            </p>
          </div>
        )}
        {!origin && (
          // Legacy / unknown origin — show caption only with the URL
          // as a debug hint.
          <p className="text-[10px] font-mono text-slate-500 break-all">
            URL: {figure.url}
          </p>
        )}
      </div>
    </div>
  );
}
