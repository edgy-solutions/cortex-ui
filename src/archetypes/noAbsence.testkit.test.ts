import { describe, it, expect } from "vitest";
import { flippingDataAttributes } from "./noAbsence.testkit";

function dom(html: string): Element {
  const host = document.createElement("div");
  host.innerHTML = html;
  return host.firstElementChild as Element;
}

describe("flippingDataAttributes", () => {
  it("all roots alike -> nothing flips", () => {
    const a = dom('<div data-a=""><p data-b="1"></p></div>');
    const b = dom('<div data-a=""><p data-b="2"></p></div>');
    expect(flippingDataAttributes([a, b])).toEqual([]);
  });

  it("one name present under one root and absent under another flips", () => {
    const a = dom('<div><p data-b=""></p></div>');
    const b = dom("<div><p></p></div>");
    const c = dom('<div><p data-b=""></p></div>');
    expect(flippingDataAttributes([a, b, c])).toEqual(["data-b"]);
  });

  it("an excluded name is dropped; the others still report, sorted", () => {
    const a = dom('<div data-z="" data-click=""></div>');
    const b = dom("<div></div>");
    expect(flippingDataAttributes([a, b], ["data-click"])).toEqual(["data-z"]);
    expect(flippingDataAttributes([a, b], ["data-click", "data-z"])).toEqual([]);
    expect(flippingDataAttributes([a, b])).toEqual(["data-click", "data-z"]);
  });

  it("an attribute on the root itself counts", () => {
    const a = dom('<section data-root=""><p></p></section>');
    const b = dom("<section><p></p></section>");
    expect(flippingDataAttributes([a, b])).toEqual(["data-root"]);
  });

  it("a non-data attribute never counts", () => {
    const a = dom('<div class="x" aria-label="y"></div>');
    const b = dom("<div></div>");
    expect(flippingDataAttributes([a, b])).toEqual([]);
  });
});
