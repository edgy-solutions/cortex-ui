import { motion } from "framer-motion";
import { FileText, Database, BarChart3, ExternalLink, Quote } from "lucide-react";
import { useInterviewStore } from "@/store/useInterviewStore";
import type { Source } from "@/api/types";
import { presentConfidence } from "@/lib/confidence";

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
  const sources = useInterviewStore((s) => s.sources);

  return (
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
          No citations yet. Evidence appears as engines return matches.
        </p>
      ) : (
        <div className="space-y-2">
          {sources.map((src, i) => (
            <SourceRow key={`${src.uri}-${i}`} source={src} />
          ))}
        </div>
      )}
    </div>
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

function SourceRow({ source }: { source: Source }) {
  const relevance =
    typeof source.relevance === "number"
      ? presentConfidence(source.relevance)
      : null;
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
