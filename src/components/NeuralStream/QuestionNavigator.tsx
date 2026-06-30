import { motion, AnimatePresence } from "framer-motion";
import { useMemo } from "react";
import {
  CheckCircle2,
  Loader2,
  AlertCircle,
  CircleDot,
  FileText,
  BarChart3,
  Table as TableIcon,
  Network,
  Box,
} from "lucide-react";
import { useCanvasStore } from "@/store/useCanvasStore";
import type { Artifact } from "@/api/types";

/**
 * QuestionNavigator — left-margin durable index of past questions.
 *
 * Reads `useCanvasStore.artifacts` (durable, hydrates on refresh via
 * the Electric subscription started in App.tsx). One row per artifact:
 * `question_text` + a deterministic mini-preview built from REAL
 * fields the artifact carries. Click foregrounds via
 * `setCurrentArtifact(id)`.
 *
 * Decoupled from the message-substrate / conversation-persistence
 * arc (fenced as its own thing). This component does NOT read from
 * `useInterviewStore` (which is browser-memory and dies on reload) —
 * it reads ONLY from the durable artifact collection (which already
 * hydrates on refresh per Hop 3). Every artifact carries its own
 * `question_text` per Decision A; the navigator surfaces that field.
 *
 * Foreground-vs-durable boundary (locked per the architect's
 * 2026-06-29 ruling):
 *   - The LIST is durable. Survives refresh. That's the whole point.
 *   - The SELECTION (`currentArtifactId`) is EPHEMERAL. Reset to
 *     highest-watermark on reload by the store's existing hydrate
 *     behavior. The navigator MUST NOT add client-storage or any
 *     other per-user durable foreground — foreground is ephemeral
 *     by design; the collection is the durable thing.
 *
 * Mini-preview discipline:
 *   - REAL fields only. No fabricated thumbnails, no synthesized
 *     chart bars, no Math.sin tricks. The architect explicitly
 *     called the mockup's `genArtifact` thumbnail approach the
 *     do-not-port path; this component renders only fields the
 *     artifact actually carries (archetype, engine name, source
 *     count, status, watermark).
 *   - Same discipline as the Sources panel: render-what-the-pipeline-
 *     produced, never synthesize.
 *
 * Future viewability note (for after the demo, not now): when
 * multi-user / access-control lands, the navigator's list is one of
 * the viewability surfaces — you see questions whose artifacts you're
 * entitled to. For the single-user demo with per-user interim scoping
 * this is fine (you see your own). Noted as a known-later-consequence
 * so it's not a surprise when the access-control arc lands.
 */
export function QuestionNavigator() {
  const artifacts = useCanvasStore((s) => s.artifacts);
  const currentArtifactId = useCanvasStore((s) => s.currentArtifactId);
  const setCurrentArtifact = useCanvasStore((s) => s.setCurrentArtifact);

  // Sort by server-assigned watermark DESCENDING (newest first), with
  // created_at as tiebreaker for artifacts that share a watermark
  // (or both have the pre-projection sentinel 0). Watermark is the
  // server's apply-order position per ADR / Decision 3 Option C; it
  // is the right ordering for "most-recent question on top."
  const sortedArtifacts = useMemo(() => {
    return [...artifacts].sort((a, b) => {
      if (b.watermark !== a.watermark) return b.watermark - a.watermark;
      return b.created_at - a.created_at;
    });
  }, [artifacts]);

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <div className="px-6 py-3 border-b border-glass-border flex items-center gap-2">
        <CircleDot className="w-3.5 h-3.5 text-neon-cyan/70" />
        <span className="text-[10px] font-mono uppercase tracking-widest text-slate-400">
          Questions
        </span>
        <span className="ml-auto text-[10px] font-mono text-slate-500">
          {sortedArtifacts.length}
        </span>
      </div>

      <div className="flex-1 overflow-y-auto px-3 py-3 space-y-2">
        {sortedArtifacts.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-center px-4">
            <div className="w-12 h-12 rounded-full border border-neon-blue/30 flex items-center justify-center mb-3 animate-breathe">
              <div className="w-6 h-6 rounded-full bg-neon-blue/10 animate-pulse-neon" />
            </div>
            <p className="text-slate-500 font-mono text-xs mb-1">
              Begin the interrogation
            </p>
            <p className="text-slate-600 text-[10px] max-w-md leading-relaxed">
              Each question you ask becomes a durable artifact you can
              click back to. The list survives refresh.
            </p>
          </div>
        )}

        <AnimatePresence initial={false}>
          {sortedArtifacts.map((artifact) => (
            <QuestionRow
              key={artifact.id}
              artifact={artifact}
              isSelected={artifact.id === currentArtifactId}
              onClick={() => setCurrentArtifact(artifact.id)}
            />
          ))}
        </AnimatePresence>
      </div>
    </div>
  );
}

interface QuestionRowProps {
  artifact: Artifact;
  isSelected: boolean;
  onClick: () => void;
}

function QuestionRow({ artifact, isSelected, onClick }: QuestionRowProps) {
  const status = artifact.status;
  const engineName = artifact.routing?.handled_by?.engine_name;
  const sourceCount = artifact.sources?.length ?? 0;
  const archetype = _firstArchetype(artifact);

  return (
    <motion.button
      layout
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
      onClick={onClick}
      className={`w-full text-left rounded-lg border p-3 transition-colors group ${
        isSelected
          ? "bg-neon-blue/10 border-neon-blue/50 ring-1 ring-neon-blue/30"
          : "bg-slate-900/40 border-slate-800/50 hover:border-neon-cyan/30 hover:bg-slate-900/60"
      }`}
    >
      <div className="flex items-start gap-2 mb-1.5">
        <StatusIcon status={status} />
        <div className="flex-1 min-w-0">
          <p
            className={`text-xs font-mono leading-snug line-clamp-2 ${
              isSelected ? "text-slate-100" : "text-slate-300"
            }`}
            title={artifact.question_text}
          >
            {artifact.question_text || "(no question text)"}
          </p>
        </div>
      </div>

      {/* Mini-preview: deterministic fields only. */}
      <div className="flex items-center gap-2 flex-wrap pl-6">
        {archetype && (
          <span className="flex items-center gap-1 text-[9px] font-mono uppercase tracking-wider text-slate-500">
            <ArchetypeIcon archetype={archetype} />
            {_humanizeArchetype(archetype)}
          </span>
        )}
        {engineName && (
          <span className="text-[9px] font-mono text-neon-cyan/60 tracking-wide">
            {engineName}
          </span>
        )}
        {sourceCount > 0 && (
          <span className="text-[9px] font-mono text-slate-500">
            {sourceCount} {sourceCount === 1 ? "source" : "sources"}
          </span>
        )}
        {status === "pending" && (
          <span className="text-[9px] font-mono text-amber-400/70 italic">
            working…
          </span>
        )}
        {status === "failed" && (
          <span className="text-[9px] font-mono text-rose-400/80 italic">
            failed
          </span>
        )}
      </div>
    </motion.button>
  );
}

function StatusIcon({ status }: { status: Artifact["status"] }) {
  if (status === "pending") {
    return (
      <Loader2 className="w-3.5 h-3.5 text-amber-400 animate-spin flex-shrink-0 mt-0.5" />
    );
  }
  if (status === "failed") {
    return <AlertCircle className="w-3.5 h-3.5 text-rose-400 flex-shrink-0 mt-0.5" />;
  }
  return (
    <CheckCircle2 className="w-3.5 h-3.5 text-neon-green/80 flex-shrink-0 mt-0.5" />
  );
}

function ArchetypeIcon({ archetype }: { archetype: string }) {
  const a = archetype.toUpperCase();
  if (a === "KNOWLEDGE_DOCUMENT") return <FileText className="w-2.5 h-2.5" />;
  if (a === "CHART_WIDGET" || a === "BAR_CHART" || a === "LINE_CHART") {
    return <BarChart3 className="w-2.5 h-2.5" />;
  }
  if (a === "TABLE" || a === "ROW_TABLE") return <TableIcon className="w-2.5 h-2.5" />;
  if (a === "PROCESS_TOPOLOGY") return <Network className="w-2.5 h-2.5" />;
  return <Box className="w-2.5 h-2.5" />;
}

/**
 * Pull the first archetype from the artifact's rendered_output. Real
 * field, deterministic — no synthesis. Returns null if no components
 * are present (pending artifacts) or rendered_output is null.
 */
function _firstArchetype(artifact: Artifact): string | null {
  const ro = artifact.rendered_output;
  if (!ro) return null;
  if (typeof ro.archetype === "string" && ro.archetype) return ro.archetype;
  const first = ro.components?.[0];
  if (first && typeof first === "object" && "archetype" in first) {
    const a = (first as { archetype?: unknown }).archetype;
    if (typeof a === "string" && a) return a;
  }
  return null;
}

function _humanizeArchetype(archetype: string): string {
  // ALL_CAPS_SNAKE → Title Case, keeping it short for the row chip.
  return archetype
    .toLowerCase()
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}
