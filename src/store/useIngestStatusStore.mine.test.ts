/**
 * `loadMine` follows `GET /ingest/mine`'s keyset pages (191): each page's `next` goes back verbatim as
 * `before`, the first page draws before the next one answers, and the walk stops on `next: null`, on a
 * cursor handed back twice, at `INGEST_MINE_MAX_PAGES`, on a purge, or on a later page's failure —
 * which keeps what was read. Only the FIRST page's failure is `failed`.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const fetchIngestMine = vi.fn();
vi.mock("@/lib/ingestTransport", () => ({
  fetchIngestMine: (...a: unknown[]) => fetchIngestMine(...a),
  fetchIngestStatus: vi.fn(() => new Promise(() => {})),
  retryIngest: vi.fn(),
}));

import { useIngestStatusStore, INGEST_MINE_LIMIT, INGEST_MINE_MAX_PAGES } from "./useIngestStatusStore";

const T = 1790860800000;
const id = (hex: string) => `sha256:${hex.padEnd(64, "0")}`;
const wire = (hex: string) => ({
  ingest_id: id(hex), sha256: hex.padEnd(64, "0"), kind: "pdf", stage: "promoted", detail: null, duplicate: null,
  created_at: T, updated_at: T, origin: null, case_id: null,
});
const page = (hexes: string[], next: string | null) => ({ items: hexes.map(wire), next });
const flush = async () => {
  for (let i = 0; i < 30; i++) await new Promise((r) => setTimeout(r, 0));
};
const calls = () => fetchIngestMine.mock.calls.map((c) => c[1]);

beforeEach(() => {
  fetchIngestMine.mockReset();
  useIngestStatusStore.getState().reset();
});

describe("loadMine pages through GET /ingest/mine", () => {
  it("passes each page's next back as before, and lists every page in order", async () => {
    fetchIngestMine.mockResolvedValueOnce(page(["a1"], "cur-1")).mockResolvedValueOnce(page(["b2"], null));
    useIngestStatusStore.getState().loadMine();
    await flush();
    expect(fetchIngestMine.mock.calls).toEqual([[INGEST_MINE_LIMIT, null], [INGEST_MINE_LIMIT, "cur-1"]]);
    expect(useIngestStatusStore.getState().listed).toEqual([id("a1"), id("b2")]);
    expect(Object.keys(useIngestStatusStore.getState().rows).sort()).toEqual([id("a1"), id("b2")]);
    expect(useIngestStatusStore.getState().mine).toBe("loaded");
  });

  it("the first page draws before the second answers", async () => {
    fetchIngestMine.mockResolvedValueOnce(page(["a1"], "cur-1")).mockReturnValueOnce(new Promise(() => {}));
    useIngestStatusStore.getState().loadMine();
    await flush();
    expect(useIngestStatusStore.getState().mine).toBe("loaded");
    expect(useIngestStatusStore.getState().listed).toEqual([id("a1")]);
    expect(calls()).toEqual([null, "cur-1"]);
  });

  it("a cursor handed back twice stops the walk", async () => {
    fetchIngestMine.mockResolvedValueOnce(page(["a1"], "same")).mockResolvedValueOnce(page(["b2"], "same")).mockResolvedValue(page(["c3"], null));
    useIngestStatusStore.getState().loadMine();
    await flush();
    expect(calls()).toEqual([null, "same"]);
    expect(useIngestStatusStore.getState().listed).toEqual([id("a1"), id("b2")]);
  });

  it(`stops at ${INGEST_MINE_MAX_PAGES} pages however many the server offers`, async () => {
    let n = 0;
    fetchIngestMine.mockImplementation(() => {
      n++;
      return Promise.resolve(page([String(n).padStart(4, "0")], `cur-${n}`)); // distinct after padding: "p1" and "p10" were not
    });
    useIngestStatusStore.getState().loadMine();
    await flush();
    expect(fetchIngestMine).toHaveBeenCalledTimes(INGEST_MINE_MAX_PAGES);
    expect(useIngestStatusStore.getState().listed).toHaveLength(INGEST_MINE_MAX_PAGES);
  });

  it("a later page's failure keeps what was read: loaded, not failed", async () => {
    fetchIngestMine.mockResolvedValueOnce(page(["a1"], "cur-1")).mockRejectedValueOnce(Object.assign(new Error("422"), { response: { status: 422, data: { error: "invalid_cursor" } } }));
    useIngestStatusStore.getState().loadMine();
    await flush();
    expect(useIngestStatusStore.getState().mine).toBe("loaded");
    expect(useIngestStatusStore.getState().listed).toEqual([id("a1")]);
    expect(fetchIngestMine).toHaveBeenCalledTimes(2);
  });

  it("a later page that does not read as a page also stops the walk and keeps page one", async () => {
    fetchIngestMine.mockResolvedValueOnce(page(["a1"], "cur-1")).mockResolvedValueOnce({ nope: true }).mockResolvedValue(page(["c3"], null));
    useIngestStatusStore.getState().loadMine();
    await flush();
    expect(useIngestStatusStore.getState().mine).toBe("loaded");
    expect(useIngestStatusStore.getState().listed).toEqual([id("a1")]);
    expect(fetchIngestMine).toHaveBeenCalledTimes(2);
  });

  it("the FIRST page's failure is failed", async () => {
    fetchIngestMine.mockRejectedValueOnce(new Error("Network Error"));
    useIngestStatusStore.getState().loadMine();
    await flush();
    expect(useIngestStatusStore.getState().mine).toBe("failed");
    expect(useIngestStatusStore.getState().listed).toEqual([]);
  });

  it("a purge while a later page is in flight drops that page and asks for no more", async () => {
    let release!: (v: unknown) => void;
    fetchIngestMine.mockResolvedValueOnce(page(["a1"], "cur-1")).mockReturnValueOnce(new Promise((r) => (release = r))).mockResolvedValue(page(["c3"], null));
    useIngestStatusStore.getState().loadMine();
    await flush();
    useIngestStatusStore.getState().reset();
    release(page(["b2"], "cur-2"));
    await flush();
    expect(useIngestStatusStore.getState().listed).toEqual([]);
    expect(useIngestStatusStore.getState().rows).toEqual({});
    expect(fetchIngestMine).toHaveBeenCalledTimes(2);
  });

  it("a drop on two pages (it moved between reads) is listed once", async () => {
    fetchIngestMine.mockResolvedValueOnce(page(["a1", "b2"], "cur-1")).mockResolvedValueOnce(page(["b2", "c3"], null));
    useIngestStatusStore.getState().loadMine();
    await flush();
    expect(useIngestStatusStore.getState().listed).toEqual([id("a1"), id("b2"), id("c3")]);
  });
});
