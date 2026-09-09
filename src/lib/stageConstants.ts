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
function pairedTemplate(
  panels: number,
  vp: CardSize,
  rowContentH?: number,
  anchorContentH?: number,
): CardSlot[] {
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
  // The caller may know better than the constant: a grid's height is a function of its ROW
  // COUNT, and a card sized for three subjects showing four hides one — along with any period
  // column whose only cells belong to it, which then reads as missing data rather than a
  // hidden row. A supplied height is honoured when it is LARGER; the constant is a floor, so
  // an unknown archetype can never shrink a card below what a chart needs.
  const rowH =
    typeof rowContentH === "number" && Number.isFinite(rowContentH) && rowContentH > CARD_CONTENT_H
      ? rowContentH
      : CARD_CONTENT_H;
  // THE ANCHOR HAS ITS OWN CONTENT AND ITS OWN HEIGHT, and conflating the two was a real bug:
  // the gantt's natural height was measured, folded into the single "tallest content" figure,
  // and then applied to the LOWER ROWS — inflating three cards that did not need it while the
  // card that did kept a constant. The schedule still clipped mid-row, which is exactly the
  // defect the measuring was added to fix, reached by the opposite path.
  const anchorH =
    typeof anchorContentH === "number" &&
    Number.isFinite(anchorContentH) &&
    anchorContentH > ANCHOR_CONTENT_H
      ? anchorContentH
      : ANCHOR_CONTENT_H;
  // ROWS ARE DERIVED FROM THE PANEL COUNT, not assumed. This was `rowH * 2` and a literal
  // five-element array, which is the fixed-count assumption the second ratified template found:
  // `program_finance` declares SIX panels to `portfolio`'s five. A builder that assumed the
  // count would have laid the sixth card on top of the fifth, or dropped it, and either would
  // have looked like a template that "nearly works".
  const rows = Math.max(1, Math.ceil((panels - 1) / 2));
  const boardH = anchorH + rowH * rows + GUTTER * rows;
  const boardW = Math.max(PANEL_MIN.w * 2 + GUTTER, boardH * aspect);

  const colW = (boardW - GUTTER) / 2;
  const col2X = colW + GUTTER;
  const rowY = (i: number) => anchorH + GUTTER + i * (rowH + GUTTER);

  // Position 0 is the ANCHOR, full width across the top. Every panel after it is a `pair`
  // slot, filling left-then-right, row by row — the roles the ratified YAML declares, and
  // never pixels, per §7.
  const slots: CardSlot[] = [{ x: 0, y: 0, w: boardW, h: anchorH }];
  for (let k = 1; k < panels; k++) {
    const i = Math.floor((k - 1) / 2);
    const leftColumn = (k - 1) % 2 === 0;
    // AN ODD TRAILING PAIR KEEPS ITS PAIR WIDTH and leaves the right column empty.
    //
    // `program_finance` has five pair panels, so its last row holds one. Widening it to fill
    // the row would draw the final measure at twice the size of its siblings — a claim about
    // importance that the template did not make, and one a reader would take from the layout.
    // An empty half-row says what is true: this board has an odd number of pairs. Same rule as
    // an absent cell being a gap rather than a zero.
    slots.push({ x: leftColumn ? 0 : col2X, y: rowY(i), w: colW, h: rowH });
  }
  return slots;
}

/**
 * The first ratified board — `policy/canvases/portfolio.yaml`, five panels.
 *
 *   0 anchor  mesh:planSchedule
 *   1 pair    mesh:planCostCurve      2 pair  mesh:planSiteLoad
 *   3 pair    mesh:planFundingGap     4 pair  mesh:planMaturityGrid
 */
export const portfolioPlanningTemplate = (
  vp: CardSize,
  rowContentH?: number,
  anchorContentH?: number,
): CardSlot[] => pairedTemplate(PORTFOLIO_PLANNING_SLOTS, vp, rowContentH, anchorContentH);

/**
 * The second ratified board — `policy/canvases/program_finance.yaml`, SIX panels.
 *
 *   0 anchor  mesh:finFundingStatus
 *   1 pair    mesh:finBurnRate            2 pair  mesh:finPerformanceIndices
 *   3 pair    mesh:finVarianceAnalysis    4 pair  mesh:finVarianceDrivers
 *   5 pair    mesh:finEacCalculation
 *
 * IT CANNOT SEED TODAY, and that is not this row's problem. All six fin verbs require
 * `program_id` with no default and `finEacCalculation` also requires `method`, with
 * `shared_slots` empty by dispatch — so every panel refuses at seed time. The registry entry
 * governs PLACEMENT, and placement is correct whether or not the panels can currently be
 * filled. Recorded here so a refusing board is not read as this row being wrong.
 */
export const programFinanceTemplate = (
  vp: CardSize,
  rowContentH?: number,
  anchorContentH?: number,
): CardSlot[] => pairedTemplate(PROGRAM_FINANCE_SLOTS, vp, rowContentH, anchorContentH);

/** The number of slots each template declares, without needing a viewport to ask. */
export const PORTFOLIO_PLANNING_SLOTS = 5;
export const PROGRAM_FINANCE_SLOTS = 6;

/**
 * The first ratified template's id — ADR-0050 §1, `policy/canvases/portfolio.yaml`.
 *
 * A CONSTANT BECAUSE THE LANDING ORDER IS THE HAZARD. §7 names it: a second `template_id` must
 * be admitted on both sides, and THE FRONTEND ROW MUST LAND BEFORE THE BACKEND ADVERTISES IT —
 * the same ordering trap already written into the archetype registries by name. A literal at
 * the lookup site is how a row gets added on one side and spelled differently on the other.
 */
export const PORTFOLIO_TEMPLATE_ID = "portfolio";

/**
 * The second ratified template's id — `policy/canvases/program_finance.yaml`.
 *
 * A constant for the same reason as the first: a literal at the lookup site is how a row gets
 * added on one side and spelled differently on the other, and a WRONG key is worse than a
 * missing one because a missing one now announces itself.
 */
export const PROGRAM_FINANCE_TEMPLATE_ID = "program_finance";

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
const TEMPLATES: Record<
  string,
  (vp: CardSize, rowContentH?: number, anchorContentH?: number) => CardSlot[]
> = {
  // ADR-0050 §1: `policy/canvases/<template_id>.yaml`, so the first ratified board is
  // `portfolio`. This is the key the SERVER will name when it seeds.
  [PORTFOLIO_TEMPLATE_ID]: portfolioPlanningTemplate,
  // THE LEGACY KEY, AND IT IS NOT A DUPLICATE ROW. Every canvas authored before templates had
  // ids carries `use: "portfolio_planning"` and no `template_id`, and those boards must keep
  // laying out exactly as they did — a template that silently stopped applying would reflow
  // somebody's board on the next render and look like the fold breaking.
  portfolio_planning: portfolioPlanningTemplate,
  // The second ratified board (ADR-0050 §9.2). No legacy alias: nothing predates its id.
  [PROGRAM_FINANCE_TEMPLATE_ID]: programFinanceTemplate,
};

/**
 * Every `template_id` this build can lay out — the frontend half of ADR-0050 §7's ordering rule.
 *
 * ONE SOURCE, so adding the second ratified template is a row in `TEMPLATES` and nothing else.
 * A second list kept in step by hand is how a row gets added on one side and spelled
 * differently on the other, which is the failure `PORTFOLIO_TEMPLATE_ID` already exists to
 * prevent at the lookup site.
 *
 * The legacy `use` key is deliberately included: it is a key this build genuinely resolves, and
 * a reader asking "can this client lay out that board" is owed the true answer rather than the
 * tidy one.
 */
export const KNOWN_TEMPLATE_IDS: readonly string[] = Object.keys(TEMPLATES);

/**
 * Ids already reported, so the warning below fires ONCE rather than per card per render.
 *
 * A board of five cards calls `templateSlot` five times, and re-renders on every camera move.
 * A warning without this would produce hundreds of identical lines, which is indistinguishable
 * from noise and gets the whole channel muted — taking the useful half with it, the same way a
 * duration warning on every historical row would have.
 */
const warnedTemplateIds = new Set<string>();

/**
 * The slot a template assigns to the nth card, or null when there is no template for this
 * board or it has run past its end. Null means "fall back to the generic placement" — a
 * template declares where its FIRST cards go, and a canvas that outgrows it keeps working.
 *
 * ── KEYED BY `template_id`, NOT BY `use` (ADR-0050 §7) ─────────────────────────────────────
 *
 * Those were one concept while there was one template, and they are not one concept. `use` is
 * the canvas's LENS — what chrome it wears, which is a property of how a person reads the
 * board. `template_id` names the ratified YAML that seeded it. Keeping the geometry keyed by
 * the lens would mean a second ratified board could not have its own arrangement without
 * inventing a lens for it, and two boards sharing a lens could not differ in layout at all.
 *
 * §7's ruling is what stays: a panel's `layout` declares its SLOT ROLE and ordinal — anchor,
 * and the pairs beneath it — never pixels. The geometry that realizes a role lives here,
 * because the coordinates are derived from the viewport aspect and from MEASURED content
 * heights, and there is no set of numbers a YAML could carry that would survive a different
 * pane.
 *
 * The `use` fallback is for boards that predate template ids — see the legacy row in
 * `TEMPLATES`.
 */
export function templateSlot(
  templateId: string | undefined,
  n: number,
  vp: CardSize,
  rowContentH?: number,
  anchorContentH?: number,
): CardSlot | null {
  const build = templateId ? TEMPLATES[templateId] : undefined;
  if (!build) {
    /**
     * THE LANDING ORDER, SAID OUT LOUD.
     *
     * Falling back to generic placement is the right BEHAVIOUR — it does not throw, and it does
     * not borrow another template's arrangement, which would draw a board nobody authored. It
     * was also completely silent, which makes the one failure §7 warns about invisible: the
     * backend advertises a second template, this registry has no row for it yet, and every
     * seeded board lays out generically while looking merely disappointing.
     *
     * A board that draws WRONG is harder to catch than one that does not draw. Naming the id is
     * what turns "the layout looks off" into "that row has not landed here yet".
     *
     * Only a NAMED id is reported. `undefined` means the board has no template at all — the
     * ordinary case for anything a person built by hand — and is not a finding.
     */
    if (templateId && !warnedTemplateIds.has(templateId)) {
      warnedTemplateIds.add(templateId);
      // eslint-disable-next-line no-console
      console.warn(
        "[ADR-0050 §7] no arrangement for template_id " +
          JSON.stringify(templateId) +
          " — this build knows " +
          JSON.stringify(KNOWN_TEMPLATE_IDS) +
          ". The board is placing generically. The frontend row must land BEFORE the backend " +
          "advertises the template; this is that gap, from the far side of it.",
      );
    }
    return null;
  }
  const t = build(vp, rowContentH, anchorContentH);
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
