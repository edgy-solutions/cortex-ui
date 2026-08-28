import { readFileSync } from "node:fs";
import path from "node:path";
/**
 * HTML5 drag and pointer events are two input systems on the same element, and the drag wins:
 * once a native drag starts, the browser STOPS firing pointermove and pointerup.
 *
 * That one fact produced every symptom of the broken resize corner, which is why the guards
 * below are about MUTUAL EXCLUSION rather than about resizing:
 *
 *   - grabbing the corner started a native drag, and the "pill" that moved was the card's
 *     custom drag image;
 *   - the card never resized, because pointermove had stopped firing;
 *   - pointerup never arrived either, so the document listeners stayed armed;
 *   - the next unrelated mouse movement hit those stale listeners and resized from the
 *     ORIGINAL pointerdown coordinates, which is why the anchor was nowhere near the corner;
 *   - ending that phantom resize meant clicking, which selected the card.
 *
 * These are source-level because the defect is a MISSING SUPPRESSION — an absence — and because
 * jsdom does not implement the native drag whose interaction is the whole subject. A render
 * test here would pass while the real browser did all of the above.
 */
import { describe, it, expect } from "vitest";

const CARD = readFileSync(path.join(__dirname, "StageCard.tsx"), "utf8");
const STAGE = readFileSync(path.join(__dirname, "GlobalCanvasStage.tsx"), "utf8");

describe("a pointer gesture and the native drag are mutually exclusive", () => {
  it("the sources are read — positive control", () => {
    expect(CARD).toContain("export function StageCard");
    expect(STAGE).toContain("export function GlobalCanvasStage");
  });

  it("the card is draggable ONLY in the global view", () => {
    // `draggable` exists for one gesture — drag a card onto a dock chip — and that is a
    // GLOBAL-view action. On a canvas the card is already placed and dragging it should MOVE
    // it, so the attribute is off there.
    //
    // This assertion previously pinned `draggable={!gesturing.current}`, which could never
    // work: `gesturing` is a REF, and mutating a ref does not re-render, so the rendered
    // attribute kept whatever value it had at the last render. The guard was pinning a
    // mechanism rather than a property, and it passed while the behaviour was wrong.
    expect(CARD).toMatch(/draggable=\{!custom\}/);
    expect(CARD).not.toMatch(/^\s+draggable$/m);
  });

  it("the drag lives on the HEADER, not on the card — the body must stay selectable", () => {
    // A draggable element cannot have its text selected. While the whole card carried the
    // attribute, no card body could be swept and copied in EITHER view. The header is the grab
    // area in both: in global it starts the chip-drag, on a canvas it moves the card.
    // Everything from the card element's opening tag up to the header — i.e. the attributes
    // that belong to the CARD itself.
    const cardOpen = CARD.slice(
      CARD.indexOf("data-stage-card"),
      CARD.indexOf("Header: subject identifier"),
    );
    expect(cardOpen.length).toBeGreaterThan(100); // positive control on the slice
    expect(cardOpen).not.toContain("onDragStart");
    expect(cardOpen).not.toMatch(/draggable=/);
  });

  it("the HEADER moves the card, so the BODY stays selectable", () => {
    // A draggable element cannot have its text selected. Moving from the header rather than
    // from the whole card is what lets a reader sweep a number off a card and copy it.
    expect(CARD).toContain("onPointerDown={custom ? beginGesture(onGripDown) : undefined}");
  });

  it("dragStart BAILS while a gesture is in flight", () => {
    // Belt-and-braces for browsers that begin the drag despite preventDefault on pointerdown.
    const start = CARD.slice(CARD.indexOf("onDragStart={(e) => {"));
    expect(start.slice(0, 200)).toMatch(/if \(gesturing\.current\)/);
    expect(start.slice(0, 200)).toContain("e.preventDefault()");
  });

  it("BOTH handles go through the same gesture starter", () => {
    // The move grip carried the identical latent bug. Fixing only the corner would leave the
    // grip one browser-behaviour change away from the same failure.
    expect(CARD).toContain("onPointerDown={beginGesture(onGripDown)}");
    expect(CARD).toContain("onPointerDown={beginGesture(onResizeDown)}");
  });

  it("the gesture starter prevents the drag and captures the pointer", () => {
    const fn = CARD.slice(CARD.indexOf("const beginGesture"), CARD.indexOf("const endGesture"));
    expect(fn.length).toBeGreaterThan(100); // positive control on the slice
    expect(fn).toContain("e.preventDefault()");
    expect(fn).toContain("setPointerCapture");
  });

  it("a gesture SWALLOWS the click that follows its pointerup", () => {
    // pointerup is followed by a click. Without this, finishing a resize selects the card —
    // the gesture reporting itself as a decision the user did not make.
    const onClick = CARD.slice(CARD.indexOf("onClick={(e) => {"));
    expect(onClick.slice(0, 600)).toMatch(/if \(gesturing\.current\)/);
  });
});

describe("a lost gesture cannot leave a listener armed", () => {
  it("both stage handlers clean up on pointercancel, not only pointerup", () => {
    // The stale-listener failure: a gesture whose pointerup never arrives leaves a document
    // pointermove handler live, and the next unrelated movement resumes the interaction from
    // coordinates the user has long since left.
    const cancels = STAGE.split('document.addEventListener("pointercancel", onUp)').length - 1;
    const ups = STAGE.split('document.addEventListener("pointerup", onUp)').length - 1;
    expect(ups).toBeGreaterThanOrEqual(3); // move + resize + lasso
    expect(cancels).toBe(ups);
  });

  it("removal covers every event that was added", () => {
    const removes = STAGE.split('document.removeEventListener("pointercancel", onUp)').length - 1;
    expect(removes).toBeGreaterThanOrEqual(3);
  });
});
