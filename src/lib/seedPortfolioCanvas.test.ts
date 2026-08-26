/**
 * The client half of "make me a portfolio canvas" is a COMPOSITION, and these tests exist to
 * keep it one.
 *
 * The failure this guards is not a crash — it is the call site slowly acquiring placement
 * logic. The moment it sorts, filters or positions, a seeded canvas stops being the same
 * object a user builds by hand, and "built the way a user would build it" becomes a claim
 * instead of a fact.
 *
 * The other half is refusal: a failed or empty seed must leave NO canvas behind. An empty
 * named board in the rail is litter the user did not ask for, and it asserts that a seeding
 * ran and legitimately produced nothing — a different claim from "the seeding failed".
 */
import { describe, it, expect, beforeEach, vi } from "vitest";

const requestPortfolioCanvasSeed = vi.fn();
vi.mock("@/api/client", () => ({
  requestPortfolioCanvasSeed: () => requestPortfolioCanvasSeed(),
}));

import { seedPortfolioCanvasFromServer } from "./seedPortfolioCanvas";
import { useStageStore } from "@/store/useStageStore";
import { PORTFOLIO_PLANNING_TEMPLATE } from "./stageConstants";

beforeEach(() => {
  requestPortfolioCanvasSeed.mockReset();
  useStageStore.setState({ canvases: [], view: "global" } as never);
});

const canvases = () => useStageStore.getState().canvases;

describe("seedPortfolioCanvasFromServer", () => {
  it("creates a TYPED canvas and lays the ids out in the template", async () => {
    const ids = ["gantt", "cost", "load", "gap", "diff"];
    requestPortfolioCanvasSeed.mockResolvedValue(ids);

    const id = await seedPortfolioCanvasFromServer("Q3 Review");

    expect(id).toBeTruthy();
    const c = canvases().find((x) => x.id === id)!;
    expect(c.use).toBe("portfolio_planning");
    expect(c.name).toBe("Q3 Review");
    expect(c.items.map((i) => i.id)).toEqual(ids);
    // The anchor slot came from the template, not from anything computed here.
    expect({ ...c.items[0] }).toEqual({ id: "gantt", ...PORTFOLIO_PLANNING_TEMPLATE[0] });
  });

  it("preserves the SERVER's order — it does not sort or reorder", async () => {
    // Which measure lands in the anchor is the seeding intent's declaration. Reordering here
    // moves that decision into the client, and the two then drift silently.
    requestPortfolioCanvasSeed.mockResolvedValue(["z-last", "a-first", "m-middle"]);

    const id = await seedPortfolioCanvasFromServer();

    expect(canvases().find((x) => x.id === id)!.items.map((i) => i.id)).toEqual([
      "z-last",
      "a-first",
      "m-middle",
    ]);
  });

  it("creates NO canvas when the seed FAILS", async () => {
    requestPortfolioCanvasSeed.mockRejectedValue(new Error("network"));

    expect(await seedPortfolioCanvasFromServer()).toBeNull();
    expect(canvases()).toEqual([]);
  });

  it("creates NO canvas when the seed returns NOTHING", async () => {
    // Distinct from failure, and both leave the rail alone. An empty named board would be a
    // husk the user has to clean up.
    requestPortfolioCanvasSeed.mockResolvedValue([]);

    expect(await seedPortfolioCanvasFromServer()).toBeNull();
    expect(canvases()).toEqual([]);
  });

  it("drops a malformed id rather than seating an item that points at no artifact", async () => {
    // This crosses the wire. A non-string id becomes a slot-shaped hole on the canvas with
    // nothing explaining it — worse than a shorter board.
    requestPortfolioCanvasSeed.mockResolvedValue(["ok", null, 42, "", "also-ok"]);

    const id = await seedPortfolioCanvasFromServer();

    expect(canvases().find((x) => x.id === id)!.items.map((i) => i.id)).toEqual([
      "ok",
      "also-ok",
    ]);
  });

  it("computes NO placement of its own — the template applies through the ordinary add path", async () => {
    // A seeded canvas and a hand-built one must stay the same object. Built here and by hand,
    // then compared on everything except the identity fields.
    const ids = ["a", "b", "c"];
    requestPortfolioCanvasSeed.mockResolvedValue(ids);

    const seeded = await seedPortfolioCanvasFromServer("Seeded");
    const byHand = useStageStore.getState().createCanvas("ByHand", "portfolio_planning", false);
    for (const i of ids) useStageStore.getState().addItemAuto(byHand, i);

    const s = canvases().find((c) => c.id === seeded)!;
    const h = canvases().find((c) => c.id === byHand)!;
    expect(s.items).toEqual(h.items);
  });
});
