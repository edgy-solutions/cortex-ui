/**
 * `loadMine` reads the FIRST page of `GET /ingest/mine` (191) and keeps `next`; `loadOlderDrops` reads the
 * next page on demand, with no cap. Each page's `next` goes back verbatim as `before`. A cursor handed back
 * twice stops the paging; a later page's failure keeps what was read and marks `olderDrops: "failed"`; only
 * the FIRST page's failure is `mine: "failed"`.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const fetchIngestMine = vi.fn();
vi.mock("@/lib/ingestTransport", () => ({
  fetchIngestMine: (...a: unknown[]) => fetchIngestMine(...a),
  fetchIngestStatus: vi.fn(() => new Promise(() => {})),
  retryIngest: vi.fn(),
}));

import { useIngestStatusStore, INGEST_MINE_LIMIT } from "./useIngestStatusStore";

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

beforeEach(() => {
  fetchIngestMine.mockReset();
  useIngestStatusStore.getState().reset();
});

describe("loadMine reads one page; loadOlderDrops reads the rest on demand", () => {
  const st = () => useIngestStatusStore.getState();

  it("loadMine reads one page and keeps next", async () => {
    fetchIngestMine.mockResolvedValueOnce(page(["a1"], "cur-1")).mockResolvedValue(page(["b2"], null));
    st().loadMine();
    await flush();
    expect(fetchIngestMine.mock.calls).toEqual([[INGEST_MINE_LIMIT, null]]);
    expect(st().listed).toEqual([id("a1")]);
    expect(st().next).toBe("cur-1");
    expect(st().mine).toBe("loaded");
  });

  it("loadOlderDrops appends the next page in order, passing next back as before", async () => {
    fetchIngestMine.mockResolvedValueOnce(page(["a1"], "cur-1")).mockResolvedValueOnce(page(["b2"], "cur-2")).mockResolvedValueOnce(page(["c3"], null));
    st().loadMine();
    await flush();
    st().loadOlderDrops();
    await flush();
    st().loadOlderDrops();
    await flush();
    expect(fetchIngestMine.mock.calls).toEqual([[INGEST_MINE_LIMIT, null], [INGEST_MINE_LIMIT, "cur-1"], [INGEST_MINE_LIMIT, "cur-2"]]);
    expect(st().listed).toEqual([id("a1"), id("b2"), id("c3")]);
    expect(st().next).toBeNull();
    // past the last page there is nothing to read
    st().loadOlderDrops();
    await flush();
    expect(fetchIngestMine).toHaveBeenCalledTimes(3);
  });

  it("there is no page cap: more than ten pages can be read", async () => {
    let n = 0;
    fetchIngestMine.mockImplementation(() => {
      n++;
      return Promise.resolve(page([String(n).padStart(4, "0")], `cur-${n}`));
    });
    st().loadMine();
    await flush();
    for (let i = 0; i < 11; i++) {
      st().loadOlderDrops();
      await flush();
    }
    expect(st().listed).toHaveLength(12);
  }, 30_000);

  it("a repeated cursor stops paging", async () => {
    fetchIngestMine.mockResolvedValueOnce(page(["a1"], "same")).mockResolvedValueOnce(page(["b2"], "same")).mockResolvedValue(page(["c3"], null));
    st().loadMine();
    await flush();
    st().loadOlderDrops();
    await flush();
    expect(st().listed).toEqual([id("a1"), id("b2")]);
    expect(st().next).toBeNull();
    st().loadOlderDrops();
    await flush();
    expect(fetchIngestMine).toHaveBeenCalledTimes(2);
  });

  it("a failed older page keeps what was read and marks failed; the control can ask again", async () => {
    fetchIngestMine.mockResolvedValueOnce(page(["a1"], "cur-1")).mockRejectedValueOnce(Object.assign(new Error("422"), { response: { status: 422, data: { error: "invalid_cursor" } } })).mockResolvedValueOnce(page(["b2"], null));
    st().loadMine();
    await flush();
    st().loadOlderDrops();
    await flush();
    expect(st().mine).toBe("loaded");
    expect(st().olderDrops).toBe("failed");
    expect(st().listed).toEqual([id("a1")]);
    expect(st().next).toBe("cur-1");
    st().loadOlderDrops();
    await flush();
    expect(st().listed).toEqual([id("a1"), id("b2")]);
    expect(st().olderDrops).toBe("idle");
  });

  it("an older page that does not read as a page is also failed, keeping page one", async () => {
    fetchIngestMine.mockResolvedValueOnce(page(["a1"], "cur-1")).mockResolvedValueOnce({ nope: true });
    st().loadMine();
    await flush();
    st().loadOlderDrops();
    await flush();
    expect(st().olderDrops).toBe("failed");
    expect(st().listed).toEqual([id("a1")]);
  });

  it("the FIRST page's failure is failed", async () => {
    fetchIngestMine.mockRejectedValueOnce(new Error("Network Error"));
    st().loadMine();
    await flush();
    expect(st().mine).toBe("failed");
    expect(st().listed).toEqual([]);
  });

  it("a purge while an older page is in flight drops that page", async () => {
    let release!: (v: unknown) => void;
    fetchIngestMine.mockResolvedValueOnce(page(["a1"], "cur-1")).mockReturnValueOnce(new Promise((r) => (release = r)));
    st().loadMine();
    await flush();
    st().loadOlderDrops();
    st().reset();
    release(page(["b2"], "cur-2"));
    await flush();
    expect(st().listed).toEqual([]);
    expect(st().rows).toEqual({});
    expect(st().next).toBeNull();
  });

  it("a drop on two pages (it moved between reads) is listed once", async () => {
    fetchIngestMine.mockResolvedValueOnce(page(["a1", "b2"], "cur-1")).mockResolvedValueOnce(page(["b2", "c3"], null));
    st().loadMine();
    await flush();
    st().loadOlderDrops();
    await flush();
    expect(st().listed).toEqual([id("a1"), id("b2"), id("c3")]);
  });
});
