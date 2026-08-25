import { readFileSync } from "node:fs";
import path from "node:path";
/**
 * Size is ARRANGEMENT (ADR-0042 §4: "position, size, pinned/unpinned, title — is owned by
 * the UI and persists through ADR-0028's canvas persistence"). These pin the two properties
 * that make per-item dimensions safe to add to a field that did not have them:
 *
 *  1. ABSENT means DEFAULT, never zero. Every canvas authored before `w`/`h` existed has
 *     items without them, and they must render exactly as they did. A card that resolved to
 *     zero would not merely look wrong — it takes any ResponsiveContainer inside it down
 *     with it, which this repo has already watched happen (`width(-1) and height(-1)`).
 *  2. A stored dimension is honoured. Otherwise the field is decoration and the arrangement
 *     ruling is unimplemented while appearing implemented.
 */
import { describe, it, expect } from "vitest";
import { STAGE_CARD, cardSize } from "./stageConstants";
import { useStageStore } from "@/store/useStageStore";

describe("cardSize", () => {
  it("an item with NO dimensions gets the default — the pre-existing canvas must not move", () => {
    // The migration property. Items authored before this field existed carry neither key.
    expect(cardSize({ x: 10, y: 20 } as never)).toEqual(STAGE_CARD);
    expect(cardSize(undefined)).toEqual(STAGE_CARD);
    expect(cardSize(null)).toEqual(STAGE_CARD);
    expect(cardSize({})).toEqual(STAGE_CARD);
  });

  it("honours a stored dimension — otherwise the field is decoration", () => {
    expect(cardSize({ w: 760, h: 300 })).toEqual({ w: 760, h: 300 });
  });

  it("refuses a NON-POSITIVE dimension rather than passing it through to a measurer", () => {
    // Not defensive noise: a zero-size card renders a chart container that measures -1, and
    // Recharts answers that with a warning per chart and no chart. The default is a
    // recoverable wrong; a zero is not.
    for (const bad of [0, -1, NaN, Infinity as unknown as number]) {
      expect(cardSize({ w: bad, h: 300 }).w, String(bad)).toBe(STAGE_CARD.w);
      expect(cardSize({ w: 700, h: bad }).h, String(bad)).toBe(STAGE_CARD.h);
    }
    // A string that sneaks past the type (persisted JSON is not type-checked on the way in).
    expect(cardSize({ w: "700" as unknown as number, h: 300 }).w).toBe(STAGE_CARD.w);
  });

  it("mixes a stored dimension with a defaulted one — the axes are independent", () => {
    expect(cardSize({ w: 760 })).toEqual({ w: 760, h: STAGE_CARD.h });
    expect(cardSize({ h: 620 })).toEqual({ w: STAGE_CARD.w, h: 620 });
  });
});

describe("resizeItem — arrangement, persisted with the canvas", () => {
  const seed = () => {
    useStageStore.setState({
      canvases: [{ id: "c1", name: "Portfolio", items: [{ id: "a1", x: 0, y: 0 }] }],
    } as never);
  };

  it("stores a size on the item, leaving position alone", () => {
    seed();
    useStageStore.getState().resizeItem("c1", "a1", 760, 300);
    const it = useStageStore.getState().canvases[0].items[0];
    expect({ w: it.w, h: it.h }).toEqual({ w: 760, h: 300 });
    expect({ x: it.x, y: it.y }).toEqual({ x: 0, y: 0 });
  });

  it("REFUSES a non-positive size instead of storing it — a zero would persist and reload", () => {
    // The reason this guard lives in the store and not only in the reader: a bad value read
    // through `cardSize` is corrected every render, but a bad value WRITTEN is synced to
    // /me/canvases and comes back on every device. Refuse at the door.
    seed();
    useStageStore.getState().resizeItem("c1", "a1", 760, 300);
    useStageStore.getState().resizeItem("c1", "a1", 0, 300);
    useStageStore.getState().resizeItem("c1", "a1", 760, -5);
    const it = useStageStore.getState().canvases[0].items[0];
    expect({ w: it.w, h: it.h }).toEqual({ w: 760, h: 300 });
  });

  it("is a no-op for an unknown canvas or item — no row is invented", () => {
    seed();
    useStageStore.getState().resizeItem("nope", "a1", 760, 300);
    useStageStore.getState().resizeItem("c1", "nope", 760, 300);
    expect(useStageStore.getState().canvases[0].items).toHaveLength(1);
    expect(useStageStore.getState().canvases[0].items[0].w).toBeUndefined();
  });
});

describe("the size field is actually READ by the renderer", () => {
  // The lesson this repo learned twice: a helper's unit tests prove it works, only a wiring
  // guard proves it runs. A correct `cardSize` that nothing calls is the fixed card size we
  // started with. These are source-level because the defect would be an ABSENCE of a call.
  const stage = readFileSync(
    path.join(__dirname, "../components/AgenticCanvas/GlobalCanvasStage.tsx"),
    "utf8",
  );
  const card = readFileSync(
    path.join(__dirname, "../components/AgenticCanvas/StageCard.tsx"),
    "utf8",
  );

  it("the sources are being read — positive control", () => {
    expect(stage).toContain("export function GlobalCanvasStage");
    expect(card).toContain("export function StageCard");
  });

  it("the stage resolves each card's own footprint rather than the constant", () => {
    expect(stage).toContain("cardSize");
    // Entries carry a size, and the card is handed it.
    expect(stage).toMatch(/size:\s*cardSize\(it\)/);
    expect(stage).toContain("size={size}");
  });

  it("the card renders the size it is given, defaulting when it is not", () => {
    expect(card).toMatch(/width:\s*size\?\.w\s*\?\?\s*STAGE_CARD\.w/);
    expect(card).toMatch(/height:\s*size\?\.h\s*\?\?\s*STAGE_CARD\.h/);
  });
});
