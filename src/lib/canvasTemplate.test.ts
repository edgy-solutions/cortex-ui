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
import { describe, it, expect, beforeEach } from "vitest";
import {
  STAGE_CARD,
  PORTFOLIO_PLANNING_SLOTS,
  portfolioPlanningTemplate,
  templateSlot,
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

  it("a SEEDED canvas is byte-identical to a hand-built one — the whole point", () => {
    // The property that makes seeding a starting point rather than a second kind of object.
    // If these ever diverge, "built the way a user would build it" has become a claim instead
    // of a fact, and every consumer that reads canvases needs to learn about a special case.
    const ids = ["a1", "a2", "a3"];

    const seeded = useStageStore.getState().seedPortfolioCanvas(ids, "Seeded", false);
    const byHand = useStageStore.getState().createCanvas("ByHand", "portfolio_planning", false);
    for (const id of ids) useStageStore.getState().addItemAuto(byHand, id);

    const all = useStageStore.getState().canvases;
    const s = all.find((c) => c.id === seeded)!;
    const h = all.find((c) => c.id === byHand)!;

    expect(s.items).toEqual(h.items);
    expect(s.use).toBe(h.use);
    // Everything except the identity fields, which are the only things allowed to differ.
    expect({ ...s, id: "", name: "" }).toEqual({ ...h, id: "", name: "" });
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
