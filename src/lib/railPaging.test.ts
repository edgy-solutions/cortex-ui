import { describe, it, expect } from "vitest";
import { railCutoff, shownByCutoff, sourcesToLoad, type RailSource } from "./railPaging";

const answers = (more: boolean, frontier: number | null): RailSource => ({ name: "answers", more, frontier });
const drops = (more: boolean, frontier: number | null): RailSource => ({ name: "drops", more, frontier });

describe("railCutoff", () => {
  it("one source with more: its frontier is the cutoff", () => {
    expect(railCutoff([answers(true, 500), drops(false, 100)])).toBe(500);
    expect(railCutoff([answers(false, 500), drops(true, 100)])).toBe(100);
  });
  it("both with more: the newer frontier is the cutoff", () => {
    expect(railCutoff([answers(true, 500), drops(true, 900)])).toBe(900);
  });
  it("none with more: no cutoff, nothing to load", () => {
    const s = [answers(false, 500), drops(false, 900)];
    expect(railCutoff(s)).toBeNull();
    expect(sourcesToLoad(s)).toEqual([]);
  });
  it("an item exactly at the cutoff is shown; one older is hidden", () => {
    expect(shownByCutoff(900, 900)).toBe(true);
    expect(shownByCutoff(899, 900)).toBe(false);
    expect(shownByCutoff(1, null)).toBe(true);
  });
  it("a click loads every source whose frontier equals the cutoff, and only those", () => {
    expect(sourcesToLoad([answers(true, 500), drops(true, 900)])).toEqual(["drops"]);
    expect(sourcesToLoad([answers(true, 700), drops(true, 700)])).toEqual(["answers", "drops"]);
  });
});
