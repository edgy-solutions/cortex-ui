import { useMemo, useRef, useState, useEffect, useCallback } from "react";
import { Search, GripVertical, Clock, Hash, Shapes } from "lucide-react";
import { useCanvasStore } from "@/store/useCanvasStore";
import {
  useAnswerPanelStore,
  type AnswerSortMode,
} from "@/store/useAnswerPanelStore";
import { LiveAnswerStrip } from "./LiveAnswerStrip";
import { useLiveStages } from "./useLiveStages";
import { ArchetypeGlyph, glyphFor } from "./ArchetypeGlyph";
import { AnswerChitGhost } from "./AnswerChitGhost";
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

// Exact mock palette for the spine / nodes / cluster dots.
const TEAL = "#2dd4bf";
const AMBER = "#d9a13c";

/**
 * AnswersPanel — the answer-first left column, styled as the mock's
 * TIMELINE (not always-boxed cards).
 *
 *  - TIME: a vertical spine with day markers (◆ TODAY · JUL 9), a colored
 *    node per answer (teal resolved / amber fallback), the time on the
 *    left, summary-led content, type glyph on the right. Rows are FLAT
 *    (transparent) and only take a card wash ON HOVER.
 *  - TOPIC / TYPE: cluster headers (dot-link + name + count), glyph-left
 *    rows with a `· time` suffix. Fallbacks are their own cluster
 *    ("unresolved" / "Fallbacks") — in TIME they're inline, amber-coded.
 *  - Drag: pointer-based, with a body-portal chit-ghost that floats above
 *    the canvas (fixes the "dragged card under the canvas" clipping).
 *
 * Summary is read VERBATIM (backend-composed, instance·verb when resolved).
 * Glyphs key on the REAL SemanticArchetype. v1: list + drag; no v2/v3.
 */
export function AnswersPanel() {
  const artifacts = useCanvasStore((s) => s.artifacts);
  const currentArtifactId = useCanvasStore((s) => s.currentArtifactId);
  const setCurrentArtifact = useCanvasStore((s) => s.setCurrentArtifact);

  const sortMode = useAnswerPanelStore((s) => s.sortMode);
  const setSortMode = useAnswerPanelStore((s) => s.setSortMode);
  const search = useAnswerPanelStore((s) => s.search);
  const setSearch = useAnswerPanelStore((s) => s.setSearch);
  const pins = useAnswerPanelStore((s) => s.pins);
  const pinAnswer = useAnswerPanelStore((s) => s.pinAnswer);
  const setCanvasOpen = useAnswerPanelStore((s) => s.setCanvasOpen);
  const { active: liveActive } = useLiveStages();

  const pinnedIds = useMemo(
    () => new Set(pins.map((p) => p.answerId)),
    [pins]
  );

  // Non-pending, newest-first. Pending is represented by the live strip.
  const sorted = useMemo(() => {
    return [...artifacts]
      .filter((a) => a.status !== "pending")
      .sort((a, b) => {
        if (b.watermark !== a.watermark) return b.watermark - a.watermark;
        return b.created_at - a.created_at;
      });
  }, [artifacts]);

  const q = search.trim().toLowerCase();
  const filtered = useMemo(() => {
    if (!q) return sorted;
    return sorted.filter(
      (a) =>
        answerSummary(a).toLowerCase().includes(q) ||
        (a.question_text || "").toLowerCase().includes(q)
    );
  }, [sorted, q]);

  // ── Pointer drag → chit ghost → pin ────────────────────────────────
  const [drag, setDrag] = useState<{
    id: string;
    x: number;
    y: number;
    moved: boolean;
  } | null>(null);
  const startRef = useRef<{ x: number; y: number; id: string } | null>(null);

  const onRowPointerDown = useCallback(
    (e: React.PointerEvent, id: string) => {
      if (e.button !== 0) return;
      startRef.current = { x: e.clientX, y: e.clientY, id };
      setDrag({ id, x: e.clientX, y: e.clientY, moved: false });
    },
    []
  );

  useEffect(() => {
    if (!drag) return;
    const onMove = (e: PointerEvent) => {
      const s = startRef.current;
      if (!s) return;
      const moved =
        Math.abs(e.clientX - s.x) > 6 || Math.abs(e.clientY - s.y) > 6;
      setDrag((d) => (d ? { ...d, x: e.clientX, y: e.clientY, moved } : d));
    };
    const onUp = (e: PointerEvent) => {
      const s = startRef.current;
      const d = drag;
      startRef.current = null;
      setDrag(null);
      if (!s || !d) return;
      const moved =
        Math.abs(e.clientX - s.x) > 6 || Math.abs(e.clientY - s.y) > 6;
      if (!moved) {
        setCurrentArtifact(s.id); // a click, not a drag → select
        return;
      }
      if (droppedOnCanvas(e.clientX, e.clientY)) {
        const n = pins.length % 8;
        pinAnswer(s.id, 32 + n * 30, 32 + n * 30);
        setCanvasOpen(true);
      }
    };
    document.addEventListener("pointermove", onMove);
    document.addEventListener("pointerup", onUp);
    return () => {
      document.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerup", onUp);
    };
  }, [drag, pins.length, pinAnswer, setCanvasOpen, setCurrentArtifact]);

  const draggingId = drag?.moved ? drag.id : null;
  const dragArtifact = draggingId
    ? filtered.find((a) => a.id === draggingId)
    : null;

  const total = sorted.length;

  const rowCtx: RowCtx = {
    currentArtifactId,
    pinnedIds,
    draggingId,
    onPointerDown: onRowPointerDown,
    searchHit: q,
  };

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

      {/* Sort chips */}
      {!q && (
        <div className="px-3 pt-2 flex items-center gap-1 flex-shrink-0">
          <SortChip mode="TIME" active={sortMode} onPick={setSortMode} icon={<Clock className="w-2.5 h-2.5" />} />
          <SortChip mode="TOPIC" active={sortMode} onPick={setSortMode} icon={<Hash className="w-2.5 h-2.5" />} />
          <SortChip mode="TYPE" active={sortMode} onPick={setSortMode} icon={<Shapes className="w-2.5 h-2.5" />} />
          {/* GRAPH sort deferred to v1.5 (needs a cross-answer proximity
              field that doesn't exist yet). Hidden rather than shown as a
              dead chip — a dead chip reads as broken. */}
        </div>
      )}
      {q && (
        <div className="px-4 pt-2 flex-shrink-0">
          <span className="text-[9px] font-mono uppercase tracking-widest text-slate-500">
            {filtered.length} matches · relevance
          </span>
        </div>
      )}

      {/* List */}
      <div className="flex-1 min-h-0 overflow-y-auto px-2 py-3">
        <div className="px-1">
          <LiveAnswerStrip />
        </div>

        {total === 0 && !liveActive && <EmptyState />}
        {total > 0 && filtered.length === 0 && q && (
          <p className="text-slate-600 font-mono text-[11px] px-2 py-4 text-center">
            No answers match “{search}”.
          </p>
        )}

        {sortMode === "TIME" && !q ? (
          <Timeline items={filtered} ctx={rowCtx} />
        ) : (
          <Clusters items={filtered} mode={q ? "TIME" : sortMode} ctx={rowCtx} />
        )}
      </div>

      {/* Drag ghost (body portal — floats above the canvas) */}
      {drag?.moved && dragArtifact && (
        <AnswerChitGhost
          x={drag.x}
          y={drag.y}
          summary={answerSummary(dragArtifact)}
          question={dragArtifact.question_text || ""}
          archetype={answerArchetype(dragArtifact)}
          fallback={isUnresolved(dragArtifact)}
        />
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Shared row context
// ─────────────────────────────────────────────────────────────────────

interface RowCtx {
  currentArtifactId: string | null;
  pinnedIds: Set<string>;
  draggingId: string | null;
  onPointerDown: (e: React.PointerEvent, id: string) => void;
  searchHit: string;
}

// ─────────────────────────────────────────────────────────────────────
// TIME — spine timeline grouped by day
// ─────────────────────────────────────────────────────────────────────

function Timeline({ items, ctx }: { items: Artifact[]; ctx: RowCtx }) {
  const now = Date.now();
  const days = useMemo(() => {
    const groups: { key: string; label: string; items: Artifact[] }[] = [];
    const byKey = new Map<string, Artifact[]>();
    for (const a of items) {
      const { key } = dayOf(a.created_at, now);
      if (!byKey.has(key)) {
        byKey.set(key, []);
        groups.push({ key, label: dayOf(a.created_at, now).label, items: byKey.get(key)! });
      }
      byKey.get(key)!.push(a);
    }
    return groups;
  }, [items, now]);

  return (
    <div className="relative">
      {days.map((g) => (
        <div key={g.key}>
          <DayHeader label={g.label} />
          {g.items.map((a) => (
            <TimeRow key={a.id} a={a} ctx={ctx} />
          ))}
        </div>
      ))}
    </div>
  );
}

function DayHeader({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-2 h-7">
      <div className="w-11 flex-shrink-0" />
      <div className="relative w-3 self-stretch flex-shrink-0">
        <div
          className="absolute left-1/2 -translate-x-1/2 top-0 bottom-0 w-px"
          style={{ background: "rgba(45,212,191,.18)" }}
        />
        <div
          className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-1.5 h-1.5"
          style={{ background: TEAL, transform: "translate(-50%,-50%) rotate(45deg)" }}
        />
      </div>
      <span className="text-[9px] font-mono uppercase tracking-widest text-slate-500">
        {label}
      </span>
    </div>
  );
}

function TimeRow({ a, ctx }: { a: Artifact; ctx: RowCtx }) {
  const summary = answerSummary(a);
  const captured = hasCapturedSummary(a);
  const archetype = answerArchetype(a);
  const fallback = isUnresolved(a);
  const selected = a.id === ctx.currentArtifactId;
  const dragging = ctx.draggingId === a.id;
  const pinned = ctx.pinnedIds.has(a.id);
  const node = fallback ? AMBER : TEAL;

  return (
    <div
      onPointerDown={(e) => ctx.onPointerDown(e, a.id)}
      className={`flex items-stretch gap-2 rounded-md cursor-grab transition-colors ${
        dragging
          ? "opacity-45"
          : selected
          ? "bg-neon-blue/10"
          : "hover:bg-white/[.025]"
      }`}
      style={
        dragging
          ? { outline: "1px dashed rgba(125,170,190,.3)" }
          : undefined
      }
    >
      {/* Time */}
      <span className="w-11 flex-shrink-0 text-right text-[10px] font-mono text-slate-500 tabular-nums pt-2">
        {formatTime(a.created_at)}
      </span>

      {/* Spine rail + node */}
      <div className="relative w-3 self-stretch flex-shrink-0">
        <div
          className="absolute left-1/2 -translate-x-1/2 top-0 bottom-0 w-px"
          style={{ background: "rgba(45,212,191,.18)" }}
        />
        <div
          className="absolute left-1/2 -translate-x-1/2 top-2.5 w-1.5 h-1.5 rounded-full"
          style={{ background: node, boxShadow: `0 0 6px ${node}66` }}
        />
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0 py-1.5">
        <p
          className={`text-[12px] font-mono leading-snug line-clamp-2 ${
            selected ? "text-slate-100" : "text-slate-200"
          } ${!captured ? "italic text-slate-400" : ""}`}
          title={summary}
        >
          {highlight(summary, ctx.searchHit)}
        </p>
        {captured && a.question_text && (
          <p className="text-[10px] font-mono text-slate-500 leading-snug line-clamp-1 mt-0.5">
            <span className="text-slate-600">Q · </span>
            {highlight(a.question_text, ctx.searchHit)}
          </p>
        )}
      </div>

      {/* Glyph + grip */}
      <div className="flex items-center gap-1.5 pr-1.5 pt-2 flex-shrink-0">
        <ArchetypeGlyph archetype={archetype} fallback={fallback} />
        {pinned && (
          <span
            className="w-1.5 h-1.5 rounded-full"
            style={{ background: TEAL }}
            title="On canvas"
          />
        )}
        <GripVertical className="w-3 h-3 text-slate-700 group-hover:text-slate-500" />
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// TOPIC / TYPE — clustered
// ─────────────────────────────────────────────────────────────────────

function Clusters({
  items,
  mode,
  ctx,
}: {
  items: Artifact[];
  mode: AnswerSortMode;
  ctx: RowCtx;
}) {
  const clusters = useMemo(() => buildClusters(items, mode), [items, mode]);
  return (
    <div className="space-y-1">
      {clusters.map((c) => (
        <div key={c.key}>
          <ClusterHeader
            label={c.label}
            count={c.items.length}
            color={c.color}
            archetype={c.archetype}
          />
          {c.items.map((a) => (
            <ClusterRow key={a.id} a={a} ctx={ctx} />
          ))}
        </div>
      ))}
    </div>
  );
}

interface Cluster {
  key: string;
  label: string;
  color: string;
  archetype?: AnswerArchetype;
  items: Artifact[];
}

function buildClusters(items: Artifact[], mode: AnswerSortMode): Cluster[] {
  const by = new Map<string, Cluster>();
  const order: string[] = [];
  for (const a of items) {
    let key: string, label: string, color: string, archetype: AnswerArchetype | undefined;
    if (mode === "TYPE") {
      if (isUnresolved(a)) {
        key = "__fallback"; label = "Fallbacks"; color = AMBER; archetype = undefined;
      } else {
        const t = answerArchetype(a);
        key = `type:${t}`; label = archetypeLabel(t); color = glyphColor(t); archetype = t;
      }
    } else {
      // TOPIC
      const t = answerTopic(a);
      key = `topic:${t}`;
      label = t;
      color = t === "unresolved" ? AMBER : TEAL;
      archetype = undefined;
    }
    if (!by.has(key)) {
      by.set(key, { key, label, color, archetype, items: [] });
      order.push(key);
    }
    by.get(key)!.items.push(a);
  }
  // Unresolved/fallbacks sink to the bottom; otherwise by size.
  return order
    .map((k) => by.get(k)!)
    .sort((a, b) => {
      const af = a.key.includes("fallback") || a.label === "unresolved" ? 1 : 0;
      const bf = b.key.includes("fallback") || b.label === "unresolved" ? 1 : 0;
      if (af !== bf) return af - bf;
      return b.items.length - a.items.length;
    });
}

function ClusterHeader({
  label,
  count,
  color,
  archetype,
}: {
  label: string;
  count: number;
  color: string;
  archetype?: AnswerArchetype;
}) {
  return (
    <div className="flex items-center gap-2 pt-3 pb-1 px-1">
      {/* dot-link ●—● */}
      <span className="flex items-center flex-shrink-0" aria-hidden>
        <span className="w-1.5 h-1.5 rounded-full" style={{ background: color }} />
        <span className="w-2 h-px" style={{ background: color, opacity: 0.5 }} />
        <span className="w-1.5 h-1.5 rounded-full" style={{ background: color, opacity: 0.6 }} />
      </span>
      {archetype && <ArchetypeGlyph archetype={archetype} fallback={false} />}
      <span
        className="text-[10px] font-mono uppercase tracking-wider"
        style={{ color }}
      >
        {label}
      </span>
      <span className="text-[10px] font-mono text-slate-600">{count}</span>
      <div className="flex-1 h-px bg-slate-800/40" />
    </div>
  );
}

function ClusterRow({ a, ctx }: { a: Artifact; ctx: RowCtx }) {
  const summary = answerSummary(a);
  const captured = hasCapturedSummary(a);
  const archetype = answerArchetype(a);
  const fallback = isUnresolved(a);
  const selected = a.id === ctx.currentArtifactId;
  const dragging = ctx.draggingId === a.id;
  const pinned = ctx.pinnedIds.has(a.id);

  return (
    <div
      onPointerDown={(e) => ctx.onPointerDown(e, a.id)}
      className={`flex items-start gap-2.5 rounded-md px-1.5 py-1.5 cursor-grab transition-colors ${
        dragging
          ? "opacity-45"
          : selected
          ? "bg-neon-blue/10"
          : "hover:bg-white/[.025]"
      }`}
      style={dragging ? { outline: "1px dashed rgba(125,170,190,.3)" } : undefined}
    >
      <span className="pt-0.5">
        <ArchetypeGlyph archetype={archetype} fallback={fallback} />
      </span>
      <div className="flex-1 min-w-0">
        <p
          className={`text-[12px] font-mono leading-snug line-clamp-2 ${
            selected ? "text-slate-100" : "text-slate-200"
          } ${!captured ? "italic text-slate-400" : ""}`}
          title={summary}
        >
          {highlight(summary, ctx.searchHit)}
        </p>
        <p className="text-[10px] font-mono text-slate-500 leading-snug line-clamp-1 mt-0.5">
          {captured && a.question_text && (
            <>
              <span className="text-slate-600">Q · </span>
              {highlight(a.question_text, ctx.searchHit)}
              <span className="text-slate-700"> · </span>
            </>
          )}
          <span className="text-slate-600">{formatTime(a.created_at)}</span>
        </p>
      </div>
      {pinned && (
        <span
          className="w-1.5 h-1.5 rounded-full mt-1.5 flex-shrink-0"
          style={{ background: TEAL }}
          title="On canvas"
        />
      )}
      <GripVertical className="w-3 h-3 text-slate-700 mt-0.5 flex-shrink-0" />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────

/** Hit-test the drop point against the canvas dropzone element's bounds. */
function droppedOnCanvas(x: number, y: number): boolean {
  const dz = document.querySelector("[data-canvas-dropzone]");
  if (!dz) return false;
  const r = dz.getBoundingClientRect();
  return x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;
}

const MONTHS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
const WEEKDAYS = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];

/** Day grouping key + header label (TODAY · JUL 9 / YESTERDAY · JUL 8 /
 *  TUE · JUL 7). */
function dayOf(ms: number, now: number): { key: string; label: string } {
  const d = new Date(ms);
  const dayKey = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
  const dateLabel = `${MONTHS[d.getMonth()]} ${d.getDate()}`;
  const nd = new Date(now);
  const startOfToday = new Date(nd.getFullYear(), nd.getMonth(), nd.getDate()).getTime();
  const dayMs = 86400000;
  const startOfThis = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const diffDays = Math.round((startOfToday - startOfThis) / dayMs);
  let prefix: string;
  if (diffDays === 0) prefix = "TODAY";
  else if (diffDays === 1) prefix = "YESTERDAY";
  else prefix = WEEKDAYS[d.getDay()];
  return { key: dayKey, label: `${prefix} · ${dateLabel}` };
}

function formatTime(ms: number): string {
  const d = new Date(ms);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function glyphColor(t: AnswerArchetype): string {
  // Map the glyph tailwind class → a concrete hex for cluster headers.
  const cls = glyphFor(t).color;
  if (cls.includes("blue")) return "#38bdf8";
  if (cls.includes("purple")) return "#a78bfa";
  if (cls.includes("green")) return "#22c55e";
  if (cls.includes("cyan")) return "#06b6d4";
  if (cls.includes("pink")) return "#ec4899";
  if (cls.includes("amber")) return AMBER;
  return "#64748b";
}

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
    <div className="flex flex-col items-center justify-center h-full text-center px-4 py-10">
      <div className="w-12 h-12 rounded-full border border-neon-blue/30 flex items-center justify-center mb-3 animate-breathe">
        <div className="w-6 h-6 rounded-full bg-neon-blue/10 animate-pulse-neon" />
      </div>
      <p className="text-slate-500 font-mono text-xs mb-1">No answers yet</p>
      <p className="text-slate-600 text-[10px] max-w-md leading-relaxed">
        Each question you ask lands here as an answer — led by what it
        found. Click to open its decision map, drag it onto the canvas.
      </p>
    </div>
  );
}
