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

/** How much world one board spans. Arbitrary and load-bearing only in ratio — see above. */
const WORLD_W = 1440;

/** Gutter and outer margin as fractions of world width, so they scale with the board. */
const GUTTER_F = 0.025;
const MARGIN_F = 0.02;

/**
 * The anchor's share of the board's height.
 *
 * Tuned for the card that actually sits there: a schedule gantt. Twelve rows plus their group
 * headers need roughly half the board, and the failure when it is too small is not cosmetic —
 * the card body scrolls, so a reader sees a row cut in half and a scrollbar where the mock
 * shows a whole timeline.
 *
 * NOT yet derived from the content. An INTERVAL_TIMELINE's natural height IS knowable from
 * its row count, and this fraction should eventually come from that rather than from a
 * constant tuned against one screenshot. Left as a constant deliberately instead of
 * half-built: the hint would have to reach the store from the artifact collection, and
 * inventing that seam to carry a number nothing yet computes is the shape this codebase
 * keeps filing findings about.
 */
const ANCHOR_F = 0.5;

/** A card's world-space footprint, as the size the default card takes when nothing else says. */
export const PANEL_MIN = { w: 260, h: 180 };

/**
 * The default arrangement a `portfolio_planning` canvas opens with, sized to the pane it will
 * be read in: a full-width anchor above two rows of two, tiling the board edge to edge.
 *
 * The reference is the planning-workspace mock — schedule across the top, the cost curve
 * beside the site load, the funding gap beside the diff. A dashboard fills its viewport; a
 * corkboard does not, and the difference is whether the cards were told how much room they
 * have.
 */
export function portfolioPlanningTemplate(vp: CardSize): CardSlot[] {
  // Refuse a viewport that cannot produce a layout rather than emitting NaN coordinates that
  // would persist into the canvas and render cards nowhere. A square board is a reasonable
  // fallback: wrong proportions are recoverable by dragging, invalid ones are not.
  const ratio =
    Number.isFinite(vp.w) && Number.isFinite(vp.h) && vp.w > 0 && vp.h > 0 ? vp.h / vp.w : 1;

  const W = WORLD_W;
  const H = W * ratio;
  const g = W * GUTTER_F;
  const m = W * MARGIN_F;

  const innerW = W - m * 2;
  const innerH = H - m * 2;

  const anchorH = Math.max(PANEL_MIN.h, innerH * ANCHOR_F);
  // Whatever the anchor leaves, split between the two rows with a gutter between them.
  const rowH = Math.max(PANEL_MIN.h, (innerH - anchorH - g * 2) / 2);
  const colW = Math.max(PANEL_MIN.w, (innerW - g) / 2);

  const row2Y = m + anchorH + g;
  const row3Y = row2Y + rowH + g;
  const col2X = m + colW + g;

  return [
    // Anchor: the schedule, full width across the top.
    { x: m, y: m, w: innerW, h: anchorH },
    // The pair beneath it — cost curve beside site load.
    { x: m, y: row2Y, w: colW, h: rowH },
    { x: col2X, y: row2Y, w: colW, h: rowH },
    // The lower pair — funding gap beside the diff.
    { x: m, y: row3Y, w: colW, h: rowH },
    { x: col2X, y: row3Y, w: colW, h: rowH },
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
