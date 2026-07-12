import type { Artifact } from "@/api/types";
import {
  answerArchetype,
  archetypeLabel,
  answerTopic,
  type AnswerArchetype,
} from "./answerDisplay";
import { STAGE_CARD } from "@/lib/stageConstants";
import { connectedComponents, type StageEdge } from "@/lib/stageEdges";

/**
 * stageLayout — the camera-stage LAYOUT ENGINE (ADR-0028 canvas-dock, Stage 2).
 *
 * The global canvas is auto-arranged by the active list mode, and — the load-
 * bearing principle — LIST ORDER AND MAP ARRANGEMENT ALWAYS AGREE: this reuses
 * the SAME grouping helpers the sidebar list uses (answerArchetype / answerTopic
 * / created_at recency), so switching the list tab re-lays-out the map with the
 * same buckets in the same order. Cards keep stable identity in the stage, so a
 * mode switch just changes each card's (x,y) and the CSS left/top transition
 * animates the morph. GRAPH mode is deferred to the post-canvas edge arc.
 *
 * World coords are top-left of a card; the camera fits/zooms this world.
 */
export type StageMode = "TIME" | "TOPIC" | "TYPE" | "GRAPH";

const W = STAGE_CARD.w;
const H = STAGE_CARD.h;
const PAD = 90;
const COL_GAP = 64; // between columns / band items
const ROW_GAP = 52; // between stacked cards
const LABEL_H = 60; // headroom for a group label above its cards
const INNER_GAP = 44; // within a topic block
const BLOCK_GAP = 110; // between topic blocks

interface Pos {
  x: number;
  y: number;
}
export interface StageLabel {
  id: string;
  text: string;
  x: number;
  y: number;
}
/** A group (a day / archetype-band / topic-block) and its world bounding box —
 *  clicking its label zooms the camera to fit this box. `id` matches the
 *  corresponding StageLabel.id. */
export interface StageGroup {
  id: string;
  bbox: { x: number; y: number; w: number; h: number };
}
export interface StageLayoutResult {
  positions: Record<string, Pos>;
  labels: StageLabel[];
  groups: StageGroup[];
  world: { w: number; h: number };
}

const byRecency = (items: Artifact[]) =>
  [...items].sort((a, b) => (b.created_at ?? 0) - (a.created_at ?? 0));

// Group preserving first-appearance order (which, over a recency-sorted input,
// yields newest-bucket-first — matching the list).
function groupBy(items: Artifact[], keyFn: (a: Artifact) => string) {
  const m = new Map<string, Artifact[]>();
  for (const a of items) {
    const k = keyFn(a);
    if (!m.has(k)) m.set(k, []);
    m.get(k)!.push(a);
  }
  return m;
}

const MONTHS = ["JAN","FEB","MAR","APR","MAY","JUN","JUL","AUG","SEP","OCT","NOV","DEC"];
const dayKey = (ms: number) => {
  const d = new Date(ms);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
};
const dayLabel = (ms: number) => {
  const d = new Date(ms);
  return `${MONTHS[d.getMonth()]} ${String(d.getDate()).padStart(2, "0")}`;
};

/** TIME — one column per day, newest day leftmost; newest card at the top. */
function layoutTime(items: Artifact[]): StageLayoutResult {
  const grouped = groupBy(byRecency(items), (a) => dayKey(a.created_at ?? 0));
  const positions: Record<string, Pos> = {};
  const labels: StageLabel[] = [];
  const groups: StageGroup[] = [];
  let maxRows = 0;
  let col = 0;
  for (const [key, arr] of grouped) {
    const x = PAD + col * (W + COL_GAP);
    const id = `time-${key}`;
    labels.push({ id, text: dayLabel(arr[0].created_at ?? 0), x, y: PAD });
    arr.forEach((a, i) => {
      positions[a.id] = { x, y: PAD + LABEL_H + i * (H + ROW_GAP) };
    });
    groups.push({
      id,
      bbox: { x, y: PAD, w: W, h: LABEL_H + arr.length * (H + ROW_GAP) - ROW_GAP },
    });
    maxRows = Math.max(maxRows, arr.length);
    col++;
  }
  const nCols = Math.max(1, col);
  return {
    positions,
    labels,
    groups,
    world: {
      w: PAD * 2 + nCols * W + (nCols - 1) * COL_GAP,
      h: PAD * 2 + LABEL_H + Math.max(1, maxRows) * (H + ROW_GAP) - ROW_GAP,
    },
  };
}

/** TYPE — one horizontal band per archetype; newest card leftmost. */
function layoutType(items: Artifact[]): StageLayoutResult {
  const grouped = groupBy(byRecency(items), (a) => answerArchetype(a));
  const positions: Record<string, Pos> = {};
  const labels: StageLabel[] = [];
  const groups: StageGroup[] = [];
  let maxLen = 0;
  let band = 0;
  for (const [key, arr] of grouped) {
    const bandY = PAD + band * (H + LABEL_H + ROW_GAP) + LABEL_H;
    const id = `type-${key}`;
    labels.push({
      id,
      text: archetypeLabel(key as AnswerArchetype),
      x: PAD,
      y: bandY - LABEL_H,
    });
    arr.forEach((a, i) => {
      positions[a.id] = { x: PAD + i * (W + COL_GAP), y: bandY };
    });
    groups.push({
      id,
      bbox: {
        x: PAD,
        y: bandY - LABEL_H,
        w: arr.length * (W + COL_GAP) - COL_GAP,
        h: LABEL_H + H,
      },
    });
    maxLen = Math.max(maxLen, arr.length);
    band++;
  }
  const nBands = Math.max(1, band);
  return {
    positions,
    labels,
    groups,
    world: {
      w: PAD * 2 + Math.max(1, maxLen) * (W + COL_GAP) - COL_GAP,
      h: PAD * 2 + nBands * (H + LABEL_H + ROW_GAP) - ROW_GAP,
    },
  };
}

/** TOPIC — a titled block per topic (2-wide grid), blocks tiled with wrap. */
function layoutTopic(items: Artifact[]): StageLayoutResult {
  const grouped = groupBy(byRecency(items), (a) => answerTopic(a));
  const BLOCK_COLS = 2;
  const MAX_META_W = PAD + 4 * (2 * W + INNER_GAP); // wrap after ~4 blocks wide
  const positions: Record<string, Pos> = {};
  const labels: StageLabel[] = [];
  const groups: StageGroup[] = [];
  let metaX = PAD;
  let metaY = PAD;
  let rowMaxH = 0;
  let worldW = 0;
  for (const [key, arr] of grouped) {
    const cols = Math.min(BLOCK_COLS, arr.length);
    const rows = Math.max(1, Math.ceil(arr.length / BLOCK_COLS));
    const blockW = cols * W + (cols - 1) * INNER_GAP;
    const blockH = LABEL_H + rows * H + (rows - 1) * INNER_GAP;
    if (metaX !== PAD && metaX + blockW > MAX_META_W) {
      metaX = PAD;
      metaY += rowMaxH + BLOCK_GAP;
      rowMaxH = 0;
    }
    const id = `topic-${key}`;
    labels.push({ id, text: key, x: metaX, y: metaY });
    arr.forEach((a, i) => {
      positions[a.id] = {
        x: metaX + (i % BLOCK_COLS) * (W + INNER_GAP),
        y: metaY + LABEL_H + Math.floor(i / BLOCK_COLS) * (H + INNER_GAP),
      };
    });
    groups.push({ id, bbox: { x: metaX, y: metaY, w: blockW, h: blockH } });
    worldW = Math.max(worldW, metaX + blockW);
    metaX += blockW + BLOCK_GAP;
    rowMaxH = Math.max(rowMaxH, blockH);
  }
  return {
    positions,
    labels,
    groups,
    world: { w: worldW + PAD, h: metaY + rowMaxH + PAD },
  };
}

/** Lay out one connected component (a same-subject cluster): a single card, or
 *  a ring of cards. Returns local (0-origin) positions + the cluster bbox. */
function layoutComponent(ids: string[]): { local: Record<string, Pos>; w: number; h: number } {
  const local: Record<string, Pos> = {};
  const n = ids.length;
  if (n === 1) {
    local[ids[0]] = { x: 0, y: 0 };
    return { local, w: W, h: H };
  }
  const R = Math.max(W, H) * 0.62 + n * 12; // ring radius grows with membership
  const cx = R + W / 2;
  const cy = R + H / 2;
  ids.forEach((id, i) => {
    const ang = (2 * Math.PI * i) / n - Math.PI / 2;
    local[id] = { x: cx + R * Math.cos(ang) - W / 2, y: cy + R * Math.sin(ang) - H / 2 };
  });
  return { local, w: 2 * R + W, h: 2 * R + H };
}

const instanceLabelOf = (a: Artifact): string => {
  const about = a.routing?.about;
  return about?.instance_label || about?.label || "linked";
};

/** GRAPH — cluster answers by connected component over the edges; multi-member
 *  clusters (same subject) render as rings, tiled with singletons. Edges are
 *  drawn by the canvas over these positions. */
function layoutGraph(items: Artifact[], edges: StageEdge[]): StageLayoutResult {
  const byId = new Map(items.map((a) => [a.id, a]));
  const comps = connectedComponents(
    items.map((a) => a.id),
    edges,
  ).sort((a, b) => b.length - a.length); // biggest clusters first
  const positions: Record<string, Pos> = {};
  const labels: StageLabel[] = [];
  const groups: StageGroup[] = [];
  const META_MAX_W = PAD + Math.max(2, Math.ceil(Math.sqrt(comps.length))) * (3 * W);
  let mx = PAD;
  let my = PAD;
  let rowMaxH = 0;
  let worldW = 0;
  comps.forEach((comp, ci) => {
    const { local, w, h } = layoutComponent(comp);
    if (mx !== PAD && mx + w > META_MAX_W) {
      mx = PAD;
      my += rowMaxH + BLOCK_GAP;
      rowMaxH = 0;
    }
    for (const id of comp) positions[id] = { x: mx + local[id].x, y: my + local[id].y };
    if (comp.length > 1) {
      const id = `graph-${ci}`;
      labels.push({ id, text: instanceLabelOf(byId.get(comp[0])!), x: mx, y: my });
      groups.push({ id, bbox: { x: mx, y: my, w, h } });
    }
    worldW = Math.max(worldW, mx + w);
    mx += w + BLOCK_GAP;
    rowMaxH = Math.max(rowMaxH, h);
  });
  return { positions, labels, groups, world: { w: worldW + PAD, h: my + rowMaxH + PAD } };
}

export function computeStageLayout(
  items: Artifact[],
  mode: StageMode,
  edges: StageEdge[] = [],
): StageLayoutResult {
  if (items.length === 0)
    return { positions: {}, labels: [], groups: [], world: { w: 1200, h: 800 } };
  if (mode === "TIME") return layoutTime(items);
  if (mode === "TYPE") return layoutType(items);
  if (mode === "GRAPH") return layoutGraph(items, edges);
  return layoutTopic(items);
}
