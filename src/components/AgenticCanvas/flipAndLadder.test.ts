/**
 * THE CARD TURNS OVER, AND THE ZOOM COMES OUT THE WAY IT WENT IN.
 *
 * Two changes with one thing in common: both are about a reader being able to get back to
 * where they were. The map used to REPLACE the answer, which reads as a different card; and an
 * expanded card could only be left by going all the way out to the overview, so "let me check
 * how it decided that" cost you the card you were reading.
 *
 * Source-level, because both subjects are structure and stacking that jsdom does not compute:
 * it lays out nothing, honours no `backface-visibility`, and resolves no `z-index`. A rendered
 * assertion here would pass on a card that visibly does not turn.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

const read = (p: string) => readFileSync(path.join(__dirname, p), "utf8");
const CARD = read("StageCard.tsx");
const STAGE = read("GlobalCanvasStage.tsx");
const CSS = readFileSync(path.join(__dirname, "../../index.css"), "utf8");
const LAYOUT = read("../Layout.tsx");

/** Comments describe the defect in its own words, so a prose mention reads as the code. */
const stripComments = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
const STAGE_CODE = stripComments(STAGE);

describe("the flip has depth, which depends on where the clipping lives", () => {
  it("the rotating element does NOT clip, or the browser flattens the turn", () => {
    // The one that half-works if missed: `transform-style: preserve-3d` with any `overflow`
    // other than `visible` has its 3D context flattened, so the card swaps faces instantly
    // with no rotation. It looks like a bug in the animation rather than in the overflow.
    const holder = CSS.slice(CSS.indexOf(".flip-face-holder {"));
    expect(holder).toContain("transform-style: preserve-3d");
    expect(holder.slice(0, holder.indexOf("}"))).not.toMatch(/overflow/);
    // And the clipping is on the parent instead, which is where it has to be.
    expect(CARD).toContain('className="flex-1 min-h-0 overflow-hidden relative"');
    expect(CARD).toMatch(/style=\{\{ perspective: \d+ \}\}/);
  });

  it("faces are hidden by BACKFACE, never by display", () => {
    // `FitBox` measures with a ResizeObserver. A face removed from layout measures zero and
    // renders its content at scale 0 the first time it is shown — the map would arrive
    // invisible and stay that way until something else forced a re-measure.
    // ANCHORED AT THE PROPERTY BOUNDARY. Written as `[^}]*backface-visibility: hidden` this
    // passed with the unprefixed property set to `visible`, because the prefixed line CONTAINS
    // that substring — the assertion was reading the vendor prefix and reporting on the
    // standard property. Found by mutation, which is the only way it would have been.
    expect(CSS).toMatch(/\n\s+backface-visibility: hidden;/);
    expect(CSS).toMatch(/\n\s+-webkit-backface-visibility: hidden;/);
    expect(CSS).not.toMatch(/\.flip-face\[data-face="back"\] \{[^}]*display:\s*none/);
  });

  it("the back is pre-rotated, so it faces away until the holder turns", () => {
    expect(CSS).toMatch(/\.flip-face\[data-face="back"\] \{\s*transform: rotateY\(180deg\)/);
    expect(CSS).toMatch(/\.flip-face-holder\[data-flipped\] \{\s*transform: rotateY\(180deg\)/);
  });

  it("reduced motion drops the animation and keeps the information", () => {
    // The faces still swap. What goes away is half a second of rotation.
    const rm = CSS.slice(CSS.indexOf("@media (prefers-reduced-motion: reduce)"));
    expect(rm).toContain("transition: none");
  });
});

describe("the back face costs nothing until it is asked for", () => {
  it("DecisionMap is not mounted until the card has been flipped once", () => {
    // It takes no props: it reads the CURRENT artifact and fires a `fetchDecisionSubgraph` on
    // mount. Mounting it eagerly on every card would be one request per card AND every back
    // would show the same map — right only for the focused card, the case that already worked.
    expect(CARD).toContain("const backMounted = everFlipped.current;");
    expect(CARD).toMatch(/\{backMounted \? \(/);
    // The map appears exactly once, on the back, and nowhere else in the card.
    expect(CARD.match(/<DecisionMap \/>/g)).toHaveLength(1);
  });

  it("and once mounted it stays, so a second flip is a transform and not a fetch", () => {
    expect(CARD).toContain("if (showMap) everFlipped.current = true;");
  });

  it("a first flip lands on a skeleton rather than on blank", () => {
    // The turn finishes before the request returns. An empty back reads as broken.
    expect(CARD).toMatch(/reading the decision/);
  });
});

describe("the zoom comes out one rung at a time", () => {
  it("Esc from an expanded card returns to THE CARD, not to the overview", () => {
    // It called `clearFocus()` AND `clearGroup()` — three rungs in one press, landing at the
    // overview with the card you were reading nowhere in particular.
    // Read from the COMMENT-STRIPPED source: the comment in that branch names the old
    // behaviour in its own words, and a prose mention of `clearFocus()` is not a call to it.
    const esc = STAGE_CODE.slice(STAGE_CODE.indexOf('if (e.key !== "Escape") return;'));
    const inFullPane = esc.slice(esc.indexOf("if (fullPane) {"), esc.indexOf("if (focusId) {"));
    expect(inFullPane.length, "positive control: the branch was located").toBeGreaterThan(20);
    expect(inFullPane).toContain("closeFullPane()");
    expect(inFullPane).not.toContain("clearFocus()");
    expect(inFullPane).not.toContain("clearGroup()");
  });

  it("there is a CONTROL for it and not only a key", () => {
    // `closeFullPane` existed in the store and nothing had ever called it. The rung was built
    // and never hung, so the only exit was the one that left the canvas.
    expect(STAGE).toContain("onClick={closeFullPane}");
    expect(STAGE).toMatch(/Back to card/);
    // And the way out is still there, next to it.
    expect(STAGE).toMatch(/onClick=\{clearFocus\}/);
  });

  it("the store's rung is reachable from the stage", () => {
    expect(STAGE).toContain("const closeFullPane = useStageStore((s) => s.closeFullPane);");
  });
});

describe("two controls do not share one corner", () => {
  it("the shell's full-screen toggle owns the top-right of the canvas", () => {
    // It is permanent chrome, drawn unconditionally on the canvas itself.
    expect(LAYOUT).toMatch(/absolute top-2 right-2 z-20/);
  });

  it("so NO contextual exit is left in that corner — the rule, not the one that was reported", () => {
    // Both were `z-20` in the same corner: two buttons overlapping, both readable, neither
    // reliably clickable. Three occupants turned up once the assertion was written as an
    // absence rather than as a check of the button in the screenshot — the group-focus exit
    // has the identical collision in a state nobody had photographed.
    expect(STAGE_CODE).not.toMatch(/absolute top-3 right-3 z-20/);
    // Positive control: they moved rather than vanished.
    expect(STAGE_CODE.match(/absolute top-3 right-32 z-20/g)).toHaveLength(2);
  });

  it("the full-pane exits are ABOVE the shell button, so that corner is theirs", () => {
    // The full-pane overlay covers the canvas at `z-30`, so its own controls at `z-40` are the
    // only things in that corner — no offset needed, and none applied.
    const pane = STAGE_CODE.slice(STAGE_CODE.indexOf("{fullPane && ("));
    expect(pane).toMatch(/absolute top-3 right-3 z-40/);
  });
});
