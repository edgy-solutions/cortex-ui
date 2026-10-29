/**
 * FitBox scales by WIDTH only; a block taller than the card scrolls (Chris, 10-29: "make the
 * content fit the entire card width and let it truncate with scroll if higher than the card").
 *
 * jsdom lays nothing out, so the box's width and height and the content's natural height are
 * stubbed on the prototype: the outer box reports BOX_W x BOX_H, the content reports its
 * `data-h`.
 */
import { describe, it, expect, afterEach, beforeAll, afterAll, vi } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { FitBox } from "./FitBox";

vi.stubGlobal("ResizeObserver", class { observe() {} disconnect() {} unobserve() {} });
afterEach(cleanup);

const BOX_W = 320;
const BOX_H = 280;
const props = ["clientWidth", "clientHeight", "scrollHeight"] as const;
const saved = new Map<string, PropertyDescriptor | undefined>();

beforeAll(() => {
  for (const p of props) saved.set(p, Object.getOwnPropertyDescriptor(HTMLElement.prototype, p));
  Object.defineProperty(HTMLElement.prototype, "clientWidth", {
    configurable: true,
    get(this: HTMLElement) { return this.hasAttribute("data-fitbox") ? BOX_W : 0; },
  });
  Object.defineProperty(HTMLElement.prototype, "clientHeight", {
    configurable: true,
    get(this: HTMLElement) { return this.hasAttribute("data-fitbox") ? BOX_H : 0; },
  });
  Object.defineProperty(HTMLElement.prototype, "scrollHeight", {
    configurable: true,
    get(this: HTMLElement) {
      const h = this.querySelector("[data-h]")?.getAttribute("data-h");
      return h ? Number(h) : 0;
    },
  });
});
afterAll(() => {
  for (const p of props) {
    const d = saved.get(p);
    if (d) Object.defineProperty(HTMLElement.prototype, p, d);
    else delete (HTMLElement.prototype as unknown as Record<string, unknown>)[p];
  }
});

const mount = (h: number, naturalWidth = 640) => {
  const { container } = render(
    <FitBox naturalWidth={naturalWidth}>
      <div data-h={h} />
    </FitBox>,
  );
  const outer = container.querySelector("[data-fitbox]") as HTMLElement;
  const sizer = container.querySelector("[data-fitbox-sizer]") as HTMLElement;
  return { outer, sizer, scale: Number(outer.getAttribute("data-fitbox-scale")) };
};

describe("FitBox — width fits, height scrolls", () => {
  it("a block far taller than the card is scaled by WIDTH, not shrunk by height", () => {
    // 640 wide, 4000 tall, in 320x280: width ratio 0.5; the old height ratio would be 0.07.
    const { scale } = mount(4000);
    expect(scale).toBe(0.5);
  });

  it("the scroll area is the SCALED height, so the scrollbar ends where the content does", () => {
    const { sizer } = mount(4000);
    expect(sizer.style.width).toBe("320px");
    expect(sizer.style.height).toBe("2000px");
  });

  it("the card scrolls vertically and never horizontally", () => {
    const { outer } = mount(4000);
    expect(outer.className).toMatch(/\boverflow-y-auto\b/);
    expect(outer.className).toMatch(/\boverflow-x-hidden\b/);
  });

  it("a short block gets the same width scale, so short and tall cards read alike", () => {
    expect(mount(200).scale).toBe(0.5);
  });

  it("never upscales past 1", () => {
    expect(mount(200, 160).scale).toBe(1);
  });
});
