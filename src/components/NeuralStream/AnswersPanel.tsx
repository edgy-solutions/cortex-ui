import { useMemo, useLayoutEffect, useRef, useState, useEffect, useCallback } from "react";
import { Search, GripVertical, Clock, Hash, Shapes, Share2, X } from "lucide-react";
import { useCanvasStore } from "@/store/useCanvasStore";
import { foldedAskIds } from "@/lib/askFold";
import { useInterviewStore } from "@/store/useInterviewStore";
import { useStageStore } from "@/store/useStageStore";
import { connectedComponents, indexSubjects, subjectChainEdges } from "@/lib/stageEdges";
import { anchorDelta, layoutOffsets, mergedHeight, visibleRange, type AnchorChange } from "@/lib/virtualWindow";
import { taskKindLabel } from "@/lib/taskArtifact";
import { ingestComponentFrom } from "@/lib/ingestArtifact";
import { useIngestStatusStore } from "@/store/useIngestStatusStore";
import { IngestFailureExtras } from "@/components/ingest/IngestFailureExtras";
import { answerElapsed, answerElapsedLabel } from "@/lib/answerElapsed";
import {
  useAnswerPanelStore,
  type AnswerSortMode,
} from "@/store/useAnswerPanelStore";
import { LiveAnswerStrip } from "./LiveAnswerStrip";
import { AccessDeniedCard } from "./AccessDeniedCard";
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
  answerSearchText,
  isUnresolved,
  type AnswerArchetype,
} from "@/lib/answerDisplay";

// Exact mock palette for the spine / nodes / cluster dots.
const TEAL = "#2dd4bf";
const AMBER = "#d9a13c";
// A PENDING task wants something — it glows pink at its chronological spot
// (pending-is-a-state, not a place). A resolved task settles to muted slate.
const TASK_PINK = "#f472b6";
const TASK_MUTED = "#64748b";

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
  const typeFilter = useAnswerPanelStore((s) => s.typeFilter);
  const setTypeFilter = useAnswerPanelStore((s) => s.setTypeFilter);
  const pins = useAnswerPanelStore((s) => s.pins);
  const pinAnswer = useAnswerPanelStore((s) => s.pinAnswer);
  const setCanvasOpen = useAnswerPanelStore((s) => s.setCanvasOpen);
  const { active: liveActive } = useLiveStages();
  // Bug 2 — a current-turn access denial owns the surface; don't ALSO show the
  // empty state beneath it (the denial IS the turn's outcome).
  const hasAccessDenial = useInterviewStore((s) => s.accessDenial !== null);

  const pinnedIds = useMemo(
    () => new Set(pins.map((p) => p.answerId)),
    [pins]
  );

  // Non-pending, newest-first. Pending ANSWERS are represented by the live strip;
  // task-artifacts are always `complete` (their pending/resolved lifecycle rides
  // task_ref.task_state) so they interleave here as timeline citizens.
  //
  // HYBRID order — two truths, both kept:
  //   created_at = the MESH's timeline (when a thing arrived).
  //   watermark  = YOUR timeline (see-your-write: the answer to the question you
  //                just asked appears where you're looking).
  // Chronology across a coarse (per-minute) bucket, but see-your-write WITHIN the
  // bucket: a just-completed answer (fresh watermark) never sinks below a task
  // that arrived in the same minute (watermark 0). Pure created_at would violate
  // see-your-write in exactly the moment it matters; pure watermark would sink
  // every task to the bottom.
  // ONE QUESTION, ONE ITEM. An ask whose answer has arrived is dropped and the answer stands
  // in its place — see `foldedAskIds`. Folded on the SERVER’s `derived_from_artifact_id`,
  // never on the client’s claim: the claim is refused on any turn that did not carry an
  // answer, and folding on it would hide an ask whose answer never happened.
  const folded = useMemo(() => foldedAskIds(artifacts), [artifacts]);
  const sorted = useMemo(() => {
    const BUCKET_MS = 60_000; // 1 minute
    return [...artifacts]
      .filter((a) => a.status !== "pending" && !folded.has(a.id))
      .sort((a, b) => {
        const ba = Math.floor(a.created_at / BUCKET_MS);
        const bb = Math.floor(b.created_at / BUCKET_MS);
        if (bb !== ba) return bb - ba; // newer minute first (chronology)
        if (b.watermark !== a.watermark) return b.watermark - a.watermark; // see-your-write within
        return b.created_at - a.created_at;
      });
  }, [artifacts, folded]);

  const q = search.trim().toLowerCase();
  // Full-content search index (summary + question + the whole rendered payload
  // + sources), computed once per answer set and cached so keystrokes are cheap.
  const searchIndex = useMemo(() => {
    const m = new Map<string, string>();
    for (const a of sorted) m.set(a.id, answerSearchText(a));
    return m;
  }, [sorted]);
  // The TYPE filter narrows in EVERY mode (search included); search narrows within it.
  const filtered = useMemo(() => {
    const ofType = typeFilter ? sorted.filter((a) => answerArchetype(a) === typeFilter) : sorted;
    if (!q) return ofType;
    return ofType.filter((a) => (searchIndex.get(a.id) ?? "").includes(q));
  }, [sorted, q, searchIndex, typeFilter]);

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
      // NO preventDefault here, deliberately.
      //
      // It used to fire on every pointerdown, which killed text selection across the whole
      // answer list — you could not copy a summary or a question off the screen. The problem
      // it was solving is real (dragging a row to a canvas would also paint a selection
      // behind it) but the remedy was scoped to the wrong event: a pointerdown is not yet a
      // drag, it is only a press, and most presses are the start of a selection or a click.
      //
      // A press and a drag are told apart by DISTANCE, not by intent declared up front. So
      // selection is left alone here and suppressed at the moment the pointer crosses the
      // drag threshold — see the move handler, which clears whatever selection had begun.
      // Before that threshold the browser does what a browser does.
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
      // THIS is where a press becomes a drag, so this is where selection stops being what the
      // user meant. Any range the browser started during the first few pixels is cleared once,
      // on the transition — not on every move, which would fight a selection the user is
      // legitimately making elsewhere on the page.
      setDrag((d) => {
        if (!d) return d;
        if (moved && !d.moved) window.getSelection()?.removeAllRanges();
        return { ...d, x: e.clientX, y: e.clientY, moved };
      });
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

  // Built over the WHOLE collection, not the filtered list: a hop's parent may be filtered
  // out of view, and the total time is a fact about the answer rather than about the filter.
  const byIdMap = useMemo(() => {
    const m = new Map<string, Artifact>();
    for (const a of artifacts) m.set(a.id, a);
    return m;
  }, [artifacts]);

  // The scroll container's window, for the virtualised list. A height of 0 (unmeasured) falls
  // back inside visibleRange rather than rendering nothing.
  const scrollRef = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewH, setViewH] = useState(0);
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const measure = () => setViewH(el.clientHeight);
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const scrollView = useMemo(() => ({ top: scrollTop, height: viewH }), [scrollTop, viewH]);

  const rowCtx: RowCtx = {
    currentArtifactId,
    pinnedIds,
    draggingId,
    onPointerDown: onRowPointerDown,
    searchHit: q,
    byId: (id) => byIdMap.get(id),
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
          {/* GRAPH — now that same-subject edges exist, answers cluster by how
              they relate (connected components over the edges). Lineage edges
              layer on later. */}
          <SortChip mode="GRAPH" active={sortMode} onPick={setSortMode} icon={<Share2 className="w-2.5 h-2.5" />} />
        </div>
      )}
      {typeFilter && (
        <div className="px-3 pt-2 flex items-center flex-shrink-0">
          <button
            type="button"
            data-type-filter={typeFilter}
            onClick={() => setTypeFilter(null)}
            title="Clear the type filter"
            className="flex items-center gap-1 px-1.5 py-0.5 rounded border border-neon-cyan/30 bg-neon-cyan/10 text-[9px] font-mono uppercase tracking-widest text-neon-cyan"
          >
            {archetypeLabel(typeFilter)}
            <X className="w-2.5 h-2.5" aria-label="Clear the type filter" />
          </button>
        </div>
      )}
      {q && (
        <div className="px-4 pt-2 flex-shrink-0">
          <span className="text-[9px] font-mono uppercase tracking-widest text-slate-500">
            {filtered.length} matches · relevance
          </span>
        </div>
      )}

      {/* Selection is suppressed only once a drag is ACTUALLY under way (`drag.moved`), not
          from the moment a row is pressed. Gating on `drag` alone made every press disable
          selection, so a click-and-sweep to copy a summary never got started — the list was
          uncopyable and the reason looked like a CSS choice rather than a gesture guard. */}
      <div
        ref={scrollRef}
        onScroll={(e) => setScrollTop(e.currentTarget.scrollTop)}
        data-answers-scroll
        className={`relative flex-1 min-h-0 overflow-y-auto px-2 py-3 ${
          drag?.moved ? "select-none" : ""
        }`}
      >
        <div className="px-1">
          <LiveAnswerStrip />
          {/* Bug 2 — a data-plane access denial for the current turn renders
              here (terminal state, replaces the live strip once the spinner
              stops) with the request-access action. */}
          <AccessDeniedCard />
        </div>

        {total === 0 && !liveActive && !hasAccessDenial && <EmptyState />}
        {total > 0 && filtered.length === 0 && typeFilter && !q && (
          <p className="text-slate-600 font-mono text-[11px] px-2 py-4 text-center" data-type-filter-empty>
            No {archetypeLabel(typeFilter).toLowerCase()} entries.
          </p>
        )}
        {total > 0 && filtered.length === 0 && q && (
          <p className="text-slate-600 font-mono text-[11px] px-2 py-4 text-center">
            No answers match “{search}”.
          </p>
        )}

        {sortMode === "TIME" && !q ? (
          <Timeline items={filtered} ctx={rowCtx} view={scrollView} />
        ) : sortMode === "GRAPH" && !q ? (
          <GraphClusters items={filtered} ctx={rowCtx} view={scrollView} />
        ) : (
          <Clusters items={filtered} mode={q ? "TIME" : sortMode} ctx={rowCtx} view={scrollView} />
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
  /**
   * Lineage lookup, THREADED rather than read from the store per row.
   *
   * A row needs its parents to total the work that produced it, and the obvious way to get
   * them is a store subscription inside the row. That is the per-card watcher on a global
   * store this repo swept for on 2026-08-25 — one subscription per visible row, all firing on
   * every artifact change. The panel already holds the collection; it passes a reader.
   */
  byId: (id: string) => Artifact | undefined;
}

// ─────────────────────────────────────────────────────────────────────
// TIME — spine timeline grouped by day
// ─────────────────────────────────────────────────────────────────────

/** Clicking a list GROUP header zooms the canvas into that group (the same
 *  group-focus the canvas labels trigger). The ids match stageLayout's group
 *  ids (`time-<dayKey>` / `type-<archetype>` / `topic-<topic>`). Jumps to the
 *  global canvas first (a group only exists there). */
function zoomToGroup(id: string) {
  const st = useStageStore.getState();
  st.setView("global");
  st.setGroup(id);
}

/** ESTIMATED heights, one per item kind: used ONLY for an item that has never been mounted.
 *  A mounted item is measured (ResizeObserver) and the measurement replaces the estimate, so a
 *  wrapping title grows its slot and a short one leaves no gap. Estimates are the natural
 *  heights of a one-line-title row, so the scrollbar is close before anything is measured. */
const DAY_H = 28;
const TIME_ROW_H = 44;
const CLUSTER_H = 28;
const CLUSTER_ROW_H = 44;
const OVERSCAN_PX = 400;

type FlatItem =
  | { kind: "day"; key: string; label: string; groupId: string }
  | { kind: "time-row"; key: string; a: Artifact }
  | { kind: "cluster"; key: string; label: string; count: number; color: string; archetype?: AnswerArchetype; groupId: string | null }
  | { kind: "cluster-row"; key: string; a: Artifact };

const estimateOf = (it: FlatItem): number =>
  it.kind === "day" ? DAY_H : it.kind === "time-row" ? TIME_ROW_H : it.kind === "cluster" ? CLUSTER_H : CLUSTER_ROW_H;

/** What the scroll container reports: scrollTop and the visible height. */
interface ScrollView {
  top: number;
  height: number;
}

function renderFlat(it: FlatItem, ctx: RowCtx): React.ReactNode {
  switch (it.kind) {
    case "day":
      return <DayHeader label={it.label} onClick={() => zoomToGroup(it.groupId)} />;
    case "time-row":
      return <TimeRow a={it.a} ctx={ctx} />;
    case "cluster":
      return (
        <ClusterHeader
          label={it.label}
          count={it.count}
          color={it.color}
          archetype={it.archetype}
          onZoom={it.groupId ? () => zoomToGroup(it.groupId!) : undefined}
        />
      );
    case "cluster-row":
      return <ClusterRow a={it.a} ctx={ctx} />;
  }
}

/** One windowed item: positioned absolute, NOT clipped, and measured. */
function MeasuredItem({
  k,
  top,
  ro,
  report,
  children,
}: {
  k: string;
  top: number;
  ro: ResizeObserver | null;
  report: (key: string, h: number) => void;
  children: React.ReactNode;
}) {
  const elRef = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const el = elRef.current;
    if (!el) return;
    report(k, el.offsetHeight);
    if (!ro) return;
    ro.observe(el);
    return () => ro.unobserve(el);
  }, [k, ro, report]);
  return (
    <div ref={elRef} data-virtual-item data-vkey={k} className="absolute left-0 right-0" style={{ top }}>
      {children}
    </div>
  );
}

/** Renders only the window of `flat` that meets the scroll view, plus overscan. Heights are
 *  measured for mounted items and estimated for the rest; when an item wholly above the viewport
 *  changes size, the scroll container is nudged by the delta so the content does not jump. */
function VirtualRows({ flat, ctx, view }: { flat: FlatItem[]; ctx: RowCtx; view: ScrollView }) {
  const rootRef = useRef<HTMLDivElement>(null);
  const measured = useRef(new Map<string, number>());
  const [version, setVersion] = useState(0);
  const { offsets, heights, total, index } = useMemo(() => {
    const heights = flat.map((it) => mergedHeight(it.key, measured.current, estimateOf(it)));
    const index = new Map<string, number>();
    flat.forEach((it, i) => index.set(it.key, i));
    return { heights, index, ...layoutOffsets(heights) };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flat, version]);
  const latest = useRef({ offsets, heights, index });
  latest.current = { offsets, heights, index };
  const pending = useRef<{ changed: boolean; changes: AnchorChange[] }>({ changed: false, changes: [] });
  const scrollEl = () => rootRef.current?.closest<HTMLElement>("[data-answers-scroll]") ?? null;

  const report = useCallback((key: string, h: number) => {
    if (h <= 0) return; // not laid out (hidden / jsdom): keep the estimate
    const m = measured.current;
    const i = latest.current.index.get(key);
    const assumed = m.get(key) ?? (i === undefined ? undefined : latest.current.heights[i]);
    if (assumed === h && m.has(key)) return;
    m.set(key, h);
    if (i !== undefined && assumed !== undefined && assumed !== h) {
      pending.current.changes.push({ top: latest.current.offsets[i]!, oldH: assumed, newH: h });
    }
    if (!pending.current.changed) {
      pending.current.changed = true;
      // one bump per burst of reports (a RO callback, or a commit's layout effects)
      queueMicrotask(() => {
        pending.current.changed = false;
        setVersion((v) => v + 1);
      });
    }
  }, []);

  // Apply the scroll compensation in the same commit that applies the new heights.
  useLayoutEffect(() => {
    const changes = pending.current.changes;
    if (changes.length === 0) return;
    pending.current.changes = [];
    const el = scrollEl();
    if (!el) return;
    const delta = anchorDelta(changes, el.scrollTop - (rootRef.current?.offsetTop ?? 0));
    if (delta !== 0) el.scrollTop += delta;
  }, [version]);

  const [ro, setRo] = useState<ResizeObserver | null>(null);
  useEffect(() => {
    if (typeof ResizeObserver === "undefined") return;
    const o = new ResizeObserver((entries) => {
      for (const e of entries) {
        const k = (e.target as HTMLElement).dataset.vkey;
        if (k) report(k, (e.target as HTMLElement).offsetHeight);
      }
    });
    setRo(o);
    return () => o.disconnect();
  }, [report]);

  // The list sits below the live strip and friends inside the same scroll container, so the
  // scroll position is translated into the list's own coordinates.
  const listTop = rootRef.current?.offsetTop ?? 0;
  const [start, end] = visibleRange(offsets, heights, view.top - listTop, view.height, OVERSCAN_PX);
  return (
    <div ref={rootRef} data-virtual-list className="relative" style={{ height: total }}>
      {flat.slice(start, end).map((it, k) => (
        <MeasuredItem key={it.key} k={it.key} top={offsets[start + k]!} ro={ro} report={report}>
          {renderFlat(it, ctx)}
        </MeasuredItem>
      ))}
    </div>
  );
}

function Timeline({ items, ctx, view }: { items: Artifact[]; ctx: RowCtx; view: ScrollView }) {
  // Pinned per list, not per render: a scroll re-renders this, and a fresh Date.now() every time
  // would rebuild the flat list (O(N)) on every scroll event.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const now = useMemo(() => Date.now(), [items]);
  const flat = useMemo(() => {
    const out: FlatItem[] = [];
    let lastKey: string | null = null;
    for (const a of items) {
      const { key, label } = dayOf(a.created_at, now);
      if (key !== lastKey) {
        // items arrive newest-first, so a day is contiguous
        out.push({ kind: "day", key: "day:" + key, label, groupId: "time-" + key });
        lastKey = key;
      }
      out.push({ kind: "time-row", key: a.id, a });
    }
    return out;
  }, [items, now]);
  return <VirtualRows flat={flat} ctx={ctx} view={view} />;
}

function DayHeader({ label, onClick }: { label: string; onClick?: () => void }) {
  return (
    <div
      onClick={onClick}
      className={`flex items-center gap-2 h-7 ${onClick ? "cursor-pointer group/day" : ""}`}
      title={onClick ? "Zoom the canvas into this day" : undefined}
    >
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
      <span className="text-[9px] font-mono uppercase tracking-widest text-slate-500 group-hover/day:text-neon-cyan transition-colors">
        {label}
      </span>
    </div>
  );
}

/** A drop's stage badge, and the extraction-defect marker when (and only when) the status row
 *  carried the defect OBJECT. Nothing for any other row: the marker is absent for absent and null. */
function IngestBadge({ a }: { a: Artifact }) {
  const ing = ingestComponentFrom(a);
  if (!ing) return null;
  return (
    <span className="inline-flex items-center gap-1 mb-0.5">
      {/* Text, not a chip: bordered = clickable on the rail, and a stage is not an action. */}
      <span
        className={`text-[8px] font-mono font-bold uppercase tracking-widest ${
          ing.badge === "failed" || ing.badge === "refused" ? "text-amber-300" : "text-neon-cyan"
        }`}
        data-ingest-stage={ing.badge}
      >
        {ing.badge}
      </span>
      {ing.notice_id !== null && (
        <span className="text-[9px] font-mono text-slate-400 truncate" data-ingest-notice-id title={ing.notice_id}>
          {ing.notice_id}
        </span>
      )}
      {ing.extraction_defect && (
        <span
          className="text-[9px] font-mono text-amber-300"
          data-ingest-extraction-defect
          title={`extraction corrected: ${ing.extraction_defect.edits} rows`}
        >
          ✎
        </span>
      )}
    </span>
  );
}

/** The reason a drop FAILED, verbatim, under the summary line, with its reason code, attempt and Retry
 *  (`IngestFailureExtras`). Nothing for any other stage. */
function IngestReason({ a }: { a: Artifact }) {
  const ing = ingestComponentFrom(a);
  const retry = useIngestStatusStore((s) => s.retry);
  if (!ing) return null;
  const reason = ing.reason;
  return (
    <>
      {reason !== null && (
        <p
          className="text-[10px] font-mono text-amber-400 leading-snug line-clamp-2 mt-0.5"
          data-ingest-reason
          {...(ing.badge === "refused" ? { "data-ingest-refused": "true" } : {})}
          title={reason}
        >
          {reason}
        </p>
      )}
      {ing.registered !== null && ing.registered.length > 0 && (
        <p className="text-[10px] font-mono text-slate-400 leading-snug mt-0.5" data-ingest-registered>
          registered: {ing.registered.join(", ")}
        </p>
      )}
      <IngestFailureExtras stage={ing.badge} ingestId={ing.ingest_id} reasonCode={ing.reason_code} attempt={ing.attempt} retry={retry} />
    </>
  );
}

function TimeRow({ a, ctx }: { a: Artifact; ctx: RowCtx }) {
  // null when nothing in the chain was measured — the row then shows no duration at all,
  // which is the honest rendering of "not recorded". Summed ACROSS HOPS: an answer that came
  // from an ask is two pieces of work, and reporting only the last leg understated it by the
  // whole routing turn. The label says how many hops it covers when that is not one.
  const took = answerElapsedLabel(answerElapsed(a, ctx.byId));
  const summary = answerSummary(a);
  const captured = hasCapturedSummary(a);
  const archetype = answerArchetype(a);
  const fallback = isUnresolved(a);
  const selected = a.id === ctx.currentArtifactId;
  const dragging = ctx.draggingId === a.id;
  const pinned = ctx.pinnedIds.has(a.id);
  // A task is the same citizen as an answer, differing only in what it awaits.
  // Its state (not its location) tells the truth: pending glows pink + pulses
  // (it wants action), resolved settles to muted (it's history).
  const task = a.task_ref;
  const taskPending = task?.task_state === "pending";
  const node = task
    ? taskPending
      ? TASK_PINK
      : TASK_MUTED
    : fallback
    ? AMBER
    : TEAL;

  return (
    <div
      onPointerDown={(e) => ctx.onPointerDown(e, a.id)}
      className={`flex items-stretch gap-2 rounded-md cursor-grab transition-colors ${
        dragging
          ? "opacity-45"
          : selected
          ? "bg-neon-blue/10"
          : taskPending
          ? "hover:bg-pink-500/[.06]"
          : "hover:bg-white/[.025]"
      }`}
      style={
        dragging
          ? { outline: "1px dashed rgba(125,170,190,.3)" }
          : taskPending
          ? { boxShadow: "inset 2px 0 0 rgba(244,114,182,.55)" }
          : undefined
      }
    >
      {/* Time — and, under it, how long the answer took to produce.
          Stacked rather than inline because this column is fixed-width and the
          two are different KINDS of fact: when it happened, and how long it ran.
          Rendered only when the producer measured it; an artifact with no
          duration shows the clock alone, never a `0s` that would read as fast. */}
      <span className="w-11 flex-shrink-0 text-right text-[10px] font-mono text-slate-500 tabular-nums pt-2">
        {formatTime(a.created_at)}
        {took && (
          <span className="block text-[9px] text-slate-600" title={`Took ${took} to answer`}>
            {took}
          </span>
        )}
      </span>

      {/* Spine rail + node */}
      <div className="relative w-3 self-stretch flex-shrink-0">
        <div
          className="absolute left-1/2 -translate-x-1/2 top-0 bottom-0 w-px"
          style={{ background: "rgba(45,212,191,.18)" }}
        />
        <div
          className={`absolute left-1/2 -translate-x-1/2 top-2.5 w-1.5 h-1.5 rounded-full ${
            taskPending ? "animate-pulse" : ""
          }`}
          style={{ background: node, boxShadow: `0 0 6px ${node}66` }}
        />
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0 py-1.5">
        <IngestBadge a={a} />
        {task && (
          <span
            className={`inline-block mb-0.5 text-[8px] font-mono font-bold uppercase tracking-widest ${
              taskPending ? "text-pink-300" : "text-slate-400"
            }`}
          >
            {taskKindLabel(task.kind)}
            {taskPending ? " · pending" : task ? " · done" : ""}
          </span>
        )}
        <p
          className={`text-[12px] font-mono leading-snug line-clamp-2 ${
            selected ? "text-slate-100" : "text-slate-200"
          } ${!captured ? "italic text-slate-400" : ""}`}
          title={summary}
        >
          {highlight(summary, ctx.searchHit)}
        </p>
        <IngestReason a={a} />
        {captured && a.question_text && (
          <p className="text-[10px] font-mono text-slate-500 leading-snug line-clamp-1 mt-0.5">
            {/* See CanvasPane's header: a label beside a question is copied with it. */}
            <span className="text-slate-600 select-none">Q · </span>
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
  view,
}: {
  items: Artifact[];
  mode: AnswerSortMode;
  ctx: RowCtx;
  view: ScrollView;
}) {
  const flat = useMemo(() => {
    const out: FlatItem[] = [];
    for (const c of buildClusters(items, mode)) {
      // Map the list cluster to the canvas group id (stageLayout keys).
      const groupId =
        mode === "TYPE" ? (c.archetype ? "type-" + c.archetype : null) : "topic-" + c.label;
      out.push({ kind: "cluster", key: "c:" + c.key, label: c.label, count: c.items.length, color: c.color, archetype: c.archetype, groupId });
      for (const a of c.items) out.push({ kind: "cluster-row", key: a.id, a });
    }
    return out;
  }, [items, mode]);
  return <VirtualRows flat={flat} ctx={ctx} view={view} />;
}

// GRAPH — cluster the list by how answers RELATE (connected components over the
// same-subject edges). Multi-answer clusters (same resolved instance) are named
// by that instance; unlinked answers collect under "Unlinked". Lineage edges
// will fold in as a second edge kind later.
function GraphClusters({ items, ctx, view }: { items: Artifact[]; ctx: RowCtx; view: ScrollView }) {
  const flat = useMemo(() => {
    // One O(N) grouping pass and a spanning chain per subject: the components are what the
    // clustering reads, and a chain has the same ones as the pairwise edge list at k-1 edges.
    const edges = subjectChainEdges(indexSubjects(items));
    const comps = connectedComponents(
      items.map((a) => a.id),
      edges,
    );
    const byId = new Map(items.map((a) => [a.id, a]));
    const multi = comps.filter((c) => c.length > 1).sort((a, b) => b.length - a.length);
    const singles = comps.filter((c) => c.length === 1).map((c) => c[0]);
    const out: FlatItem[] = [];
    multi.forEach((comp, i) => {
      const first = byId.get(comp[0])!;
      const lbl =
        first.routing?.about?.instance_label || first.routing?.about?.label || "linked";
      out.push({ kind: "cluster", key: "g-" + i, label: lbl, count: comp.length, color: TEAL, groupId: null });
      for (const id of comp) {
        const a = byId.get(id);
        if (a) out.push({ kind: "cluster-row", key: a.id, a });
      }
    });
    if (singles.length) {
      out.push({ kind: "cluster", key: "g-unlinked", label: "Unlinked", count: singles.length, color: "#4B5563", groupId: null });
      for (const id of singles) {
        const a = byId.get(id);
        if (a) out.push({ kind: "cluster-row", key: a.id, a });
      }
    }
    return out;
  }, [items]);
  return <VirtualRows flat={flat} ctx={ctx} view={view} />;
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
  onZoom,
}: {
  label: string;
  count: number;
  color: string;
  archetype?: AnswerArchetype;
  onZoom?: () => void;
}) {
  return (
    <div
      onClick={onZoom}
      title={onZoom ? "Zoom the canvas into this group" : undefined}
      className={`flex items-center gap-2 pt-3 pb-1 px-1 ${onZoom ? "cursor-pointer group/cl" : ""}`}
    >
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
  // null when nothing in the chain was measured — the row then shows no duration at all,
  // which is the honest rendering of "not recorded". Summed ACROSS HOPS: an answer that came
  // from an ask is two pieces of work, and reporting only the last leg understated it by the
  // whole routing turn. The label says how many hops it covers when that is not one.
  const took = answerElapsedLabel(answerElapsed(a, ctx.byId));
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
        <IngestBadge a={a} />
        <p
          className={`text-[12px] font-mono leading-snug line-clamp-2 ${
            selected ? "text-slate-100" : "text-slate-200"
          } ${!captured ? "italic text-slate-400" : ""}`}
          title={summary}
        >
          {highlight(summary, ctx.searchHit)}
        </p>
        <IngestReason a={a} />
        <p className="text-[10px] font-mono text-slate-500 leading-snug line-clamp-1 mt-0.5">
          {/* THE WORST OF THESE ROWS: the question shares one line with a label, a separator,
              a timestamp and a duration, so a selection over it copies
              "Q · <question> · 14:32 · 2.1s". Everything that is not the question is marked
              unselectable, which leaves the question copyable ALONE from a row that shows four
              things. */}
          {captured && a.question_text && (
            <>
              <span className="text-slate-600 select-none">Q · </span>
              {highlight(a.question_text, ctx.searchHit)}
              <span className="text-slate-700 select-none"> · </span>
            </>
          )}
          <span className="text-slate-600 select-none">{formatTime(a.created_at)}</span>
          {took && <span className="text-slate-600 select-none"> · {took}</span>}
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
