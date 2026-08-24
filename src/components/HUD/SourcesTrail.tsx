import { motion } from "framer-motion";
import { useState } from "react";
import { FileText, Database, BarChart3, ExternalLink, Quote, Image as ImageIcon } from "lucide-react";
import { useCurrentSources } from "@/store/useCanvasStore";
import type { Source } from "@/api/types";
import { presentConfidence } from "@/lib/confidence";
import { FiguresSlideIn } from "./FiguresSlideIn";

/**
 * SourcesTrail — Phase 3 of the grounding panel.
 *
 * Shows the actual citations the engines returned for this turn. The
 * architect's discipline: the snippet is matched-chunk text (what the
 * retriever actually saw), NOT an LLM-generated summary — synthesis at
 * the citation layer is the exact failure this panel is built to
 * prevent.
 *
 * Sources persist after the answer arrives so users can click through
 * to audit the underlying evidence.
 */
export function SourcesTrail() {
  // Per ADR-0023 Phase 1: sources live on the current Artifact, not
  // on a per-turn singleton in useInterviewStore.
  const sources = useCurrentSources();

  // Open-source tracking for the FiguresSlideIn panel. A click on a
  // source's "View figures" button opens the panel for that source's
  // data-module URI; the panel reads figures from cortex-bff's
  // `/data_module/figures?uri=` endpoint and renders them with the
  // rendering-origin three-state shape (pipeline / supplied_override /
  // format_not_supported). Closing returns null and the panel
  // animates out. Only one panel is open at a time.
  const [openSource, setOpenSource] = useState<Source | null>(null);

  // The bff endpoint takes the data-module URI as input. For
  // helmet WPs the `source.label` is the WP URI (e.g.,
  // "http://edgy-solutions.com/ontology/mil#wpn-m0004-1-1680-TNG").
  // The `source.uri` is the Weaviate chunk URI (e.g.,
  // "weaviate://DocumentChunk/<uuid>") — useful for chunk-level audit
  // but not the right input for figures. Prefer label when it looks
  // like an ontology URI.
  const openDataModuleUri = (() => {
    if (!openSource) return null;
    if (openSource.label.startsWith("http://") || openSource.label.startsWith("https://")) {
      return openSource.label;
    }
    return openSource.uri;
  })();

  return (
    <>
      <div className="glass-panel-sm p-3">
        <div className="flex items-center gap-2 mb-3">
          <Quote className="w-3.5 h-3.5 text-neon-green/70" />
          <span className="text-[10px] font-mono uppercase tracking-widest text-slate-500">
            Sources & Evidence
          </span>
          {sources.length > 0 && (
            <span className="ml-auto text-[10px] font-mono text-neon-green/50">
              {sources.length}
            </span>
          )}
        </div>

        {sources.length === 0 ? (
          <p className="text-xs text-slate-600 italic font-mono">
            {/* "No citations YET ... evidence APPEARS as engines return matches" promises
                an arrival. For a computed answer (a plan-state calculation, say) there is
                no document to cite and nothing is ever coming, so the old copy read as a
                panel stuck waiting — a successful answer wearing a pending state. This
                says what is true in both cases without claiming which: no external source
                backs this answer. Absence of citations is a fact about the answer, not a
                stage in its lifecycle. */}
            No external sources cited for this answer.
          </p>
        ) : (
          <div className="space-y-2">
            {sources.map((src, i) => (
              <SourceRow
                key={`${src.uri}-${i}`}
                source={src}
                onViewFigures={() => setOpenSource(src)}
              />
            ))}
          </div>
        )}
      </div>

      <FiguresSlideIn
        sourceUri={openDataModuleUri}
        sourceLabel={openSource?.label}
        onClose={() => setOpenSource(null)}
      />
    </>
  );
}

function SourceIcon({ type }: { type: Source["type"] }) {
  if (type === "graph_node") {
    return <Database className="w-3.5 h-3.5 text-neon-cyan/80" />;
  }
  if (type === "catalog_asset") {
    return <BarChart3 className="w-3.5 h-3.5 text-neon-purple/80" />;
  }
  return <FileText className="w-3.5 h-3.5 text-neon-blue/80" />;
}

function SourceRow({
  source,
  onViewFigures,
}: {
  source: Source;
  onViewFigures: () => void;
}) {
  const relevance =
    typeof source.relevance === "number"
      ? presentConfidence(source.relevance)
      : null;
  // "View figures" trigger fires when the source's label looks like a
  // mil/ontology data-module URI (the figures endpoint expects one of
  // those). Other source types (chunks, catalog assets) don't have an
  // associated data module to enumerate figures from.
  const canViewFigures =
    source.type === "document" &&
    (source.label.includes("#wpn-") ||
      source.label.includes("#DataModule") ||
      source.label.includes("mil#"));
  return (
    <motion.div
      initial={{ opacity: 0, x: 6 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.3 }}
      className="rounded-md bg-slate-900/40 border border-slate-800/50 p-2 hover:border-neon-cyan/30 transition-colors group"
    >
      <div className="flex items-start gap-2">
        <SourceIcon type={source.type} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-xs font-mono text-slate-300 truncate flex-1">
              {source.label}
            </span>
            {canViewFigures && (
              <button
                onClick={onViewFigures}
                className="text-slate-600 hover:text-neon-cyan"
                title="View figures for this data module"
              >
                <ImageIcon className="w-3 h-3" />
              </button>
            )}
            {source.open_url && (
              <a
                href={source.open_url}
                target="_blank"
                rel="noreferrer"
                className="text-slate-600 hover:text-neon-cyan"
                title="Open source"
              >
                <ExternalLink className="w-3 h-3" />
              </a>
            )}
          </div>
          {source.snippet && (
            <p
              className="mt-1 text-[10px] text-slate-500 italic leading-snug line-clamp-3"
              title={source.snippet}
            >
              &ldquo;{source.snippet}&rdquo;
            </p>
          )}
          {relevance && (
            <div className="mt-1.5 flex items-center gap-2">
              <span className="text-[9px] font-mono text-slate-600 uppercase tracking-wider">
                Match
              </span>
              <div className="flex-1 h-1 bg-slate-800/60 rounded-full overflow-hidden">
                <motion.div
                  className={`h-full ${relevance.colorClass} rounded-full`}
                  initial={{ width: 0 }}
                  animate={{ width: `${relevance.widthPct}%` }}
                  transition={{ duration: 0.5 }}
                />
              </div>
              <span className="text-[9px] font-mono text-slate-500 tabular-nums">
                {relevance.raw.toFixed(2)}
              </span>
            </div>
          )}
        </div>
      </div>
    </motion.div>
  );
}
