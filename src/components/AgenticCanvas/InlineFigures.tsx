/**
 * InlineFigures — figures rendered IN the answer body, not in a slide-in.
 *
 * Per architect's 2026-06-30 ruling: figures should NOT require the
 * user to "dig" into a structural slide-in panel to see them, and the
 * LLM should NOT narrate figure availability in prose. Image
 * placement is the RENDERER'S job — deterministic, based on the data
 * module's structural figure_refs, not on LLM cooperation.
 *
 * This component is the renderer-deterministic surface for figures in
 * the answer body. Sourced ENTIRELY from the cortex-bff
 * `/data_module/figures?uri=...` endpoint, which reads Neo4j's
 * `:hasFigure` edges from the data module. Same endpoint the
 * FiguresSlideIn uses — different surface, same source of truth.
 *
 * The interim placement is a "Figures" section BELOW the prose body.
 * The durable arc (positional placement next to the prose that
 * references each figure) requires structured rendered_output with
 * per-section figure_refs; the LLM emits prose-with-markers and the
 * renderer fills positional placement. Tracked as the next arc.
 *
 * Four-state rendering discipline (same as FiguresSlideIn):
 *   - pipeline             → inline image via FederatedImage
 *   - supplied_override    → inline image + "Supplied Rendering" badge
 *   - format_not_supported → honest in-place placeholder card with
 *                            figure ID, caption, "format not supported"
 *   - unresolved           → rose "Unresolved at Ingest" placeholder
 *   - "" (legacy)          → URL-extension sniff fallback
 *
 * Data-module URI selection: the artifact's `sources` carry the
 * mil-URI label of each cited DM. We pick the DOMINANT DM — the one
 * cited by the most sources — and fetch its figures. For
 * single-DM answers (e.g., "Show me the descriptive data module for
 * X"), this is unambiguous. For cross-DM answers (16 sources from 3
 * different DMs), the dominant pick is the most-evidenced one.
 *
 * Honest-when-no-figures: if the dominant DM has zero figures, the
 * section renders nothing (no empty header). The slide-in panel is
 * still available via the Sources card's camera-icon trigger for
 * deeper drill-down.
 */
import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { useAuth } from "react-oidc-context";
import { Image as ImageIcon, AlertTriangle, Sparkles } from "lucide-react";
import { FederatedImage } from "@/components/mesh/FederatedImage";
import { config } from "@/config";
import type { Artifact, Source } from "@/api/types";

interface Figure {
  uri: string;
  label: string;
  url: string | null;
  rendering_origin: string;
}

interface FiguresResponse {
  uri: string;
  figures: Figure[];
}

const _BROWSER_RENDERABLE_EXTS = new Set([
  ".png", ".bmp", ".jpg", ".jpeg", ".gif", ".webp", ".svg",
]);

function _isBrowserRenderableUrl(url: string | null | undefined): boolean {
  if (!url) return false;
  const lower = url.toLowerCase();
  for (const ext of _BROWSER_RENDERABLE_EXTS) {
    if (lower.endsWith(ext)) return true;
  }
  return false;
}

/**
 * Compute the dominant data-module URI from an artifact's sources.
 * Picks the mil-URI cited by the MOST sources. Returns null if the
 * artifact has no sources or no source label looks like an ontology
 * URI (e.g., catalog-asset-only answers).
 *
 * "Dominant" rather than "first" because Engine W's sources can be
 * returned in any order; the most-evidenced DM is the one the answer
 * is structurally about. For single-DM answers this is unambiguous;
 * for cross-DM answers it picks the principal subject.
 */
function _dominantDataModuleUri(sources: Source[]): string | null {
  if (!sources || sources.length === 0) return null;
  const counts = new Map<string, number>();
  for (const s of sources) {
    const candidate =
      typeof s.label === "string" &&
      (s.label.startsWith("http://") || s.label.startsWith("https://"))
        ? s.label
        : typeof s.uri === "string" &&
          (s.uri.startsWith("http://") || s.uri.startsWith("https://"))
        ? s.uri
        : null;
    if (!candidate) continue;
    counts.set(candidate, (counts.get(candidate) ?? 0) + 1);
  }
  if (counts.size === 0) return null;
  let bestUri: string | null = null;
  let bestCount = 0;
  for (const [uri, count] of counts) {
    if (count > bestCount) {
      bestUri = uri;
      bestCount = count;
    }
  }
  return bestUri;
}

interface InlineFiguresProps {
  artifact: Artifact;
}

export function InlineFigures({ artifact }: InlineFiguresProps) {
  const dataModuleUri = useMemo(
    () => _dominantDataModuleUri(artifact.sources),
    [artifact.sources],
  );
  const [figures, setFigures] = useState<Figure[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const auth = useAuth();
  const token = auth.user?.access_token;

  useEffect(() => {
    if (!dataModuleUri || !token) {
      setFigures(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    const url = `${config.VITE_API_URL}/data_module/figures?uri=${encodeURIComponent(
      dataModuleUri,
    )}`;
    fetch(url, { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => {
        if (!r.ok) throw new Error(`${r.status} ${r.statusText}`);
        return r.json() as Promise<FiguresResponse>;
      })
      .then((json) => {
        if (!cancelled) setFigures(json.figures ?? []);
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
  }, [dataModuleUri, token]);

  // Honest empty: no DM URI → render nothing. No figure node → render
  // nothing (no empty header). The renderer surfaces figures only
  // when there's something deterministic to show.
  if (!dataModuleUri) return null;
  if (!loading && !error && (figures === null || figures.length === 0)) {
    return null;
  }

  return (
    <div className="mt-6 pt-6 border-t border-slate-800/60">
      <div className="flex items-center gap-2 mb-4">
        <ImageIcon className="w-4 h-4 text-neon-cyan/80" />
        <span className="text-[10px] font-mono uppercase tracking-widest text-slate-400">
          Figures
        </span>
        {figures && figures.length > 0 && (
          <span className="text-[10px] font-mono text-slate-500">
            {figures.length}
          </span>
        )}
      </div>

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

      {!loading && !error && figures && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {figures.map((fig) => (
            <InlineFigureCard key={fig.uri} figure={fig} />
          ))}
        </div>
      )}
    </div>
  );
}

function InlineFigureCard({ figure }: { figure: Figure }) {
  const origin = figure.rendering_origin;
  const isExplicitlyRenderable =
    origin === "pipeline" || origin === "supplied_override";
  const isRenderable =
    isExplicitlyRenderable ||
    (!origin && _isBrowserRenderableUrl(figure.url));
  const isSupplied = origin === "supplied_override";
  const isUnsupported = origin === "format_not_supported";
  const isUnresolved = origin === "unresolved";

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
      className="rounded-lg border border-slate-800/80 bg-slate-900/40 overflow-hidden"
    >
      <div className="px-3 py-2 border-b border-slate-800/60 flex items-center gap-2">
        <span
          className="text-xs font-mono text-slate-200 flex-1 truncate"
          title={figure.label}
        >
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
        {isUnresolved && (
          <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-rose-500/15 border border-rose-500/40 text-rose-300 uppercase tracking-widest flex items-center gap-1">
            <AlertTriangle className="w-2.5 h-2.5" />
            Unresolved at Ingest
          </span>
        )}
      </div>

      <div className="bg-black/40 p-3">
        {isRenderable && figure.url && (
          <FederatedImage
            src={figure.url}
            alt={figure.label}
            className="w-full max-h-[320px] object-contain rounded"
          />
        )}
        {isUnsupported && (
          <div className="rounded border border-slate-700/50 bg-slate-800/30 px-4 py-5">
            <p className="text-xs font-mono text-slate-400 mb-1">
              Source format isn't renderable inline.
            </p>
            {figure.url && (
              <p className="text-[10px] font-mono text-slate-600 break-all">
                Source: {figure.url}
              </p>
            )}
          </div>
        )}
        {isUnresolved && (
          <div className="rounded border border-rose-500/30 bg-rose-500/5 px-4 py-5">
            <p className="text-xs font-mono text-rose-200 mb-1">
              Source file not resolved at ingest time.
            </p>
            <p className="text-[10px] font-mono text-rose-400/70 leading-relaxed">
              Boardno{" "}
              <span className="text-rose-300 font-bold">{figure.label}</span>{" "}
              is referenced by the data module but no matching uploaded
              file was found in the bundle's graphics manifest.
            </p>
          </div>
        )}
        {!origin && !isRenderable && (
          <p className="text-[10px] font-mono text-slate-500 break-all">
            URL: {figure.url ?? "(no url)"}
          </p>
        )}
      </div>
    </motion.div>
  );
}
