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

const GUTTER = 40;
const PAD = 90;

/**
 * A planning PANEL is bigger than the default card, deliberately.
 *
 * `STAGE_CARD` (360x280) is sized for the global overview, where a card is a preview of an
 * answer and the point is to see many at once. A workspace panel is the opposite: one answer,
 * read at working size, with its chart filling the space rather than shrunk into it. Deriving
 * these from `STAGE_CARD` would tie the two purposes together and make the preview size a
 * constraint on the workspace, which is how the mini-card problem started.
 *
 * The anchor is tall because a gantt with a dozen rows needs the room; a 300px anchor was the
 * template asking a timeline to fit in a chart's height.
 */
const PANEL_W = 520;
const PANEL_H = 380;
const ANCHOR_H = 460;
/** Two panels plus the gutter between them — the "full width" of this layout. */
const WIDE = PANEL_W * 2 + GUTTER;

/**
 * The default arrangement a `portfolio_planning` canvas opens with: a full-width anchor
 * above two pairs.
 *
 * Deliberately expressed in world coords + `w`/`h` — the same vocabulary `addItemAt` and
 * `moveItem` speak — and NOT as a grid abstraction sitting beside them. A canvas seeded from
 * this template and one a user dragged into the same shape are then byte-identical to every
 * consumer, which is the property that makes "seeded" a starting point rather than a
 * different kind of object. The moment a template needs its own coordinate system, seeded
 * canvases stop being ordinary canvases.
 *
 * A STARTING point, never a constraint: arrangement is UI-owned (ADR-0042 §4), so the first
 * drag overwrites any of this and the canvas persists whatever the user made of it.
 */
const ROW_2_Y = PAD + ANCHOR_H + GUTTER;
const ROW_3_Y = ROW_2_Y + PANEL_H + GUTTER;
const COL_2_X = PAD + PANEL_W + GUTTER;

export const PORTFOLIO_PLANNING_TEMPLATE: CardSlot[] = [
  // Anchor: the schedule/timeline, full width across the top.
  { x: PAD, y: PAD, w: WIDE, h: ANCHOR_H },
  // The pair beneath it — cost curve beside site load.
  { x: PAD, y: ROW_2_Y, w: PANEL_W, h: PANEL_H },
  { x: COL_2_X, y: ROW_2_Y, w: PANEL_W, h: PANEL_H },
  // The lower pair — funding gap beside the diff.
  { x: PAD, y: ROW_3_Y, w: PANEL_W, h: PANEL_H },
  { x: COL_2_X, y: ROW_3_Y, w: PANEL_W, h: PANEL_H },
];

/**
 * Keyed by the canvas's `use`, as a plain string so this module stays dependency-free and
 * `useStageStore` can import it without a cycle.
 *
 * One row today. It is the first row of what becomes a registry when a second type needs
 * one — the arrives-with-its-first-consumer rule — and it governs only ARRANGEMENT. A type
 * never restricts what a canvas may hold: the moment it does, canvases stop being one
 * substrate and become separate apps.
 */
const TEMPLATES: Record<string, CardSlot[]> = {
  portfolio_planning: PORTFOLIO_PLANNING_TEMPLATE,
};

/**
 * The slot a type's template assigns to the nth card, or null when the type has no template
 * or has run past its end. Null means "fall back to the generic placement" — a template
 * declares where its FIRST cards go, and a canvas that outgrows it keeps working.
 */
export function templateSlot(use: string | undefined, n: number): CardSlot | null {
  const t = use ? TEMPLATES[use] : undefined;
  return t && n >= 0 && n < t.length ? t[n] : null;
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
