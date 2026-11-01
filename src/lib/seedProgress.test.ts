import { describe, it, expect } from "vitest";
import {
  PROPOSED_SEED_PROGRESS_FIXTURE,
  PROPOSED_SEED_PROGRESS_PARTIAL,
  foldSeedPanel,
  readSeedPanelEvent,
  seedDone,
} from "./seedProgress";

const ok = { panel_index: 0, total: 6, outcome: "artifact" };

describe("readSeedPanelEvent", () => {
  it("accepts every fixture event", () => {
    for (const e of [...PROPOSED_SEED_PROGRESS_FIXTURE, ...PROPOSED_SEED_PROGRESS_PARTIAL]) {
      expect(readSeedPanelEvent(e)).toEqual(e);
    }
  });
  it.each([
    ["negative index", { ...ok, panel_index: -1 }],
    ["index == total", { ...ok, panel_index: 6 }],
    ["fractional index", { ...ok, panel_index: 1.5 }],
    ["zero total", { ...ok, total: 0 }],
    ["unknown outcome", { ...ok, outcome: "ok" }],
    ["a string", "nope"],
    ["null", null],
  ])("refuses %s", (_n, v) => {
    expect(readSeedPanelEvent(v)).toBeNull();
  });
});

describe("foldSeedPanel", () => {
  it("does not double count a repeated index", () => {
    const e = PROPOSED_SEED_PROGRESS_FIXTURE[0];
    const once = foldSeedPanel(null, e);
    const twice = foldSeedPanel(once, e);
    expect(seedDone(twice)).toBe(1);
  });
  it("a repeat with a DIFFERENT outcome keeps the first word", () => {
    const first = foldSeedPanel(null, { panel_index: 0, total: 6, outcome: "artifact" });
    const again = foldSeedPanel(first, { panel_index: 0, total: 6, outcome: "refused" });
    expect(again.panels[0]).toBe("seeded");
    expect(seedDone(again)).toBe(1);
  });
  it("records refused panels and takes total from the event", () => {
    const p = PROPOSED_SEED_PROGRESS_PARTIAL.reduce(foldSeedPanel, null as never);
    expect(p.total).toBe(6);
    expect(p.panels[2]).toBe("refused");
    expect(seedDone(p)).toBe(6);
  });
});
