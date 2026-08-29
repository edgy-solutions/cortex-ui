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
    // This assertion used to read `TEMPLATE[0].h >= 420`, an absolute world height. That
    // number stopped meaning anything when the template became proportional: world units now
    // cancel out of the on-screen size entirely (the camera fits the board to the pane), so
    // an absolute threshold tests the arbitrary constant WORLD_W and nothing a reader sees.
    //
    // What survives the change is the CLAIM: a schedule gantt needs more room than a chart,
    // and it must not be asked to fit in a chart`s height — the failure being a card body
    // that scrolls, showing a row cut in half where the mock shows a whole timeline.
    const [anchor, ...rest] = TEMPLATE;
    for (const s2 of rest) {
      expect(anchor.h).toBeGreaterThan(s2.h);
      expect(anchor.w).toBeGreaterThan(s2.w);
    }
    // And it is a real share of the board, not merely the biggest of five small things.
    const boardH = Math.max(...TEMPLATE.map((s2) => s2.y + s2.h));
    expect(anchor.h / boardH).toBeGreaterThan(0.4);
  });

  it("TILES the pane: the board takes the viewport`s proportions", () => {
    // The defect this template was rewritten for. A fixed-coordinate board is portrait; the
    // pane is landscape; the camera fits by the smaller ratio and leaves the width empty.
    for (const vp of [{ w: 1600, h: 900 }, { w: 1200, h: 1000 }, { w: 1920, h: 1080 }]) {
      const t = portfolioPlanningTemplate(vp);
      const boardW = Math.max(...t.map((s2) => s2.x + s2.w));
      const boardH = Math.max(...t.map((s2) => s2.y + s2.h));
      expect(Math.abs(boardW / boardH - vp.w / vp.h)).toBeLessThan(0.25);
    }
  });

  it("goes TALLER than an extreme pane rather than shipping unreadable rows", () => {
    // A deliberate limit on the rule above, found by writing it: on a very wide short pane,
    // tracking the aspect exactly would give the two lower rows about 7% of the board each —
    // cards a few dozen pixels tall, which fills the pane and cannot be read. The minimum row
    // height wins there and the board becomes taller than the pane, which the camera answers
    // by scaling down a little. Legible and slightly inset beats edge-to-edge and useless.
    const t = portfolioPlanningTemplate({ w: 2560, h: 700 });
    const boardH = Math.max(...t.map((s2) => s2.y + s2.h));
    const boardW = Math.max(...t.map((s2) => s2.x + s2.w));
    expect(boardW / boardH).toBeLessThan(2560 / 700); // taller than the pane, on purpose
    for (const s2 of t.slice(1)) expect(s2.h).toBeGreaterThanOrEqual(PANEL_MIN.h);
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
