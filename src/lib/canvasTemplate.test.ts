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
  PORTFOLIO_PLANNING_TEMPLATE,
  templateSlot,
  type CardSlot,
} from "./stageConstants";
import { useStageStore } from "@/store/useStageStore";

const overlaps = (a: CardSlot, b: CardSlot) =>
  a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

describe("the portfolio_planning template", () => {
  it("has slots at all — positive control", () => {
    // Without this, every assertion below passes over an empty array.
    expect(PORTFOLIO_PLANNING_TEMPLATE.length).toBeGreaterThanOrEqual(5);
  });

  it("leads with an anchor WIDER than a default card — the layout this type exists for", () => {
    // The reason per-item sizing landed first. If the anchor is not wide, the template is
    // just the generic grid with extra steps.
    expect(PORTFOLIO_PLANNING_TEMPLATE[0].w).toBeGreaterThan(STAGE_CARD.w);
  });

  it("places no two cards on top of each other", () => {
    // A template that overlaps is worse than no template: the user's first action is to undo
    // it, and the seeded canvas looks broken rather than arranged.
    const slots = PORTFOLIO_PLANNING_TEMPLATE;
    for (let i = 0; i < slots.length; i++) {
      for (let j = i + 1; j < slots.length; j++) {
        expect(overlaps(slots[i], slots[j]), `slot ${i} overlaps slot ${j}`).toBe(false);
      }
    }
  });

  it("every slot is finite and positive — a template cannot ship the zero-size defect", () => {
    for (const s of PORTFOLIO_PLANNING_TEMPLATE) {
      for (const v of [s.x, s.y, s.w, s.h]) expect(Number.isFinite(v)).toBe(true);
      expect(s.w).toBeGreaterThan(0);
      expect(s.h).toBeGreaterThan(0);
    }
  });

  it("runs OUT rather than wrapping — past its end, placement falls back", () => {
    // A template declares where the FIRST cards go. A canvas that outgrows it must keep
    // working, not restart at slot 0 and stack cards on the anchor.
    expect(templateSlot("portfolio_planning", 0)).not.toBeNull();
    expect(templateSlot("portfolio_planning", PORTFOLIO_PLANNING_TEMPLATE.length)).toBeNull();
    expect(templateSlot("portfolio_planning", -1)).toBeNull();
  });

  it("an untyped or unknown canvas gets NO template", () => {
    expect(templateSlot(undefined, 0)).toBeNull();
    expect(templateSlot("relationship", 0)).toBeNull();
    expect(templateSlot("aggregation", 0)).toBeNull();
  });
});

describe("the template applies through the ORDINARY add path", () => {
  beforeEach(() => {
    useStageStore.setState({ canvases: [], view: "global" } as never);
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

    expect({ x: t.x, y: t.y, w: t.w, h: t.h }).toEqual(PORTFOLIO_PLANNING_TEMPLATE[0]);
    // The untyped canvas keeps the generic slot and carries no dimensions at all.
    expect(g.w).toBeUndefined();
    expect(g.h).toBeUndefined();
  });

  it("keeps placing past the template's end instead of refusing or stacking", () => {
    const id = useStageStore.getState().createCanvas("P", "portfolio_planning", false);
    const n = PORTFOLIO_PLANNING_TEMPLATE.length + 2;
    for (let i = 0; i < n; i++) useStageStore.getState().addItemAuto(id, `a${i}`);
    const items = useStageStore.getState().canvases.find((c) => c.id === id)!.items;
    expect(items).toHaveLength(n);
    // The overflow cards fell through to the generic slot, so they carry no explicit size.
    expect(items[n - 1].w).toBeUndefined();
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
