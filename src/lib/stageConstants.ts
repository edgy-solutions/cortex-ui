/** Shared camera-stage constants (kept dependency-free so stores, layout, and
 *  components can all import it without cycles). */

/** World-space card geometry — one card in the camera stage. Big enough to hold
 *  the real rendered answer; read zoomed-in, previewed zoomed-out. */
export const STAGE_CARD = { w: 360, h: 280 };

/** A card's world-space footprint. */
export interface CardSize {
  w: number;
  h: number;
}

/** A placed card: world coords + footprint, the exact vocabulary `addItemAt` speaks. */
export interface CardSlot extends CardSize {
  x: number;
  y: number;
}

/**
 * THE TEMPLATE IS PROPORTIONAL, NOT ABSOLUTE — and that is the whole fix.
 *
 * The first version laid five cards out at fixed world coordinates: a 1080-wide board
 * 1480 tall. The camera fits a canvas to its content (`min(vw/world.w, vh/world.h) * 0.9`),
 * so a PORTRAIT board inside a LANDSCAPE pane scales to the height and leaves the width
 * unused. That is the empty space either side of a seeded canvas: not a placement bug, an
 * ASPECT bug, and no amount of nudging the coordinates fixes it because the mismatch is
 * between the board's shape and the window's.
 *
 * So the slots are computed from the viewport's proportions. World units still exist — the
 * canvas is one coordinate space and a seeded card must stay byte-identical to a dragged one
 * — but their absolute size cancels out: when the board's aspect matches the pane's, the fit
 * scale is `0.9 * vw / WORLD_W` whatever WORLD_W is, so a full-width card always occupies 90%
 * of the pane. The constant below sets how much world a card spans, never how big it looks.
 *
 * ── WHY FRACTIONS AND NOT A GRID LIBRARY ─────────────────────────────────────────────────
 *
 * Still expressed as `CardSlot` — the exact vocabulary `addItemAt` and `moveItem` speak — so
 * a seeded canvas and a hand-dragged one remain the same object to every consumer. A grid
 * abstraction living beside the coordinates would make seeded canvases a second kind of
 * thing, and the first user drag would drop them back into world coords anyway.
 *
 * A STARTING point, never a constraint: arrangement is UI-owned (ADR-0042 §4), so the first
 * drag overwrites any of this and the canvas persists whatever the user made of it.
 */

/** World-space gap between cards. Absolute size is arbitrary; only its ratio to a card matters. */
const GUTTER = 24;

/**
 * THE HEIGHTS ARE CONTENT-DRIVEN, AND THE FIRST VERSION OF THIS FILE GOT THAT WRONG.
 *
 * That version made the board take the pane's proportions exactly, which does fill the pane
 * and is the wrong objective on its own: on a landscape pane it gives each lower card about a
 * fifth of the board's height, and a planning card's content does not fit in that. A card's
 * body does not scale to its box — `StageCard`'s panel branch renders at natural size and
 * scrolls — so the visible result was a header, a title, and a chart below the fold. Filling
 * the pane by starving the cards is not filling the pane.
 *
 * The numbers below are what a planning card actually needs. They are measured against the
 * components, not chosen: `PeriodSeries` (and its siblings) render `ResponsiveContainer` at a
 * FIXED `height={260}`, and above it sit the card chrome, the interpretation strip and the
 * component's own title — about 440 together. The anchor is a schedule gantt whose rows are
 * roughly 30 apiece, so a dozen rows plus its header and column head is about 620.
 *
 * These are a floor, not a target. When the pane is roomy the board stretches to fill it and
 * every card gets more than its minimum; when the pane is short the board stays taller than
 * the pane and the camera scales it down, which is the trade this file now makes on purpose:
 * a whole card rendered small beats the top third of a card rendered large.
 *
 * THE HONEST WEAKNESS: 260 is a constant in another file, and this constant knows it. If a
 * chart's height changes there, the room reserved here is wrong and nothing fails. Making the
 * card's content flex to its box is the real fix and it is not a demo-week change — it means
 * a bounded-height panel layout and a `ResponsiveContainer` that fills it, which alters how
 * every archetype renders in both the panel and the scaled preview.
 */
const CARD_CONTENT_H = 440;
const ANCHOR_CONTENT_H = 620;

/** Below this a card cannot show anything but its own chrome. */
export const PANEL_MIN = { w: 260, h: 200 };

/**
 * The default arrangement a `portfolio_planning` canvas opens with: a full-width anchor above
 * two rows of two, tiling the pane's WIDTH edge to edge and taking whatever HEIGHT its cards
 * need.
 *
 * The width tracks the pane because a horizontal gap is pure waste — nothing needs it. The
 * height does not, because the cards do need it. That asymmetry is the whole design: the two
 * axes are answering different questions.
 *
 * The reference is the planning-workspace mock — schedule across the top, cost curve beside
 * site load, funding gap beside the maturity grid.
 */
export function portfolioPlanningTemplate(vp: CardSize): CardSlot[] {
  // Refuse a measure that cannot produce a layout rather than emitting NaN coordinates, which
  // would PERSIST into the canvas — arrangement is durable, so a bad measure is a saved layout,
  // not a transient glitch. A 3:2 pane is the fallback.
  const aspect =
    Number.isFinite(vp.w) && Number.isFinite(vp.h) && vp.w > 0 && vp.h > 0
      ? vp.w / vp.h
      : 3 / 2;

  // HEIGHT FIRST, because height is what the cards are short of. Width follows from it and
  // the pane`s shape, which is what makes the board fill horizontally with no gap: the camera
  // fits by the SMALLER of the two ratios, so a board narrower in proportion than its pane is
  // fitted by height and leaves the sides empty. Deriving width from height removes that case
  // rather than tuning around it.
  //
  // Widening a card does NOT starve it the way shortening one does. Card content flows to the
  // width it is given — charts render at width 100% — so a wide card is a wide chart, while a
  // short card is a chart below the fold. The two axes are genuinely not symmetric here.
  const boardH = ANCHOR_CONTENT_H + CARD_CONTENT_H * 2 + GUTTER * 2;
  const boardW = Math.max(PANEL_MIN.w * 2 + GUTTER, boardH * aspect);

  const colW = (boardW - GUTTER) / 2;
  const row2Y = ANCHOR_CONTENT_H + GUTTER;
  const row3Y = row2Y + CARD_CONTENT_H + GUTTER;
  const col2X = colW + GUTTER;

  return [
    // Anchor: the schedule, full width across the top.
    { x: 0, y: 0, w: boardW, h: ANCHOR_CONTENT_H },
    // The pair beneath it — cost curve beside site load.
    { x: 0, y: row2Y, w: colW, h: CARD_CONTENT_H },
    { x: col2X, y: row2Y, w: colW, h: CARD_CONTENT_H },
    // The lower pair — funding gap beside the maturity grid.
    { x: 0, y: row3Y, w: colW, h: CARD_CONTENT_H },
    { x: col2X, y: row3Y, w: colW, h: CARD_CONTENT_H },
  ];
}

/** The number of slots a template declares, without needing a viewport to ask. */
export const PORTFOLIO_PLANNING_SLOTS = 5;

/**
 * Keyed by the canvas's `use`, as a plain string so this module stays dependency-free and
 * `useStageStore` can import it without a cycle.
 *
 * The value is a BUILDER rather than an array, because a template is now a function of the
 * pane it will be read in. One row today — the first row of what becomes a registry when a
 * second type needs one — and it governs only ARRANGEMENT. A type never restricts what a
 * canvas may hold: the moment it does, canvases stop being one substrate and become
 * separate apps.
 */
const TEMPLATES: Record<string, (vp: CardSize) => CardSlot[]> = {
  portfolio_planning: portfolioPlanningTemplate,
};

/**
 * The slot a type's template assigns to the nth card, or null when the type has no template
 * or has run past its end. Null means "fall back to the generic placement" — a template
 * declares where its FIRST cards go, and a canvas that outgrows it keeps working.
 */
export function templateSlot(
  use: string | undefined,
  n: number,
  vp: CardSize,
): CardSlot | null {
  const build = use ? TEMPLATES[use] : undefined;
  if (!build) return null;
  const t = build(vp);
  return n >= 0 && n < t.length ? t[n] : null;
}

/**
 * The size a card actually occupies, defaulting to `STAGE_CARD`.
 *
 * ADR-0042 §4 names SIZE as arrangement — "position, size, pinned/unpinned, title — is
 * owned by the UI and persists through ADR-0028's canvas persistence." Per-item dimensions
 * implement that ruling; they are not a new concept. Content is still state-master, and
 * nothing here travels in a payload.
 *
 * Optional by design: every canvas authored before this shipped has items with no `w`/`h`,
 * and they must keep rendering exactly as they did. An absent dimension means "the default",
 * never "zero" — a card that measured 0 would take a `ResponsiveContainer` down with it.
 *
 * Read this rather than `STAGE_CARD` at any site that measures a PARTICULAR card. Reading
 * the constant directly is only correct where the card is not yet known — a fresh drop, or
 * the uniform global layout, which has no per-item arrangement to honour.
 */
export function cardSize(item?: Partial<CardSize> | null): CardSize {
  // `Number.isFinite` rather than `> 0` alone: Infinity is greater than zero and would sail
  // through, and an unbounded card is as unrenderable as a zero one — it makes the world it
  // sits in unbounded too, so the camera fit divides by it and the stage vanishes. Both ends
  // of the range are refused for the same reason: the default is a recoverable wrong.
  const ok = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v) && v > 0;
  return {
    w: ok(item?.w) ? item.w : STAGE_CARD.w,
    h: ok(item?.h) ? item.h : STAGE_CARD.h,
  };
}
