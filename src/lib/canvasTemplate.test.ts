import { readFileSync } from "node:fs";
import path from "node:path";
/**
 * A canvas TYPE governs chrome and arrangement. It must never govern content.
 *
 * That boundary is the whole reason typed canvases stay one substrate instead of becoming
 * separate apps, and it is exactly the kind of rule that erodes by a single reasonable-looking
 * commit ("a planning canvas should only accept planning answers"). So it is asserted, not
 * just written down.
 *
 * The arrangement half is asserted as a PROPERTY of the placement, not as coordinates: pinning
 * `x === 90` couples the test to a spacing choice, while pinning "the anchor spans both columns
 * and the pair beneath it does not overlap" survives a redesign and still catches a broken
 * template.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  STAGE_CARD,
  PORTFOLIO_PLANNING_SLOTS,
  portfolioPlanningTemplate,
  templateSlot,
  PORTFOLIO_TEMPLATE_ID,
  KNOWN_TEMPLATE_IDS,
  PROGRAM_FINANCE_TEMPLATE_ID,
  programFinanceTemplate,
  PANEL_MIN,
  type CardSlot,
} from "./stageConstants";

/** A landscape pane — the shape this workspace is actually read in. The template is a
 *  function of it now, so every geometric assertion below is made against a real one. */
const VP = { w: 1600, h: 900 };
const TEMPLATE = portfolioPlanningTemplate(VP);
import { useStageStore } from "@/store/useStageStore";
import { useCanvasStore } from "@/store/useCanvasStore";

const overlaps = (a: CardSlot, b: CardSlot) =>
  a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

describe("the portfolio_planning template", () => {
  it("has slots at all — positive control", () => {
    // Without this, every assertion below passes over an empty array.
    expect(TEMPLATE.length).toBeGreaterThanOrEqual(5);
  });

  it("leads with an anchor WIDER than a default card — the layout this type exists for", () => {
    // The reason per-item sizing landed first. If the anchor is not wide, the template is
    // just the generic grid with extra steps.
    expect(TEMPLATE[0].w).toBeGreaterThan(STAGE_CARD.w);
  });

  it("places no two cards on top of each other", () => {
    // A template that overlaps is worse than no template: the user's first action is to undo
    // it, and the seeded canvas looks broken rather than arranged.
    const slots = TEMPLATE;
    for (let i = 0; i < slots.length; i++) {
      for (let j = i + 1; j < slots.length; j++) {
        expect(overlaps(slots[i], slots[j]), `slot ${i} overlaps slot ${j}`).toBe(false);
      }
    }
  });

  it("every slot is finite and positive — a template cannot ship the zero-size defect", () => {
    for (const s of TEMPLATE) {
      for (const v of [s.x, s.y, s.w, s.h]) expect(Number.isFinite(v)).toBe(true);
      expect(s.w).toBeGreaterThan(0);
      expect(s.h).toBeGreaterThan(0);
    }
  });

  it("runs OUT rather than wrapping — past its end, placement falls back", () => {
    // A template declares where the FIRST cards go. A canvas that outgrows it must keep
    // working, not restart at slot 0 and stack cards on the anchor.
    expect(templateSlot("portfolio_planning", 0, VP)).not.toBeNull();
    expect(templateSlot("portfolio_planning", PORTFOLIO_PLANNING_SLOTS, VP)).toBeNull();
    expect(templateSlot("portfolio_planning", -1, VP)).toBeNull();
  });

  it("an untyped or unknown canvas gets NO template", () => {
    expect(templateSlot(undefined, 0, VP)).toBeNull();
    expect(templateSlot("relationship", 0, VP)).toBeNull();
    expect(templateSlot("aggregation", 0, VP)).toBeNull();
  });
});

describe("the template applies through the ORDINARY add path", () => {
  beforeEach(() => {
    // The template is a function of the pane, so the store must be looking at the SAME pane
    // these assertions were computed against — otherwise the two disagree by a viewport.
    useStageStore.setState({ canvases: [], view: "global", viewport: VP } as never);
    useCanvasStore.setState({ artifacts: [] } as never);
  });

  it("the store REFUSES a degenerate measure — a bad viewport becomes a saved layout", () => {
    // A ResizeObserver fires 0x0 for a hidden pane, and arrangement is DURABLE: a template
    // built from that measure does not flicker and correct itself, it persists. So the
    // refusal belongs at the setter, before anything can lay a card out against it.
    useStageStore.setState({ viewport: VP } as never);
    for (const bad of [{ w: 0, h: 0 }, { w: 1600, h: 0 }, { w: NaN, h: 900 }, { w: -5, h: 900 }]) {
      useStageStore.getState().setViewport(bad);
      expect(useStageStore.getState().viewport).toEqual(VP);
    }
    // Positive control: a real measure IS accepted, or the assertion above is vacuous.
    useStageStore.getState().setViewport({ w: 1234, h: 777 });
    expect(useStageStore.getState().viewport).toEqual({ w: 1234, h: 777 });
  });
  it("a SEED gives every card the same row height, whatever order they arrive in", () => {
    // The ragged-board failure, and it is why seeding measures the whole set before placing
    // any of it. Measured incrementally, the tallest card arriving LAST gets a taller slot
    // than the neighbours already placed, and the two lower rows stop lining up — a board
    // that looks hand-broken rather than arranged.
    const tall = ["s1", "s2", "s3", "s4", "s5", "s6"].map((s2) => ({
      subject_id: s2,
      period: "p1",
      value: 1,
      threshold: 2,
    }));
    useCanvasStore.setState({
      artifacts: [
        { id: "a1", rendered_output: { components: [{ archetype: "PERIOD_SERIES" }] } },
        { id: "a2", rendered_output: { components: [{ archetype: "PERIOD_SERIES" }] } },
        { id: "a3", rendered_output: { components: [{ archetype: "PERIOD_SERIES" }] } },
        { id: "a4", rendered_output: { components: [{ archetype: "PERIOD_SERIES" }] } },
        // The tall one arrives LAST, which is the case that used to go ragged.
        { id: "a5", rendered_output: { components: [{ archetype: "THRESHOLD_GRID", rows: tall }] } },
      ],
    } as never);

    const id = useStageStore.getState().seedPortfolioCanvas(["a1", "a2", "a3", "a4", "a5"], "P", false);
    const items = useStageStore.getState().canvases.find((c) => c.id === id)!.items;

    // The four non-anchor cards share one height...
    const heights = new Set(items.slice(1).map((it) => it.h));
    expect(heights.size).toBe(1);
    // ...and it is the TALL one's, not the default.
    expect(items[1].h).toBeGreaterThan(portfolioPlanningTemplate(VP)[1].h);
    // ...and the two lower rows line up rather than overlapping.
    expect(items[3].y).toBeGreaterThanOrEqual(items[1].y + (items[1].h ?? 0));
    expect(items[1].y).toBe(items[2].y);
    expect(items[3].y).toBe(items[4].y);
  });

  it("the placed card is sized for the CONTENT it holds, not the constant", () => {
    // The wiring, not the arithmetic. `naturalCardSize` can be perfect and the store can fail
    // to call it, and every unit test still passes — the same unreachable-path shape as a
    // module nothing imports. This asserts the store actually consults it.
    useCanvasStore.setState({
      artifacts: [
        {
          id: "big",
          rendered_output: {
            components: [
              {
                archetype: "THRESHOLD_GRID",
                rows: ["s1", "s2", "s3", "s4", "s5", "s6"].map((s2) => ({
                  subject_id: s2,
                  period: "p1",
                  value: 1,
                  threshold: 2,
                })),
              },
            ],
          },
        },
      ],
    } as never);

    const withContent = useStageStore.getState().createCanvas("P", "portfolio_planning", false);
    useStageStore.getState().addItemAuto(withContent, "anchor");
    useStageStore.getState().addItemAuto(withContent, "big");
    const placed = useStageStore
      .getState()
      .canvases.find((c) => c.id === withContent)!
      .items.find((it) => it.id === "big")!;

    // A six-subject grid needs more than the template's chart-shaped default.
    expect(placed.h).toBeGreaterThan(portfolioPlanningTemplate(VP)[1].h);
  });

  it("an artifact the sizer does not recognise leaves the default intact", () => {
    // The other half: unknown content must not shrink or inflate a card. Without this the
    // assertion above would pass on a store that made every card enormous.
    useCanvasStore.setState({
      artifacts: [{ id: "plain", rendered_output: { components: [{ archetype: "PERIOD_SERIES" }] } }],
    } as never);
    const c = useStageStore.getState().createCanvas("P", "portfolio_planning", false);
    useStageStore.getState().addItemAuto(c, "a");
    useStageStore.getState().addItemAuto(c, "plain");
    const placed = useStageStore.getState().canvases.find((x) => x.id === c)!.items[1];
    expect(placed.h).toBe(portfolioPlanningTemplate(VP)[1].h);
  });

  it("a typed canvas seeds into its template; an untyped one does not", () => {
    // The load-bearing property of the whole approach: a seeded canvas and a hand-built one
    // must be indistinguishable to every consumer, so the template rides `addItemAuto` rather
    // than a parallel seeding path with its own coordinate vocabulary.
    const typed = useStageStore.getState().createCanvas("P", "portfolio_planning", false);
    const plain = useStageStore.getState().createCanvas("G", undefined, false);
    useStageStore.getState().addItemAuto(typed, "a1");
    useStageStore.getState().addItemAuto(plain, "a1");

    const t = useStageStore.getState().canvases.find((c) => c.id === typed)!.items[0];
    const g = useStageStore.getState().canvases.find((c) => c.id === plain)!.items[0];

    expect({ x: t.x, y: t.y, w: t.w, h: t.h }).toEqual(TEMPLATE[0]);
    // The untyped canvas keeps the generic slot and carries no dimensions at all.
    expect(g.w).toBeUndefined();
    expect(g.h).toBeUndefined();
  });

  it("keeps placing past the template's end instead of refusing or stacking", () => {
    const id = useStageStore.getState().createCanvas("P", "portfolio_planning", false);
    const n = TEMPLATE.length + 2;
    for (let i = 0; i < n; i++) useStageStore.getState().addItemAuto(id, `a${i}`);
    const items = useStageStore.getState().canvases.find((c) => c.id === id)!.items;
    expect(items).toHaveLength(n);
    // The overflow cards fell through to the generic slot, so they carry no explicit size.
    expect(items[n - 1].w).toBeUndefined();
  });

  it("a SEEDED canvas is ARRANGED identically to a hand-built one — the whole point", () => {
    // The property that makes seeding a starting point rather than a second kind of object.
    // If the ARRANGEMENT diverges, "built the way a user would build it" has become a claim
    // instead of a fact, and every consumer that reads canvases needs a special case.
    //
    // NARROWED FROM BYTE-IDENTICAL, and the narrowing is the interesting part. It compared the
    // whole object, which also forbade the seeded board from RECORDING ANYTHING ABOUT ITS OWN
    // ORIGIN — and `template_id` is exactly that: which ratified YAML arranged it, a fact that
    // is true of a seeded board and genuinely false of a hand-built one. The seal was written
    // when those were the same object in every respect, and it would have had to be deleted to
    // let a second template exist at all.
    //
    // So it keeps its teeth where they matter — the items, the geometry, the lens — and the
    // fields allowed to differ are ENUMERATED rather than the comparison being dropped. A
    // seeded board that grew some arrangement field a hand-built one lacks still fails here.
    const ids = ["a1", "a2", "a3"];

    const seeded = useStageStore.getState().seedPortfolioCanvas(ids, "Seeded", false);
    const byHand = useStageStore.getState().createCanvas("ByHand", "portfolio_planning", false);
    for (const id of ids) useStageStore.getState().addItemAuto(byHand, id);

    const all = useStageStore.getState().canvases;
    const s = all.find((c) => c.id === seeded)!;
    const h = all.find((c) => c.id === byHand)!;

    expect(s.items).toEqual(h.items);
    expect(s.use).toBe(h.use);

    // PROVENANCE MAY DIFFER; ARRANGEMENT MAY NOT. Anything outside this list that differs is
    // the divergence the seal exists to catch.
    const PROVENANCE = new Set(["id", "name", "template_id", "seededFrom", "ratified_as"]);
    const strip = (c: Record<string, unknown>) =>
      Object.fromEntries(Object.entries(c).filter(([k]) => !PROVENANCE.has(k)));
    expect(strip(s as never)).toEqual(strip(h as never));

    // And the positive control for the narrowing: the seeded board really does record its
    // template, so this is not a comparison that passes by ignoring everything.
    expect(s.template_id).toBe(PORTFOLIO_TEMPLATE_ID);
    expect(h.template_id).toBeUndefined();
  });

  it("ORDER decides the slot — the caller's ordering is the declaration", () => {
    // Which measure lands in the anchor is the seeding intent's business, expressed as the
    // order it passes the ids. Nothing here assigns meaning to a slot.
    const id = useStageStore.getState().seedPortfolioCanvas(["gantt", "cost", "load"], "P", false);
    const items = useStageStore.getState().canvases.find((c) => c.id === id)!.items;
    expect(items.map((i) => i.id)).toEqual(["gantt", "cost", "load"]);
    expect({ ...items[0] }).toEqual({ id: "gantt", ...TEMPLATE[0] });
  });

  it("seeds an EMPTY canvas without inventing rows", () => {
    // A composition step that produced nothing must produce an empty canvas, not a canvas of
    // placeholders. The seeding intent may legitimately come back with fewer answers than it
    // asked for — a refusal is one of the outcomes.
    const id = useStageStore.getState().seedPortfolioCanvas([], "P", false);
    expect(useStageStore.getState().canvases.find((c) => c.id === id)!.items).toEqual([]);
  });

  it("a TYPE never restricts what a canvas may hold — lens, not container", () => {
    // The rule that keeps canvases one substrate. Any artifact id goes onto any canvas; the
    // store has no notion of a card being wrong for a type, and must not grow one.
    const id = useStageStore.getState().createCanvas("P", "portfolio_planning", false);
    for (const anyId of ["answer-1", "task:t9", "urn:whatever"]) {
      useStageStore.getState().addItemAuto(id, anyId);
    }
    const items = useStageStore.getState().canvases.find((c) => c.id === id)!.items;
    expect(items.map((i) => i.id)).toEqual(["answer-1", "task:t9", "urn:whatever"]);
  });
});

describe("a SIZED card renders its content; an unsized one previews it", () => {
  const card = readFileSync(
    path.join(__dirname, "../components/AgenticCanvas/StageCard.tsx"),
    "utf8",
  );

  it("the card source is read — positive control", () => {
    expect(card).toContain("export function StageCard");
  });

  it("decides on the ITEM's dimensions, not on which view it is in", () => {
    // Arrangement is UI-owned (ADR-0042 §4), so a card given dimensions has already declared
    // how much room its content gets. Keying on the view instead would make the same answer
    // render differently depending on where it is looked at.
    expect(card).toMatch(/const sized = Boolean\(size &&/);
  });

  it("a sized card does NOT go through FitBox — that is the letterboxing", () => {
    // FitBox scales a fixed 640-wide block by the SMALLER of the width and height ratios, so
    // content taller than the card's aspect ratio is scaled by height and then under-fills
    // the width. On a workspace panel that reads as a thumbnail in margins.
    const branch = card.slice(card.indexOf("hasRendered && sized"), card.indexOf(") : hasRendered ?"));
    expect(branch.length).toBeGreaterThan(50); // positive control on the slice
    expect(branch).not.toContain("FitBox");
    expect(branch).toContain("SemanticInterpreter");
  });

  it("a sized card SCROLLS rather than clipping", () => {
    // A panel sized slightly too small must stay readable. Silent clipping is content cut off
    // with nothing saying so — the same failure as a chart that draws nothing.
    const branch = card.slice(card.indexOf("hasRendered && sized"), card.indexOf(") : hasRendered ?"));
    expect(branch).toMatch(/overflow-auto/);
  });

  it("the anchor gets the largest share of the board — a timeline needs the room", () => {
    // This once read `anchor.h >= 420`, an absolute world height that stopped meaning
    // anything when world units cancelled out of on-screen size. What survives is the CLAIM:
    // a schedule gantt must not be asked to fit in a chart`s height.
    const [anchor, ...rest] = TEMPLATE;
    for (const s2 of rest) {
      expect(anchor.h).toBeGreaterThan(s2.h);
      expect(anchor.w).toBeGreaterThan(s2.w);
    }
  });

  it("tiles the pane`s WIDTH, and takes the height its CONTENT needs", () => {
    // The asymmetry is the design, and it replaces an earlier rule that made the board match
    // the pane`s aspect on BOTH axes. That rule filled the pane and starved the cards: on a
    // landscape pane each lower card got about a fifth of the board, and a planning card`s
    // content does not fit in that. A card body does not scale to its box — the panel renders
    // at natural size and scrolls — so the result was a title with the chart below the fold.
    //
    // Horizontal gap is pure waste, so the width always tracks. Vertical room is what the
    // cards are actually short of, so the height never goes below what they need.
    for (const vp of [{ w: 1600, h: 900 }, { w: 2560, h: 700 }, { w: 1200, h: 1400 }]) {
      const t = portfolioPlanningTemplate(vp);
      const boardW = Math.max(...t.map((s2) => s2.x + s2.w));
      // Every board is the same width — the columns tile it whatever the pane is doing.
      expect(t[0].w).toBe(boardW);
      // And no card is ever below the height its content needs.
      for (const s2 of t) expect(s2.h).toBeGreaterThanOrEqual(PANEL_MIN.h);
    }
  });

  it("the board MATCHES the pane aspect, so nothing is left over on either side", () => {
    // The whole point of deriving width from height. The camera fits by the SMALLER ratio, so
    // a board narrower in proportion than its pane is fitted by height and the sides go empty
    // — the original defect. Equal aspect means both ratios are the same and neither axis is
    // the loser.
    for (const vp of [{ w: 1600, h: 900 }, { w: 2560, h: 700 }, { w: 1400, h: 1000 }]) {
      const t = portfolioPlanningTemplate(vp);
      const boardW = Math.max(...t.map((s2) => s2.x + s2.w));
      const boardH = Math.max(...t.map((s2) => s2.y + s2.h));
      expect(boardW / boardH).toBeCloseTo(vp.w / vp.h, 1);
    }
  });

  it("gives every card the height its CONTENT needs, whatever the pane does", () => {
    // The half the aspect rule cannot be allowed to compromise. A planning card renders a
    // fixed-height chart under its chrome and does not scale to its box, so a card shorter
    // than its content shows a title and hides the chart. Height is therefore a constant of
    // the content, and only the WIDTH answers to the pane.
    const heights = new Set<number>();
    for (const vp of [{ w: 1600, h: 900 }, { w: 2560, h: 700 }, { w: 1400, h: 1000 }]) {
      const t = portfolioPlanningTemplate(vp);
      t.forEach((s2) => heights.add(s2.h));
      for (const s2 of t) expect(s2.h).toBeGreaterThanOrEqual(PANEL_MIN.h);
    }
    // Two heights across every pane — the anchor`s and the row`s — because they do not vary.
    expect(heights.size).toBe(2);
  });

  it("a WIDER pane widens the cards rather than shrinking them", () => {
    // Widening is safe where shortening is not: content flows to the width it is given, so a
    // wide card is a wide chart. This is why the two axes are treated differently at all.
    const narrow = portfolioPlanningTemplate({ w: 1200, h: 900 });
    const wide = portfolioPlanningTemplate({ w: 2400, h: 900 });
    expect(wide[0].w).toBeGreaterThan(narrow[0].w);
    expect(wide[1].h).toBe(narrow[1].h);
  });
  it("the two lower rows tile the width — no gap down the middle", () => {
    const [anchor, a, b] = TEMPLATE;
    // Left edges align with the anchor, right edges align with the anchor: the row spans the
    // same width the anchor does, which is what "edge to edge" means here.
    expect(a.x).toBe(anchor.x);
    expect(b.x + b.w).toBeCloseTo(anchor.x + anchor.w, 5);
    // And the gutter between them is a gutter, not a canyon.
    const gap = b.x - (a.x + a.w);
    expect(gap).toBeGreaterThan(0);
    expect(gap / anchor.w).toBeLessThan(0.06);
  });

  it("refuses a degenerate viewport rather than emitting NaN slots", () => {
    // A ResizeObserver fires 0x0 for a hidden pane. Slots built from that would be NaN or
    // zero-sized AND WOULD PERSIST — arrangement is durable, so a bad measure is a saved
    // layout, not a transient glitch.
    for (const vp of [{ w: 0, h: 0 }, { w: NaN, h: 900 }, { w: 1600, h: -1 }]) {
      for (const s2 of portfolioPlanningTemplate(vp)) {
        for (const v of [s2.x, s2.y, s2.w, s2.h]) expect(Number.isFinite(v)).toBe(true);
        expect(s2.w).toBeGreaterThan(0);
        expect(s2.h).toBeGreaterThan(0);
      }
    }
  });
});

describe("the type gates CHROME, and the chrome is not a card", () => {
  const stage = readFileSync(
    path.join(__dirname, "../components/AgenticCanvas/GlobalCanvasStage.tsx"),
    "utf8",
  );
  const chrome = readFileSync(
    path.join(__dirname, "../components/AgenticCanvas/PlanningChrome.tsx"),
    "utf8",
  );

  it("the sources are being read — positive control", () => {
    expect(stage).toContain("export function GlobalCanvasStage");
    expect(chrome).toContain("export function PlanningChrome");
  });

  it("mounts only for its own type, following the relationship precedent", () => {
    expect(stage).toMatch(/activeCanvas\?\.use === "portfolio_planning"/);
    expect(stage).toMatch(/activeCanvas\?\.use === "relationship"/);
  });

  it("the chrome READS state and holds none — no store writes, no local state", () => {
    // The two-masters guard. A counter that stores anything becomes a second source of truth
    // for something already persisted, and the two drift.
    expect(chrome).not.toMatch(/useState|setState|localStorage|sessionStorage/);
  });

  it("does not fabricate a count it cannot derive", () => {
    // cortex-ui has no DecisionRecord artifact to count, and a 0 would assert "measured, and
    // none" — false the moment the first commit lands. The em dash says "not measured".
    expect(chrome).toContain("value={null}");
  });
});

/**
 * A BOARD NOBODY ARRANGED IS RE-FITTED; A BOARD SOMEBODY ARRANGED IS NOT.
 *
 * Collapsing the rails makes the pane far wider without making it taller, and the camera fits
 * by the SMALLER ratio — so a board shaped for the old pane is fitted by height and cannot use
 * the new width. Presentation mode gave the pane room and the board could not take it, which
 * looked exactly like the mode doing nothing.
 *
 * Re-fitting is safe only where there is nothing to lose. That is the whole content of
 * `arranged`: the moment a human moves, resizes or drops a card, the board is theirs and
 * presenting it must never rearrange it.
 */
describe("re-fitting a template to a differently-shaped pane", () => {
  const NARROW = { w: 1280, h: 1000 };
  const WIDE = { w: 1854, h: 1000 };

  beforeEach(() => {
    useStageStore.setState({ canvases: [], view: "global", viewport: NARROW } as never);
    useCanvasStore.setState({ artifacts: [] } as never);
  });

  it("an UNTOUCHED typed board follows the pane", () => {
    const id = useStageStore.getState().createCanvas("P", "portfolio_planning", false);
    for (const a of ["a1", "a2", "a3"]) useStageStore.getState().addItemAuto(id, a);
    const before = useStageStore.getState().canvases[0].items[0].w;

    useStageStore.getState().setViewport(WIDE);

    const after = useStageStore.getState().canvases[0].items[0].w;
    expect(after).toBeGreaterThan(before!);
    // And it matches what the template would build for the new pane — not merely "bigger".
    expect(after).toBe(portfolioPlanningTemplate(WIDE)[0].w);
  });

  it("a board a HUMAN arranged is left exactly alone", () => {
    const id = useStageStore.getState().createCanvas("P", "portfolio_planning", false);
    for (const a of ["a1", "a2", "a3"]) useStageStore.getState().addItemAuto(id, a);
    // One drag is enough to make the board theirs.
    useStageStore.getState().moveItem(id, "a2", 5, 7);
    const before = JSON.stringify(useStageStore.getState().canvases[0].items);

    useStageStore.getState().setViewport(WIDE);

    expect(JSON.stringify(useStageStore.getState().canvases[0].items)).toBe(before);
  });

  it("a RESIZE also makes it theirs", () => {
    const id = useStageStore.getState().createCanvas("P", "portfolio_planning", false);
    useStageStore.getState().addItemAuto(id, "a1");
    useStageStore.getState().resizeItem(id, "a1", 123, 456);
    const before = JSON.stringify(useStageStore.getState().canvases[0].items);
    useStageStore.getState().setViewport(WIDE);
    expect(JSON.stringify(useStageStore.getState().canvases[0].items)).toBe(before);
  });

  it("a DROP at a point also makes it theirs", () => {
    const id = useStageStore.getState().createCanvas("P", "portfolio_planning", false);
    useStageStore.getState().addItemAuto(id, "a1");
    useStageStore.getState().addItemAt(id, "a2", 40, 50);
    const before = JSON.stringify(useStageStore.getState().canvases[0].items);
    useStageStore.getState().setViewport(WIDE);
    expect(JSON.stringify(useStageStore.getState().canvases[0].items)).toBe(before);
  });

  it("SEEDING does not count as arranging — it is the template speaking", () => {
    // The distinction that makes the feature work at all. If seeding marked a board arranged,
    // every seeded board would be frozen at its birth pane and nothing would ever re-fit.
    useCanvasStore.setState({
      artifacts: ["a1", "a2", "a3"].map((id) => ({
        id,
        rendered_output: { components: [{ archetype: "PERIOD_SERIES" }] },
      })),
    } as never);
    useStageStore.getState().seedPortfolioCanvas(["a1", "a2", "a3"], "P", false);
    expect(useStageStore.getState().canvases[0].arranged).toBeFalsy();

    const before = useStageStore.getState().canvases[0].items[0].w;
    useStageStore.getState().setViewport(WIDE);
    expect(useStageStore.getState().canvases[0].items[0].w).toBeGreaterThan(before!);
  });

  it("an UNTYPED canvas is never re-fitted — it has no template to fit to", () => {
    const id = useStageStore.getState().createCanvas("G", undefined, false);
    useStageStore.getState().addItemAuto(id, "a1");
    const before = JSON.stringify(useStageStore.getState().canvases[0].items);
    useStageStore.getState().setViewport(WIDE);
    expect(JSON.stringify(useStageStore.getState().canvases[0].items)).toBe(before);
  });

  it("a viewport that does not actually change re-fits nothing", () => {
    const id = useStageStore.getState().createCanvas("P", "portfolio_planning", false);
    useStageStore.getState().addItemAuto(id, "a1");
    const before = useStageStore.getState().canvases;
    useStageStore.getState().setViewport(NARROW);
    // Same object identity: no work was done, so no consumer re-renders.
    expect(useStageStore.getState().canvases).toBe(before);
  });
});

/**
 * THE STORE MEASURES THE ANCHOR SEPARATELY FROM THE ROWS.
 *
 * The arithmetic can be perfect and the store can still hand both figures to the wrong slots —
 * which is exactly what it did: the gantt's height was folded into the single "tallest
 * content" number and applied to the LOWER ROWS, inflating three cards that did not need it
 * while the schedule kept a constant and went on clipping mid-row. Every unit test was green,
 * because none of them asked which slot each figure reached.
 */
describe("seeding sizes the anchor and the rows from their own content", () => {
  const VP = { w: 1854, h: 1000 };

  beforeEach(() => {
    useStageStore.setState({ canvases: [], view: "global", viewport: VP } as never);
    useCanvasStore.setState({ artifacts: [] } as never);
  });

  it("a tall ANCHOR does not inflate the rows", () => {
    useCanvasStore.setState({
      artifacts: [
        {
          id: "gantt",
          rendered_output: {
            components: [
              { archetype: "INTERVAL_TIMELINE", rows: Array.from({ length: 14 }, () => ({})) },
            ],
          },
        },
        ...["b", "c", "d", "e"].map((id) => ({
          id,
          rendered_output: { components: [{ archetype: "PERIOD_SERIES" }] },
        })),
      ],
    } as never);

    const id = useStageStore.getState().seedPortfolioCanvas(["gantt", "b", "c", "d", "e"], "P", false);
    const items = useStageStore.getState().canvases.find((c) => c.id === id)!.items;

    // The anchor grew past its floor...
    expect(items[0].h).toBeGreaterThan(portfolioPlanningTemplate(VP)[0].h);
    // ...and the rows did not move at all.
    expect(items[1].h).toBe(portfolioPlanningTemplate(VP)[1].h);
  });

  it("a tall ROW does not inflate the anchor", () => {
    const tall = ["s1", "s2", "s3", "s4", "s5", "s6"].map((s) => ({
      subject_id: s,
      period: "p1",
      value: 1,
      threshold: 2,
    }));
    useCanvasStore.setState({
      artifacts: [
        { id: "a", rendered_output: { components: [{ archetype: "PERIOD_SERIES" }] } },
        { id: "grid", rendered_output: { components: [{ archetype: "THRESHOLD_GRID", rows: tall }] } },
        ...["c", "d"].map((id) => ({
          id,
          rendered_output: { components: [{ archetype: "PERIOD_SERIES" }] },
        })),
      ],
    } as never);

    const id = useStageStore.getState().seedPortfolioCanvas(["a", "grid", "c", "d"], "P", false);
    const items = useStageStore.getState().canvases.find((c) => c.id === id)!.items;

    expect(items[1].h).toBeGreaterThan(portfolioPlanningTemplate(VP)[1].h);
    expect(items[0].h).toBe(portfolioPlanningTemplate(VP)[0].h);
  });
});

/**
 * ADR-0050 §7 — THE BUILDER IS KEYED BY `template_id`, AND THE LANDING ORDER IS THE HAZARD.
 *
 * §7 names it directly: a second `template_id` must be admitted on both sides, and the
 * FRONTEND ROW MUST LAND BEFORE THE BACKEND ADVERTISES IT — the same ordering trap already
 * written into the archetype registries by name. These pin the frontend half so a second row
 * is an addition rather than a redesign, and so the boards that predate ids keep their layout.
 */
describe("templates are keyed by template_id, not by lens", () => {
  it("the first ratified board resolves by its id", () => {
    // `policy/canvases/portfolio.yaml` per §1, so the id is `portfolio`. The constant exists
    // because a literal at the lookup site is how a row gets spelled differently on each side.
    expect(PORTFOLIO_TEMPLATE_ID).toBe("portfolio");
    expect(templateSlot(PORTFOLIO_TEMPLATE_ID, 0, VP)).not.toBeNull();
  });

  it("a board seeded before ids existed still lays out — by its `use`", () => {
    // Every canvas authored before templates had ids carries `use: "portfolio_planning"` and
    // no `template_id`. A template that silently stopped applying would reflow somebody's
    // board on the next render and read as the fold breaking.
    expect(templateSlot("portfolio_planning", 0, VP)).not.toBeNull();
  });

  it("the two keys resolve to the SAME arrangement — one template, two names", () => {
    // Not two rows that can drift: the same builder under both keys. If these ever disagree,
    // an old board and a newly seeded one would lay out differently for no stated reason.
    expect(templateSlot(PORTFOLIO_TEMPLATE_ID, 0, VP)).toEqual(
      templateSlot("portfolio_planning", 0, VP),
    );
    expect(templateSlot(PORTFOLIO_TEMPLATE_ID, 3, VP)).toEqual(
      templateSlot("portfolio_planning", 3, VP),
    );
  });

  it("an UNKNOWN template_id falls back to generic placement rather than guessing", () => {
    // The landing-order hazard, from this side. If the backend advertises a second template
    // before this registry has its row, the board must place generically — not throw, and not
    // borrow another template's arrangement, which would look like a layout nobody authored.
    expect(templateSlot("cost-composition", 0, VP)).toBeNull();
    expect(templateSlot(undefined, 0, VP)).toBeNull();
  });

  it("the store looks up by template_id FIRST, falling back to use", () => {
    const STORE = readFileSync(path.join(__dirname, "../store/useStageStore.ts"), "utf8");
    // Both placement sites — the re-fit and the drop — or one board type re-fits by id and
    // places new cards by lens.
    expect(STORE.match(/c\.template_id \?\? c\.use/g)?.length).toBe(2);
    expect(STORE).toContain("template_id?: string;");
  });
});

/**
 * THE UNLANDED ROW HAS TO BE AUDIBLE.
 *
 * §7's hazard is an ORDERING one: the backend advertises a second template, this registry has
 * no row for it yet, and every board it seeds lays out generically. The fallback is right —
 * it does not throw and it does not borrow another template's arrangement, which would draw a
 * board nobody authored — and it was completely SILENT, which makes the failure look like a
 * disappointing layout rather than a missing row.
 *
 * A board that draws WRONG is harder to catch than one that does not draw. This is the same
 * shape as the unjudged ranking that drew grey bars under a legend advertising two colours,
 * and as the answer that rendered KNOWLEDGE_DOCUMENT while routing perfectly.
 */
describe("an unlanded template row says so", () => {
  const warnings = (fn: () => void): string[] => {
    const seen: string[] = [];
    const spy = vi.spyOn(console, "warn").mockImplementation((...args: unknown[]) => {
      seen.push(args.join(" "));
    });
    try {
      fn();
    } finally {
      spy.mockRestore();
    }
    return seen;
  };

  it("NAMES the id it has no row for, and what it does know", () => {
    // Naming both is what turns "the layout looks off" into "that row has not landed here yet".
    const out = warnings(() => templateSlot("funding-status-not-landed", 0, VP));
    expect(out).toHaveLength(1);
    expect(out[0]).toContain("funding-status-not-landed");
    expect(out[0]).toContain("portfolio");
  });

  it("still places generically — the WARNING is not a refusal", () => {
    // The behaviour must not change. A board seeded with an unknown template keeps working;
    // the warning is for the engineer, exactly as with the refused duration.
    expect(templateSlot("another-unlanded-id", 0, VP)).toBeNull();
  });

  it("says NOTHING for a board with no template at all", () => {
    // The ordinary case for anything a person built by hand. Warning here would fire on every
    // freeform canvas and get the channel muted, taking the useful half with it.
    expect(warnings(() => templateSlot(undefined, 0, VP))).toEqual([]);
  });

  it("says NOTHING for a template it can lay out", () => {
    expect(warnings(() => templateSlot(PORTFOLIO_TEMPLATE_ID, 0, VP))).toEqual([]);
    expect(warnings(() => templateSlot("portfolio_planning", 0, VP))).toEqual([]);
  });

  it("warns ONCE per id, not once per card per render", () => {
    // A board of five cards calls this five times and re-renders on every camera move.
    // Hundreds of identical lines is indistinguishable from noise, and noise gets muted.
    const out = warnings(() => {
      for (let n = 0; n < 5; n++) templateSlot("repeated-unlanded-id", n, VP);
      for (let n = 0; n < 5; n++) templateSlot("repeated-unlanded-id", n, VP);
    });
    expect(out).toHaveLength(1);
  });

  it("KNOWN_TEMPLATE_IDS is derived from the registry, not a second list", () => {
    // A hand-kept list is how a row gets added on one side and spelled differently on the
    // other — the failure PORTFOLIO_TEMPLATE_ID already exists to prevent at the lookup site.
    expect(KNOWN_TEMPLATE_IDS).toContain(PORTFOLIO_TEMPLATE_ID);
    expect(KNOWN_TEMPLATE_IDS).toContain("portfolio_planning");
    for (const id of KNOWN_TEMPLATE_IDS) {
      expect(templateSlot(id, 0, VP), id).not.toBeNull();
    }
  });
});

/**
 * THE SECOND RATIFIED TEMPLATE, AND THE FIXED-COUNT ASSUMPTION IT FOUND.
 *
 * `program_finance` declares SIX panels to `portfolio`'s five. The builder was `rowH * 2` and a
 * literal five-element array — an assumption that had been correct for as long as there was one
 * template, and would have laid the sixth card on top of the fifth or dropped it. Either draws
 * a board that "nearly works", which is the failure mode that does not get investigated.
 *
 * The lane authoring the YAML flagged the count BEFORE it could draw, which is the only reason
 * this is a test rather than an incident.
 *
 * NOTE `program_finance` CANNOT SEED TODAY: all six fin verbs require `program_id` with no
 * default, `finEacCalculation` also requires `method`, and `shared_slots` is empty by dispatch,
 * so every panel refuses at seed time. The registry row governs PLACEMENT, which is correct
 * whether or not the panels can be filled — a refusing board is not this row being wrong.
 */
describe("the second ratified template, and the count it does not assume", () => {
  it("resolves by its id and declares SIX panels", () => {
    expect(PROGRAM_FINANCE_TEMPLATE_ID).toBe("program_finance");
    expect(programFinanceTemplate(VP)).toHaveLength(6);
    expect(templateSlot(PROGRAM_FINANCE_TEMPLATE_ID, 5, VP)).not.toBeNull();
  });

  it("places the SIXTH card, which the old builder could not", () => {
    // The regression in one line. Before generalising, index 5 did not exist.
    const sixth = templateSlot(PROGRAM_FINANCE_TEMPLATE_ID, 5, VP);
    expect(sixth).not.toBeNull();
    expect(Number.isFinite(sixth!.x) && Number.isFinite(sixth!.y)).toBe(true);
  });

  it("the odd trailing pair keeps PAIR width and leaves the row half empty", () => {
    // Widening it to fill the row would draw the final measure at twice the size of its
    // siblings — a claim about importance the template never made, and one a reader takes from
    // the layout. An empty half-row says what is true: an odd number of pairs.
    const t = programFinanceTemplate(VP);
    expect(t[5].w).toBe(t[1].w);
    expect(t[5].w).toBeLessThan(t[0].w);
    expect(t[5].x).toBe(t[1].x); // left column
  });

  it("gives the finance board a THIRD row, and the portfolio board still two", () => {
    const fin = programFinanceTemplate(VP);
    const port = portfolioPlanningTemplate(VP);
    const rowsOf = (t: CardSlot[]) => new Set(t.slice(1).map((s) => s.y)).size;
    expect(rowsOf(fin)).toBe(3);
    expect(rowsOf(port)).toBe(2);
    // A third row is taller board, not tighter cards: the pair height must not shrink to fit.
    expect(fin[1].h).toBe(port[1].h);
  });

  it("PORTFOLIO IS UNCHANGED — generalising must not reflow the board people have", () => {
    // Arrangement is durable. A template that quietly moved would reflow every seeded board on
    // its next render and read as the fold breaking, which is exactly what the legacy `use`
    // alias exists to prevent.
    const t = portfolioPlanningTemplate(VP);
    expect(t).toHaveLength(5);
    expect(t[0].x).toBe(0);
    expect(t[0].y).toBe(0);
    expect(t[1].y).toBe(t[2].y);
    expect(t[3].y).toBe(t[4].y);
    expect(t[1].x).toBe(0);
    expect(t[2].x).toBe(t[4].x);
    expect(t[1].w).toBe(t[2].w);
  });

  it("both templates are in the registry, and every id in it lays out", () => {
    expect(KNOWN_TEMPLATE_IDS).toContain(PROGRAM_FINANCE_TEMPLATE_ID);
    for (const id of KNOWN_TEMPLATE_IDS) {
      expect(templateSlot(id, 0, VP), id).not.toBeNull();
    }
  });

  it("NO PANEL OVERLAPS ANOTHER, in either template", () => {
    // The concrete failure a fixed count produces: a card laid on top of another. Asserted as a
    // property over the whole board rather than by checking the one index that broke.
    const overlaps = (a: CardSlot, b: CardSlot) =>
      a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
    for (const t of [portfolioPlanningTemplate(VP), programFinanceTemplate(VP)]) {
      for (let i = 0; i < t.length; i++) {
        for (let j = i + 1; j < t.length; j++) {
          expect(overlaps(t[i], t[j]), `slots ${i} and ${j} overlap`).toBe(false);
        }
      }
    }
  });
});

/**
 * THE BOARD MUST BE AS TALL AS ITS OWN ROWS.
 *
 * Added because three mutations survived: `rows = 2`, `Math.floor` instead of `ceil`, and a
 * board height hard-coded to two rows. All three leave the SLOTS correct — `rowY` is derived
 * from the anchor and the gutter, not from the row count — so nothing overlapped, nothing was
 * dropped, and every assertion above passed.
 *
 * What they broke is the shape of the BOARD the slots sit in: the row count feeds the height,
 * the height feeds the width through the pane's aspect, and a six-panel board measured for two
 * rows declares itself shorter than its own content. The camera then fits a box that does not
 * contain the board, which is the same class as the per-item footprint bug `customWorld`
 * already carries a comment about.
 *
 * The property is the design intent stated directly — a template is a function of the pane it
 * will be read in — and it is the only assertion that can see a height that is merely WRONG
 * rather than absent.
 */
describe("a template is shaped to the pane it will be read in", () => {
  const bounds = (t: CardSlot[]) => ({
    w: Math.max(...t.map((s) => s.x + s.w)),
    h: Math.max(...t.map((s) => s.y + s.h)),
  });

  it("both boards carry the pane's aspect, whatever their row count", () => {
    for (const [name, t] of [
      ["portfolio", portfolioPlanningTemplate(VP)],
      ["program_finance", programFinanceTemplate(VP)],
    ] as [string, CardSlot[]][]) {
      const b = bounds(t);
      expect(b.w / b.h, name).toBeCloseTo(VP.w / VP.h, 1);
    }
  });

  it("holds across pane shapes, so it is not one lucky viewport", () => {
    for (const vp of [
      { w: 1600, h: 900 },
      { w: 2600, h: 1000 },
      { w: 1200, h: 1000 },
    ]) {
      const b = bounds(programFinanceTemplate(vp));
      expect(b.w / b.h, `${vp.w}x${vp.h}`).toBeCloseTo(vp.w / vp.h, 1);
    }
  });

  it("the taller board is TALLER — a third row is not absorbed by shrinking cards", () => {
    // The other way a fixed height could hide: keep the board and squeeze the rows into it.
    // Arrangement is durable, so a card silently shorter than its content is a saved layout.
    expect(bounds(programFinanceTemplate(VP)).h).toBeGreaterThan(
      bounds(portfolioPlanningTemplate(VP)).h,
    );
  });
});
