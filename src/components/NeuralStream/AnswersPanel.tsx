import { useMemo, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  FileText,
  BarChart3,
  Gauge,
  Network,
  AlertTriangle,
  Box,
  HelpCircle,
  Search,
  ChevronRight,
  Clock,
  Hash,
  Shapes,
} from "lucide-react";
import { useCanvasStore } from "@/store/useCanvasStore";
import {
  useAnswerPanelStore,
  type AnswerSortMode,
} from "@/store/useAnswerPanelStore";
import type { Artifact } from "@/api/types";
import {
  answerSummary,
  hasCapturedSummary,
  answerArchetype,
  archetypeLabel,
  answerTopic,
  isUnresolved,
  type AnswerArchetype,
} from "@/lib/answerDisplay";

/**
 * AnswersPanel — the answer-first left column (ADR-0028 v1 / the Answers
 * Panel spec). Replaces the question-first QuestionNavigator: every row
 * LEADS with the answer's captured S·P summary (read verbatim from the
 * projection — proven live), with the originating question as a dim
 * second line.
 *
 * Reads the same durable, viewability-filtered `useCanvasStore.artifacts`
 * the navigator read — so the list inherits per-user isolation for free,
 * no parallel data path. View prefs (sort, unresolved-expanded) live in
 * `useAnswerPanelStore` (localStorage).
 *
 * v1 scope: summary-led rows, real SemanticArchetype glyphs + a fallback
 * OVERLAY badge (fallback is orthogonal, not a type), TIME/TOPIC/TYPE
 * sort, search, and the collapsed "unresolved (N)" group. Drag-to-canvas
 * is layered on next. NOT aggregation (v2) or workflow-seeding (v3);
 * GRAPH-sort deferred to v1.5 (no cross-answer proximity field exists).
 */
export function AnswersPanel() {
  const artifacts = useCanvasStore((s) => s.artifacts);
  const currentArtifactId = useCanvasStore((s) => s.currentArtifactId);
  const setCurrentArtifact = useCanvasStore((s) => s.setCurrentArtifact);

  const sortMode = useAnswerPanelStore((s) => s.sortMode);
  const setSortMode = useAnswerPanelStore((s) => s.setSortMode);
  const search = useAnswerPanelStore((s) => s.search);
  const setSearch = useAnswerPanelStore((s) => s.setSearch);
  const unresolvedExpanded = useAnswerPanelStore((s) => s.unresolvedExpanded);
  const toggleUnresolved = useAnswerPanelStore((s) => s.toggleUnresolved);

  // Newest-first baseline (watermark desc, created_at tiebreak) — the
  // server's apply-order position, same ordering the navigator used.
  const sorted = useMemo(() => {
    return [...artifacts].sort((a, b) => {
      if (b.watermark !== a.watermark) return b.watermark - a.watermark;
      return b.created_at - a.created_at;
    });
  }, [artifacts]);

  // Ephemeral search over summary + question (case-insensitive).
  const q = search.trim().toLowerCase();
  const filtered = useMemo(() => {
    if (!q) return sorted;
    return sorted.filter(
      (a) =>
        answerSummary(a).toLowerCase().includes(q) ||
        (a.question_text || "").toLowerCase().includes(q)
    );
  }, [sorted, q]);

  // Split: resolved answers go in the main (sorted/grouped) list; dead-
  // ends go in the collapsed "unresolved" group. The discriminator is
  // routing.fallback — imperfect but harmless BECAUSE the treatment is
  // collapse-with-count, not drop (a rare generalist-answer lands here
  // but stays present + one expand away). See lib/answerDisplay.isUnresolved.
  const resolved = useMemo(() => filtered.filter((a) => !isUnresolved(a)), [
    filtered,
  ]);
  const unresolved = useMemo(() => filtered.filter((a) => isUnresolved(a)), [
    filtered,
  ]);

  // Group the resolved answers per the active sort mode.
  const groups = useMemo(
    () => buildGroups(resolved, sortMode),
    [resolved, sortMode]
  );

  const total = artifacts.length;

  return (
    <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
      {/* Header */}
      <div className="px-6 py-3 border-b border-glass-border flex items-center gap-2 flex-shrink-0">
        <span className="text-neon-cyan/70 text-sm leading-none">◎</span>
        <span className="text-[10px] font-mono uppercase tracking-widest text-slate-400">
          Answers
        </span>
        <span className="ml-auto text-[10px] font-mono text-slate-500">
          {total}
        </span>
      </div>

      {/* Search */}
      <div className="px-3 pt-3 flex-shrink-0">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3 h-3 text-slate-600" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search answers…"
            className="w-full bg-slate-900/50 border border-slate-800/60 rounded-md pl-7 pr-2 py-1.5 text-[11px] font-mono text-slate-300 placeholder:text-slate-600 focus:outline-none focus:border-neon-cyan/40"
          />
        </div>
      </div>

      {/* Sort chips (hidden while searching — the mock's RELEVANCE mode) */}
      {!q && (
        <div className="px-3 pt-2 flex items-center gap-1 flex-shrink-0">
          <SortChip mode="TIME" active={sortMode} onPick={setSortMode} icon={<Clock className="w-2.5 h-2.5" />} />
          <SortChip mode="TOPIC" active={sortMode} onPick={setSortMode} icon={<Hash className="w-2.5 h-2.5" />} />
          <SortChip mode="TYPE" active={sortMode} onPick={setSortMode} icon={<Shapes className="w-2.5 h-2.5" />} />
        </div>
      )}
      {q && (
        <div className="px-4 pt-2 flex-shrink-0">
          <span className="text-[9px] font-mono uppercase tracking-widest text-slate-500">
            {resolved.length + unresolved.length} matches · relevance
          </span>
        </div>
      )}

      {/* List */}
      <div className="flex-1 min-h-0 overflow-y-auto px-3 py-3 space-y-2">
        {total === 0 && <EmptyState />}

        {total > 0 && resolved.length === 0 && unresolved.length === 0 && q && (
          <p className="text-slate-600 font-mono text-[11px] px-2 py-4 text-center">
            No answers match “{search}”.
          </p>
        )}

        {/* Resolved answers, grouped per sort mode */}
        {groups.map((g) => (
          <div key={g.key} className="space-y-2">
            {g.label && (
              <div className="flex items-center gap-2 px-1 pt-1">
                <span className="text-[9px] font-mono uppercase tracking-widest text-slate-500">
                  {g.label}
                </span>
                <span className="text-[9px] font-mono text-slate-600">
                  {g.items.length}
                </span>
                <div className="flex-1 h-px bg-slate-800/50" />
              </div>
            )}
            <AnimatePresence initial={false}>
              {g.items.map((a) => (
                <AnswerRow
                  key={a.id}
                  artifact={a}
                  isSelected={a.id === currentArtifactId}
                  onSelect={() => setCurrentArtifact(a.id)}
                  searchHit={q}
                />
              ))}
            </AnimatePresence>
          </div>
        ))}

        {/* Collapsed "unresolved (N)" group — count visible EVEN WHEN
            collapsed (the honest-not-hidden hinge: deprioritized, never
            disappeared). */}
        {unresolved.length > 0 && (
          <div className="pt-1">
            <button
              onClick={toggleUnresolved}
              className="w-full flex items-center gap-2 px-1 py-1.5 group"
            >
              <ChevronRight
                className={`w-3 h-3 text-slate-500 transition-transform ${
                  unresolvedExpanded ? "rotate-90" : ""
                }`}
              />
              <span className="text-[9px] font-mono uppercase tracking-widest text-amber-500/70 group-hover:text-amber-400/90">
                Unresolved
              </span>
              <span className="text-[9px] font-mono text-amber-500/60">
                {unresolved.length}
              </span>
              <div className="flex-1 h-px bg-amber-900/30" />
            </button>
            <AnimatePresence initial={false}>
              {unresolvedExpanded && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ duration: 0.18 }}
                  className="space-y-2 overflow-hidden pt-1"
                >
                  {unresolved.map((a) => (
                    <AnswerRow
                      key={a.id}
                      artifact={a}
                      isSelected={a.id === currentArtifactId}
                      onSelect={() => setCurrentArtifact(a.id)}
                      searchHit={q}
                    />
                  ))}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Grouping
// ─────────────────────────────────────────────────────────────────────

interface AnswerGroup {
  key: string;
  label: string | null; // null = no header (flat TIME list)
  items: Artifact[];
}

function buildGroups(resolved: Artifact[], mode: AnswerSortMode): AnswerGroup[] {
  if (mode === "TIME") {
    // Flat, newest-first (already sorted). No group headers.
    return resolved.length ? [{ key: "__time", label: null, items: resolved }] : [];
  }
  if (mode === "TYPE") {
    const by = new Map<AnswerArchetype, Artifact[]>();
    for (const a of resolved) {
      const t = answerArchetype(a);
      (by.get(t) ?? by.set(t, []).get(t)!).push(a);
    }
    return [...by.entries()]
      .sort((a, b) => b[1].length - a[1].length)
      .map(([t, items]) => ({ key: `type:${t}`, label: archetypeLabel(t), items }));
  }
  // TOPIC — group by the subject class the answer is about.
  const by = new Map<string, Artifact[]>();
  for (const a of resolved) {
    const t = answerTopic(a);
    (by.get(t) ?? by.set(t, []).get(t)!).push(a);
  }
  return [...by.entries()]
    .sort((a, b) => b[1].length - a[1].length)
    .map(([t, items]) => ({ key: `topic:${t}`, label: t, items }));
}

// ─────────────────────────────────────────────────────────────────────
// Row
// ─────────────────────────────────────────────────────────────────────

interface AnswerRowProps {
  artifact: Artifact;
  isSelected: boolean;
  onSelect: () => void;
  searchHit: string;
}

/** Hit-test: was the drop point inside the canvas drop zone? Queries the
 *  dropzone element's bounds directly (not elementFromPoint), so the
 *  dragged row covering the point doesn't matter. */
function droppedOnCanvas(x: number, y: number): boolean {
  const dz = document.querySelector("[data-canvas-dropzone]");
  if (!dz) return false;
  const r = dz.getBoundingClientRect();
  return x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;
}

function AnswerRow({ artifact, isSelected, onSelect, searchHit }: AnswerRowProps) {
  const summary = answerSummary(artifact);
  const captured = hasCapturedSummary(artifact);
  const archetype = answerArchetype(artifact);
  const fallback = isUnresolved(artifact);
  const pending = artifact.status === "pending";
  const failed = artifact.status === "failed";

  const pinAnswer = useAnswerPanelStore((s) => s.pinAnswer);
  const setCanvasOpen = useAnswerPanelStore((s) => s.setCanvasOpen);
  const pinCount = useAnswerPanelStore((s) => s.pins.length);
  // Distinguishes a click (select) from a drag (pin). onDragStart only
  // fires past framer-motion's movement threshold, so a plain click
  // leaves this false and selects normally.
  const draggedRef = useRef(false);

  return (
    <motion.button
      // The row IS the drag handle (drag anywhere on it). dragSnapToOrigin
      // returns it to place so the list never reflows — the row lifts and
      // settles back; the pin lands on the canvas.
      drag
      dragSnapToOrigin
      dragElastic={0.15}
      whileDrag={{ scale: 0.96, opacity: 0.55, rotate: -2, zIndex: 50 }}
      onDragStart={() => {
        draggedRef.current = true;
      }}
      onDragEnd={(_e, info) => {
        if (droppedOnCanvas(info.point.x, info.point.y)) {
          // Cascade position (repositionable after) — sidesteps
          // closed-canvas / header-offset coordinate mapping.
          const n = pinCount % 8;
          pinAnswer(artifact.id, 32 + n * 30, 32 + n * 30);
          setCanvasOpen(true);
        }
        // Reset AFTER the click that follows pointerup, so the guard suppresses it.
        setTimeout(() => {
          draggedRef.current = false;
        }, 0);
      }}
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
      onClick={() => {
        if (draggedRef.current) return; // was a drag, not a click
        onSelect();
      }}
      className={`w-full text-left rounded-lg border p-2.5 transition-colors group cursor-grab active:cursor-grabbing ${
        isSelected
          ? "bg-neon-blue/10 border-neon-blue/50 ring-1 ring-neon-blue/30"
          : "bg-slate-900/40 border-slate-800/50 hover:border-neon-cyan/30 hover:bg-slate-900/60"
      }`}
    >
      <div className="flex items-start gap-2.5">
        <ArchetypeGlyph archetype={archetype} fallback={fallback} />
        <div className="flex-1 min-w-0">
          {/* Lead line: the captured S·P summary (verbatim). */}
          <p
            className={`text-[12px] font-mono leading-snug line-clamp-2 ${
              isSelected ? "text-slate-100" : "text-slate-200"
            } ${!captured ? "italic text-slate-400" : ""}`}
            title={summary}
          >
            {highlight(summary, searchHit)}
          </p>
          {/* Dim second line: the originating question. */}
          {captured && artifact.question_text && (
            <p
              className="text-[10px] font-mono leading-snug text-slate-500 line-clamp-1 mt-0.5"
              title={artifact.question_text}
            >
              <span className="text-slate-600">Q · </span>
              {highlight(artifact.question_text, searchHit)}
            </p>
          )}
          {(pending || failed) && (
            <span
              className={`text-[9px] font-mono italic mt-0.5 inline-block ${
                failed ? "text-rose-400/80" : "text-amber-400/70"
              }`}
            >
              {failed ? "failed" : "working…"}
            </span>
          )}
        </div>
      </div>
    </motion.button>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Glyph (real SemanticArchetype) + fallback overlay badge
// ─────────────────────────────────────────────────────────────────────

/** The type glyph keys on the REAL BAML SemanticArchetype. `fallback` is
 *  an ORTHOGONAL overlay badge (a small amber △) that rides on ANY
 *  archetype — it is NOT a type. */
function ArchetypeGlyph({
  archetype,
  fallback,
}: {
  archetype: AnswerArchetype;
  fallback: boolean;
}) {
  const { Icon, color } = glyphFor(archetype);
  return (
    <span className="relative flex-shrink-0 mt-0.5">
      <Icon className={`w-3.5 h-3.5 ${color}`} />
      {fallback && (
        <AlertTriangle
          className="absolute -bottom-1 -right-1 w-2 h-2 text-amber-400 fill-amber-950"
          strokeWidth={2.5}
        />
      )}
    </span>
  );
}

function glyphFor(t: AnswerArchetype): {
  Icon: typeof FileText;
  color: string;
} {
  switch (t) {
    case "KNOWLEDGE_DOCUMENT":
      return { Icon: FileText, color: "text-neon-blue/80" };
    case "CHART_WIDGET":
      return { Icon: BarChart3, color: "text-neon-purple/80" };
    case "ASSET_STATE_METRIC":
      return { Icon: Gauge, color: "text-neon-green/80" };
    case "PROCESS_TOPOLOGY":
      return { Icon: Network, color: "text-neon-cyan/80" };
    case "HAZARD_DECLARATION":
      return { Icon: AlertTriangle, color: "text-amber-400/90" };
    case "DIGITAL_TWIN_3D":
      return { Icon: Box, color: "text-neon-pink/80" };
    default:
      return { Icon: HelpCircle, color: "text-slate-500" };
  }
}

// ─────────────────────────────────────────────────────────────────────
// Misc
// ─────────────────────────────────────────────────────────────────────

function SortChip({
  mode,
  active,
  onPick,
  icon,
}: {
  mode: AnswerSortMode;
  active: AnswerSortMode;
  onPick: (m: AnswerSortMode) => void;
  icon: React.ReactNode;
}) {
  const on = active === mode;
  return (
    <button
      onClick={() => onPick(mode)}
      className={`flex items-center gap-1 px-2 py-1 rounded font-mono text-[9px] uppercase tracking-wider transition-colors ${
        on
          ? "bg-neon-cyan/15 text-neon-cyan/90 border border-neon-cyan/30"
          : "text-slate-500 border border-transparent hover:text-slate-300"
      }`}
    >
      {icon}
      {mode}
    </button>
  );
}

/** Case-insensitive highlight of the search term. Returns the string
 *  unchanged (as a fragment) when there's no query. */
function highlight(text: string, query: string): React.ReactNode {
  if (!query) return text;
  const i = text.toLowerCase().indexOf(query);
  if (i < 0) return text;
  return (
    <>
      {text.slice(0, i)}
      <mark className="bg-neon-cyan/20 text-neon-cyan/95 rounded-sm px-0.5">
        {text.slice(i, i + query.length)}
      </mark>
      {text.slice(i + query.length)}
    </>
  );
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center h-full text-center px-4">
      <div className="w-12 h-12 rounded-full border border-neon-blue/30 flex items-center justify-center mb-3 animate-breathe">
        <div className="w-6 h-6 rounded-full bg-neon-blue/10 animate-pulse-neon" />
      </div>
      <p className="text-slate-500 font-mono text-xs mb-1">No answers yet</p>
      <p className="text-slate-600 text-[10px] max-w-md leading-relaxed">
        Each question you ask lands here as an answer — led by what it
        found, click to open its decision map, drag it onto the canvas.
        The list survives refresh.
      </p>
    </div>
  );
}
