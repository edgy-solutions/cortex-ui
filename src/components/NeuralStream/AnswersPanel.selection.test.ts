import { readFileSync } from "node:fs";
import path from "node:path";
/**
 * Text on this surface must be selectable, and dragging a row must not paint a selection
 * behind it. Both are true only if the suppression is scoped to the right MOMENT.
 *
 * The regression these guard: `preventDefault()` on the row's pointerdown, and `select-none`
 * gated on a drag being PENDING rather than under way. Both fire on a mere press — and most
 * presses are the start of a selection or a click, not a drag — so the whole answer list became
 * uncopyable. You could read a summary off the screen and not take it with you, on a surface
 * whose job is showing you numbers.
 *
 * A press and a drag are told apart by DISTANCE, not by intent declared up front. So the rule
 * is: leave selection alone until the pointer crosses the drag threshold, then clear whatever
 * had begun — once, on the transition.
 *
 * Source-level because the defect is a suppression that fires too EARLY, and jsdom has no
 * selection model to observe it with. A render test would pass while the browser refused to
 * highlight a single word.
 */
import { describe, it, expect } from "vitest";

const PANEL = readFileSync(path.join(__dirname, "AnswersPanel.tsx"), "utf8");
const STAGE = readFileSync(
  path.join(__dirname, "../AgenticCanvas/GlobalCanvasStage.tsx"),
  "utf8",
);

describe("selection survives a press and stops only at a real drag", () => {
  it("the sources are read — positive control", () => {
    expect(PANEL).toContain("export function AnswersPanel");
    expect(STAGE).toContain("export function GlobalCanvasStage");
  });

  it("the row pointerdown does NOT preventDefault", () => {
    // The original defect. A pointerdown is a press, not a drag; killing the default there
    // kills selection initiation for every click on the list.
    const down = PANEL.slice(
      PANEL.indexOf("const onRowPointerDown"),
      PANEL.indexOf("useEffect(() => {", PANEL.indexOf("const onRowPointerDown")),
    );
    expect(down.length).toBeGreaterThan(100); // positive control on the slice
    expect(down).not.toContain("e.preventDefault()");
  });

  it("the row pointerdown does not clear the selection either", () => {
    // Same reasoning: clearing on press destroys a selection the user just made by clicking
    // into the list, before anyone knows whether a drag is coming.
    const down = PANEL.slice(
      PANEL.indexOf("const onRowPointerDown"),
      PANEL.indexOf("useEffect(() => {", PANEL.indexOf("const onRowPointerDown")),
    );
    expect(down).not.toContain("removeAllRanges");
  });

  it("clears the selection exactly ONCE, on the press-becomes-drag transition", () => {
    // Not on every move — that would fight a selection the user is legitimately making
    // elsewhere while a stale drag state lingers.
    expect(PANEL).toMatch(/if \(moved && !d\.moved\) window\.getSelection\(\)\?\.removeAllRanges\(\)/);
  });

  it("the list suppresses selection only while a drag is UNDER WAY", () => {
    // Gating on `drag` alone re-creates the bug: the state is set on press.
    expect(PANEL).toMatch(/drag\?\.moved \? "select-none"/);
    expect(PANEL).not.toMatch(/\bdrag \? "select-none"/);
  });

  it("the canvas suppresses selection only while a LASSO is being dragged", () => {
    // A blanket `select-none` made every card on the canvas uncopyable.
    expect(STAGE).toMatch(/marquee \? "select-none"/);
    expect(STAGE).not.toMatch(/overflow-hidden select-none/);
  });
});
