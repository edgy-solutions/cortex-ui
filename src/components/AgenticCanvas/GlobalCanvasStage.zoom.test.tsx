/**
 * The mounted stage: zoom controls, the scrolling board, and every client→world conversion adding the scroll offset.
 * Mounted the way GlobalCanvasStage.focusAlone.test.tsx mounts it; jsdom has no layout, so clientWidth/Height are
 * stubbed to a 1200x700 pane and the scroller's scrollLeft/Top are backed by plain variables.
 */
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, cleanup, act, fireEvent, createEvent } from "@testing-library/react";
import { readFileSync } from "node:fs";
import path from "node:path";
import type { Artifact } from "@/api/types";

vi.mock("@/components/elicitation/AskedSection", () => ({ AskedSection: () => null }));
vi.mock("./AnswerBody", () => ({ AnswerBody: () => <div data-testid="answer-body" /> }));
vi.mock("./CanvasPane", () => ({ CanvasPane: () => null }));
vi.mock("./DockBar", () => ({ DockBar: () => null }));
vi.mock("./PlanningChrome", () => ({ PlanningChrome: () => null }));
vi.mock("./CanvasExportButton", () => ({ CanvasExportButton: () => null }));
vi.mock("@/lib/useCanExportSelection", () => ({ useCanExportSelection: () => true }));
vi.mock("@/api/client", async (orig) => ({
  ...(await orig<object>()),
  fetchLineageEdges: vi.fn().mockResolvedValue([]),
  fetchCanvases: vi.fn().mockResolvedValue([]),
  saveCanvases: vi.fn().mockResolvedValue(undefined),
}));

import { GlobalCanvasStage } from "./GlobalCanvasStage";
import { useCanvasStore } from "@/store/useCanvasStore";
import { useStageStore } from "@/store/useStageStore";
import { useAnswerPanelStore } from "@/store/useAnswerPanelStore";
import { STAGE_CARD, STAGE_MAX_USER_SCALE, STAGE_MIN_SCALE, STAGE_ZOOM_STEP } from "@/lib/stageConstants";

const PANE = { w: 1200, h: 700 };

beforeEach(() => {
  Object.defineProperty(HTMLElement.prototype, "clientWidth", { configurable: true, get: () => PANE.w });
  Object.defineProperty(HTMLElement.prototype, "clientHeight", { configurable: true, get: () => PANE.h });
  vi.stubGlobal(
    "ResizeObserver",
    class {
      cb: () => void;
      constructor(cb: () => void) {
        this.cb = cb;
      }
      observe() {
        this.cb();
      }
      disconnect() {}
      unobserve() {}
    },
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  useCanvasStore.setState({ artifacts: [], currentArtifactId: null });
  useStageStore.setState({ focusId: null, fullPane: false, view: "global", groupKey: null, canvases: [] } as never);
  useAnswerPanelStore.setState({ sortMode: "TIME" });
});

const art = (id: string, i: number): Artifact =>
  ({
    id,
    status: "complete",
    created_at: 1_700_000_000_000 - i * 3_600_000,
    watermark: 0,
    question_text: id,
    summary: id,
    rendered_output: { archetype: "MULTI_SERIES", components: [{ archetype: "MULTI_SERIES", rows: [] }] },
    routing: { about: { instance_resolved: false, label: "Program" } },
  }) as unknown as Artifact;

const IDS = ["a1", "a2", "a3"];
/** A canvas holding the ids at the given world points. */
function board(id: string, pts: [number, number][]) {
  return { id, name: id, items: pts.map(([x, y], i) => ({ id: IDS[i]!, x, y })) };
}
function seed(canvases: ReturnType<typeof board>[], view: string) {
  useCanvasStore.setState({ artifacts: IDS.map(art), currentArtifactId: null });
  useStageStore.setState({ canvases, view, focusId: null, fullPane: false, groupKey: null } as never);
}
const SMALL: [number, number][] = [[0, 0], [700, 300], [200, 500]];
const HUGE: [number, number][] = [[0, 0], [30000, 10000], [200, 500]];

const worldEl = () => document.querySelector<HTMLElement>("[data-stage-world]")!;
const scroller = () => document.querySelector<HTMLElement>("[data-stage-scroll]")!;
const spacer = () => document.querySelector<HTMLElement>("[data-stage-spacer]")!;
const camOf = () => {
  const m = /translate\(([-\d.e]+)px, ([-\d.e]+)px\) scale\(([-\d.e]+)\)/.exec(worldEl().style.transform)!;
  return { tx: +m[1]!, ty: +m[2]!, s: +m[3]! };
};
const btn = (label: string) => document.querySelector<HTMLButtonElement>(`[aria-label="${label}"]`);
const click = (label: string) => act(() => void fireEvent.click(btn(label)!));
/** Back scrollLeft/Top with variables so the stage's reads and writes are observable. */
function stubScroll(x = 0, y = 0) {
  const st = { x, y };
  const el = scroller();
  Object.defineProperty(el, "scrollLeft", { configurable: true, get: () => st.x, set: (v: number) => void (st.x = v) });
  Object.defineProperty(el, "scrollTop", { configurable: true, get: () => st.y, set: (v: number) => void (st.y = v) });
  return st;
}

describe("Z2: the group camera's floor is the named constant", () => {
  it("no 0.15 literal is left in GlobalCanvasStage", () => {
    const src = readFileSync(path.join(__dirname, "GlobalCanvasStage.tsx"), "utf8");
    expect(src.length).toBeGreaterThan(1000);
    expect(src).toContain("STAGE_MIN_SCALE");
    const code = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
    expect(/(?<![\w.])0?\.15\b/.test(code)).toBe(false);
  });
});

describe("Z3: zoom controls", () => {
  it("zoom in x n = fit * step^n, capped at the ceiling; In disabled at max, Out disabled at the fit; Fit resets", () => {
    seed([board("c1", SMALL)], "c1");
    render(<GlobalCanvasStage />);
    const fit = camOf().s;
    expect(fit).toBeGreaterThan(STAGE_MIN_SCALE);
    expect(btn("Zoom out")!.disabled).toBe(true);
    expect(btn("Zoom in")!.disabled).toBe(false);
    for (let n = 1; n <= 8; n++) {
      if (!btn("Zoom in")!.disabled) click("Zoom in");
      expect(camOf().s).toBeCloseTo(Math.min(fit * STAGE_ZOOM_STEP ** n, STAGE_MAX_USER_SCALE), 6);
    }
    expect(camOf().s).toBeCloseTo(STAGE_MAX_USER_SCALE, 6);
    expect(btn("Zoom in")!.disabled).toBe(true);
    expect(btn("Zoom out")!.disabled).toBe(false);
    click("Zoom out");
    expect(camOf().s).toBeCloseTo(STAGE_MAX_USER_SCALE / STAGE_ZOOM_STEP, 6);
    click("Fit");
    expect(camOf().s).toBeCloseTo(fit, 9);
    expect(btn("Zoom out")!.disabled).toBe(true);
  });
});

describe("Z4: controls belong to the overview and custom canvases only", () => {
  it("absent while a card or a group is focused; back after", () => {
    seed([board("c1", SMALL)], "c1");
    render(<GlobalCanvasStage />);
    expect(btn("Zoom in")).not.toBeNull();
    act(() => useStageStore.getState().focus("a1"));
    expect(btn("Zoom in")).toBeNull();
    act(() => useStageStore.getState().clearFocus());
    expect(btn("Zoom in")).not.toBeNull();
    act(() => useStageStore.getState().setView("global"));
    act(() => useStageStore.getState().setGroup("time-x"));
    expect(btn("Zoom in")).toBeNull();
  });
  it("the user zoom resets on a canvas switch", () => {
    seed([board("c1", SMALL), board("c2", SMALL)], "c1");
    render(<GlobalCanvasStage />);
    const fit = camOf().s;
    click("Zoom in");
    expect(camOf().s).toBeGreaterThan(fit);
    act(() => useStageStore.getState().setView("c2"));
    expect(camOf().s).toBeCloseTo(fit, 9);
    expect(btn("Zoom out")!.disabled).toBe(true);
  });
});

describe("Z5: the pane scrolls only when the board overflows", () => {
  it("a huge board: floor scale, scrollable, spacer larger than the pane, origin at the margin", () => {
    seed([board("c1", HUGE)], "c1");
    render(<GlobalCanvasStage />);
    const cam = camOf();
    expect(cam.s).toBe(STAGE_MIN_SCALE);
    expect(cam.tx).toBeGreaterThanOrEqual(0);
    expect(cam.ty).toBeGreaterThanOrEqual(0);
    expect(scroller().style.overflowX).toBe("auto");
    expect(scroller().style.overflowY).toBe("auto");
    expect(parseFloat(spacer().style.width)).toBeGreaterThan(PANE.w);
    expect(parseFloat(spacer().style.height)).toBeGreaterThan(PANE.h);
  });
  it("a fitting board: nothing scrolls, spacer is the pane", () => {
    seed([board("c1", SMALL)], "c1");
    render(<GlobalCanvasStage />);
    expect(scroller().style.overflowX).toBe("hidden");
    expect(scroller().style.overflowY).toBe("hidden");
    expect(parseFloat(spacer().style.width)).toBe(PANE.w);
    expect(parseFloat(spacer().style.height)).toBe(PANE.h);
  });
});

describe("Z6: every client→world conversion adds the scroll offset", () => {
  it("drop (custom canvas): the dropped card lands at the world point under the cursor, scroll included", () => {
    seed([board("c1", HUGE)], "c1");
    const addItemAt = vi.fn();
    useStageStore.setState({ addItemAt } as never);
    const { container } = render(<GlobalCanvasStage />);
    stubScroll(300, 200);
    const cam = camOf();
    // jsdom has no DragEvent, so the pointer position is put on the event by hand.
    const ev = createEvent.drop(container.firstElementChild!, { dataTransfer: { getData: () => "a1,a2" } });
    Object.defineProperty(ev, "clientX", { value: 500 });
    Object.defineProperty(ev, "clientY", { value: 400 });
    fireEvent(container.firstElementChild!, ev);
    expect(addItemAt).toHaveBeenCalledTimes(2);
    const [, id, x, y] = addItemAt.mock.calls[0]!;
    expect(id).toBe("a1");
    expect(x).toBeCloseTo((500 + 300 - cam.tx) / cam.s - STAGE_CARD.w / 2, 6);
    expect(y).toBeCloseTo((400 + 200 - cam.ty) / cam.s - STAGE_CARD.h / 2, 6);
  });

  it("lasso (global): the marquee meets the card where it is DRAWN, scroll included; and L7 from the lasso", () => {
    seed([], "global");
    render(<GlobalCanvasStage />);
    const card = document.querySelector<HTMLElement>("[data-stage-card]")!;
    const cam = camOf();
    const cx = parseFloat(card.style.left) || 0;
    const cy = parseFloat(card.style.top) || 0;
    const SCROLL = { x: 150, y: 90 };
    stubScroll(SCROLL.x, SCROLL.y);
    const px = (cx + STAGE_CARD.w / 2) * cam.s + cam.tx - SCROLL.x;
    const py = (cy + STAGE_CARD.h / 2) * cam.s + cam.ty - SCROLL.y;
    const stage = scroller().parentElement!;
    fireEvent.pointerDown(stage, { button: 0, clientX: px - 8, clientY: py - 8 });
    fireEvent.pointerMove(document, { clientX: px + 8, clientY: py + 8 });
    fireEvent.pointerUp(document, { clientX: px + 8, clientY: py + 8 });
    expect(stage.textContent).toContain("1 selected");
    fireEvent.click(stage.querySelector("[data-export-as]")!);
    const dlg = document.querySelector("[data-export-dialog]");
    expect(dlg).not.toBeNull();
    expect(dlg!.parentElement).toBe(document.body);
  });

  it("L9: the lasso's Add to canvas runs the shared hook — each selected id, then clears", () => {
    seed([board("c1", SMALL)], "global");
    const addItemAuto = vi.fn();
    useStageStore.setState({ addItemAuto } as never);
    render(<GlobalCanvasStage />);
    const stage = scroller().parentElement!;
    const cam = camOf();
    // A marquee over the whole pane selects every card.
    fireEvent.pointerDown(stage, { button: 0, clientX: 0, clientY: 0 });
    fireEvent.pointerMove(document, { clientX: PANE.w, clientY: PANE.h });
    fireEvent.pointerUp(document, { clientX: PANE.w, clientY: PANE.h });
    expect(cam.s).toBeGreaterThan(0);
    expect(stage.textContent).toContain("3 selected");
    fireEvent.click(Array.from(stage.querySelectorAll("button")).find((b) => b.textContent === "c1")!);
    expect(addItemAuto.mock.calls.map((c) => c[1]).sort()).toEqual(["a1", "a2", "a3"]);
    expect(stage.textContent).not.toContain("selected");
  });

  it("culling: the visible world rectangle moves with the scroll (the far card mounts only when scrolled to)", () => {
    seed([board("c1", HUGE)], "c1");
    render(<GlobalCanvasStage />);
    const mounted = () => document.querySelectorAll("[data-stage-card]").length;
    const before = mounted();
    const st = stubScroll(0, 0);
    st.x = 30000 * STAGE_MIN_SCALE;
    st.y = 10000 * STAGE_MIN_SCALE;
    act(() => void fireEvent.scroll(scroller()));
    expect(mounted()).not.toBe(before);
  });
});

describe("Z7: zoom keeps the pane-centre world point centred", () => {
  it("within a pixel, through a zoom in", () => {
    seed([board("c1", HUGE)], "c1");
    render(<GlobalCanvasStage />);
    const st = stubScroll(700, 400);
    const before = camOf();
    const wc = { x: (st.x + PANE.w / 2 - before.tx) / before.s, y: (st.y + PANE.h / 2 - before.ty) / before.s };
    click("Zoom in");
    const after = camOf();
    expect(after.s).toBeGreaterThan(before.s);
    expect(Math.abs(wc.x * after.s + after.tx - st.x - PANE.w / 2)).toBeLessThan(1);
    expect(Math.abs(wc.y * after.s + after.ty - st.y - PANE.h / 2)).toBeLessThan(1);
  });
});
