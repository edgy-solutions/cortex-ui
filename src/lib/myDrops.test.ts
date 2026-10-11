import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { readMyDrops, recordMyDrop, myDropsKey, MY_DROPS_CAP, type MyDrop } from "./myDrops";

const drop = (n: number, at = n): MyDrop => ({ ingestId: `ing-${n}`, filename: `f${n}.pdf`, droppedAt: at });

beforeEach(() => window.localStorage.clear());
afterEach(() => vi.restoreAllMocks());

describe("myDrops", () => {
  it("survives a reload: a fresh module instance over the same storage reads the same list", async () => {
    recordMyDrop("user-a", drop(1));
    recordMyDrop("user-a", drop(2));
    vi.resetModules();
    const fresh = await import("./myDrops");
    expect(fresh.readMyDrops("user-a").map((d) => d.ingestId)).toEqual(["ing-2", "ing-1"]);
  });

  it("user B does not see user A's list (separate keys)", () => {
    recordMyDrop("user-a", drop(1));
    expect(readMyDrops("user-b")).toEqual([]);
    recordMyDrop("user-b", drop(2));
    expect(readMyDrops("user-a").map((d) => d.ingestId)).toEqual(["ing-1"]);
    expect(readMyDrops("user-b").map((d) => d.ingestId)).toEqual(["ing-2"]);
    expect(myDropsKey("user-a")).not.toBe(myDropsKey("user-b"));
  });

  it("no authenticated user: nothing is written, [] is read", () => {
    recordMyDrop(null, drop(1));
    recordMyDrop(undefined, drop(1));
    recordMyDrop("", drop(1));
    expect(window.localStorage.length).toBe(0);
    expect(readMyDrops(null)).toEqual([]);
  });

  it("a storage that throws on read and write is tolerated: no throw, an empty list", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => { throw new Error("blocked"); });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("quota"); });
    expect(() => recordMyDrop("user-a", drop(1))).not.toThrow();
    expect(readMyDrops("user-a")).toEqual([]);
  });

  it("a corrupt value reads as an empty list; bad entries are skipped", () => {
    window.localStorage.setItem(myDropsKey("user-a"), "{not json");
    expect(readMyDrops("user-a")).toEqual([]);
    window.localStorage.setItem(myDropsKey("user-a"), JSON.stringify([{ nope: 1 }, drop(3)]));
    expect(readMyDrops("user-a").map((d) => d.ingestId)).toEqual(["ing-3"]);
  });

  it("dedupes by ingestId: a re-recorded id moves to the front, once", () => {
    recordMyDrop("user-a", drop(1));
    recordMyDrop("user-a", drop(2));
    recordMyDrop("user-a", drop(1, 99));
    const list = readMyDrops("user-a");
    expect(list.map((d) => d.ingestId)).toEqual(["ing-1", "ing-2"]);
    expect(list[0].droppedAt).toBe(99);
  });

  it(`caps at ${MY_DROPS_CAP}, newest first, dropping the oldest`, () => {
    for (let i = 1; i <= MY_DROPS_CAP + 5; i++) recordMyDrop("user-a", drop(i));
    const list = readMyDrops("user-a");
    expect(list).toHaveLength(MY_DROPS_CAP);
    expect(list[0].ingestId).toBe(`ing-${MY_DROPS_CAP + 5}`);
    expect(list[MY_DROPS_CAP - 1].ingestId).toBe("ing-6");
  });
});
