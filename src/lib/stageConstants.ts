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
