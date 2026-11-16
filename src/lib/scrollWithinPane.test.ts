import { describe, it, expect } from "vitest";
import { scrollWithinPane } from "./scrollWithinPane";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

type Box = { top?: number; left?: number; w?: number; h?: number };
function def(el: HTMLElement, props: Record<string, number>) {
  for (const [k, v] of Object.entries(props)) Object.defineProperty(el, k, { configurable: true, value: v });
}
function rect(el: HTMLElement, b: Required<Box>) {
  el.getBoundingClientRect = () =>
    ({ top: b.top, left: b.left, width: b.w, height: b.h, bottom: b.top + b.h, right: b.left + b.w, x: b.left, y: b.top, toJSON() {} }) as DOMRect;
}
function el(parent: HTMLElement | null, style: Partial<CSSStyleDeclaration>, box: Box, p: Record<string, number> = {}) {
  const e = document.createElement("div");
  Object.assign(e.style, style);
  const b = { top: 0, left: 0, w: 100, h: 100, ...box };
  rect(e, b);
  def(e, { clientHeight: b.h, clientWidth: b.w, offsetHeight: b.h, offsetWidth: b.w, scrollHeight: b.h, scrollWidth: b.w, clientTop: 0, clientLeft: 0, ...p });
  (parent ?? document.body).appendChild(e);
  return e;
}

describe("scrollWithinPane", () => {
  // FIXTURE REACH. jsdom's getComputedStyle does not expand the `overflow` shorthand into
  // overflowX/overflowY, so a fixture that sets only the shorthand to hidden is not a hidden box to
  // the helper. The hidden-ancestor and card-boundary arms were written that way first, and they
  // stayed green with the helper scrolling hidden boxes and climbing past the card. Every fixture
  // sets longhands, and this arm fails if the shorthand is ever trusted again.
  it("reach: a fixture's overflow is what the helper reads", () => {
    const longhand = el(null, { overflowX: "hidden", overflowY: "hidden" }, {});
    expect([getComputedStyle(longhand).overflowX, getComputedStyle(longhand).overflowY]).toEqual(["hidden", "hidden"]);
    const src = readFileSync(fileURLToPath(import.meta.url), "utf8");
    // Built from parts, so that this line does not match itself.
    const shorthand = new RegExp(["\\{ ", "overflow", ': "'].join(""), "g");
    expect(src.match(shorthand)).toBeNull();
  });
  it("nearest, row below: scrolls only the pane, by the overshoot; hidden and outer auto ancestors stay 0", () => {
    const outerAuto = el(null, { overflowY: "auto" }, { h: 100 }, { scrollHeight: 900 });
    const hidden = el(outerAuto, { overflowX: "hidden", overflowY: "hidden" }, { h: 100 }, { scrollHeight: 900 });
    const pane = el(hidden, { overflowY: "auto" }, { top: 0, h: 100 }, { scrollHeight: 500 });
    const row = el(pane, {}, { top: 130, h: 20 });
    scrollWithinPane(row);
    expect(pane.scrollTop).toBe(50);
    expect(hidden.scrollTop).toBe(0);
    expect(outerAuto.scrollTop).toBe(0);
  });
  it("nearest, row above: negative delta", () => {
    const pane = el(null, { overflowY: "auto" }, { top: 100, h: 100 }, { scrollHeight: 500 });
    pane.scrollTop = 80;
    const row = el(pane, {}, { top: 70, h: 20 });
    scrollWithinPane(row);
    expect(pane.scrollTop).toBe(50);
  });
  it("row already inside: unchanged", () => {
    const pane = el(null, { overflowY: "auto" }, { top: 0, h: 100 }, { scrollHeight: 500 });
    pane.scrollTop = 7;
    scrollWithinPane(el(pane, {}, { top: 40, h: 20 }));
    expect(pane.scrollTop).toBe(7);
  });
  it("center", () => {
    const pane = el(null, { overflowY: "auto" }, { top: 0, h: 100 }, { scrollHeight: 500 });
    scrollWithinPane(el(pane, {}, { top: 200, h: 20 }), { block: "center" });
    expect(pane.scrollTop).toBe(160);
  });
  it("scale: pane rect twice its offsetHeight halves the delta", () => {
    const pane = el(null, { overflowY: "auto" }, { top: 0, h: 200 }, { scrollHeight: 500, offsetHeight: 100, clientHeight: 100 });
    scrollWithinPane(el(pane, {}, { top: 260, h: 40 }));
    // bottom 300 - pane bottom 200 = 100 screen px -> 50 layout px
    expect(pane.scrollTop).toBe(50);
  });
  it("only overflow:hidden ancestors (the stage case): nothing is written", () => {
    const a = el(null, { overflowX: "hidden", overflowY: "hidden" }, { h: 100, w: 100 }, { scrollHeight: 900, scrollWidth: 900 });
    const b = el(a, { overflowX: "hidden", overflowY: "hidden" }, { h: 100, w: 100 }, { scrollHeight: 900, scrollWidth: 900 });
    const row = el(b, {}, { top: 500, left: 500 });
    scrollWithinPane(row);
    for (const e of [a, b]) {
      expect(e.scrollTop).toBe(0);
      expect(e.scrollLeft).toBe(0);
    }
  });
  it("card boundary: a scroller above [data-stage-card] stays 0", () => {
    const above = el(null, { overflowX: "auto", overflowY: "auto" }, { h: 100, w: 100 }, { scrollHeight: 900, scrollWidth: 900 });
    const card = el(above, {}, { h: 100 });
    card.setAttribute("data-stage-card", "");
    const row = el(card, {}, { top: 500, left: 500 });
    scrollWithinPane(row);
    expect(above.scrollTop).toBe(0);
    expect(above.scrollLeft).toBe(0);
  });
  it("X axis, nearest, row right of pane", () => {
    const pane = el(null, { overflowX: "auto" }, { left: 0, w: 100 }, { scrollWidth: 500 });
    scrollWithinPane(el(pane, {}, { left: 150, w: 30 }));
    expect(pane.scrollLeft).toBe(80);
  });
  it("null el does not throw", () => {
    expect(() => scrollWithinPane(null)).not.toThrow();
    expect(() => scrollWithinPane(undefined)).not.toThrow();
  });
});
