/**
 * The ONE status poller: in-flight drops are polled, terminal ones are read once and never again,
 * a slow response is not overtaken, a 404 stops that id, and a purge cannot be repopulated.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const fetchIngestStatus = vi.fn();
vi.mock("@/lib/ingestTransport", () => ({ fetchIngestStatus: (...a: unknown[]) => fetchIngestStatus(...a) }));

import { useIngestStatusStore } from "./useIngestStatusStore";

const A = `sha256:${"a".repeat(64)}`;
const B = `sha256:${"b".repeat(64)}`;
const wire = (id: string, stage: string) => ({
  ingest_id: id, sha256: id.slice(7), kind: "pdf", stage, detail: "d", duplicate: null,
  created_at: 1, updated_at: 1, origin: null, case_id: null,
});
const flush = () => new Promise((r) => setTimeout(r, 0));

beforeEach(() => {
  fetchIngestStatus.mockReset();
  useIngestStatusStore.getState().reset();
});

describe("useIngestStatusStore.pollDue", () => {
  it("polls an in-flight drop on every tick until it is terminal, then never again", async () => {
    const { pollDue } = useIngestStatusStore.getState();
    for (const stage of ["received", "extracting", "review", "promoted"]) {
      fetchIngestStatus.mockResolvedValueOnce(wire(A, stage));
      pollDue([A]);
      await flush();
      expect(useIngestStatusStore.getState().rows[A]?.stage).toBe(stage);
    }
    expect(fetchIngestStatus).toHaveBeenCalledTimes(4);
    pollDue([A]);
    pollDue([A]);
    await flush();
    expect(fetchIngestStatus, "polled a promoted drop").toHaveBeenCalledTimes(4);
  });

  it("a terminal drop is fetched ONCE, on load, to show its stage", async () => {
    fetchIngestStatus.mockResolvedValue(wire(B, "rejected"));
    const { pollDue } = useIngestStatusStore.getState();
    pollDue([B]);
    await flush();
    pollDue([B]);
    pollDue([B]);
    await flush();
    expect(fetchIngestStatus).toHaveBeenCalledTimes(1);
    expect(useIngestStatusStore.getState().rows[B]?.stage).toBe("rejected");
  });

  it("is single-flight per id: a slow response is not overtaken by the next tick", async () => {
    let resolve!: (v: unknown) => void;
    fetchIngestStatus.mockReturnValue(new Promise((r) => (resolve = r)));
    const { pollDue } = useIngestStatusStore.getState();
    pollDue([A]);
    pollDue([A]);
    pollDue([A]);
    expect(fetchIngestStatus).toHaveBeenCalledTimes(1);
    resolve(wire(A, "received"));
    await flush();
    pollDue([A]);
    expect(fetchIngestStatus).toHaveBeenCalledTimes(2);
  });

  it("a 404 stops that id; a transport error is retried", async () => {
    const { pollDue } = useIngestStatusStore.getState();
    fetchIngestStatus.mockRejectedValueOnce(new Error("boom"));
    pollDue([A]);
    await flush();
    expect(useIngestStatusStore.getState().notFound[A]).toBeUndefined();
    fetchIngestStatus.mockRejectedValueOnce(Object.assign(new Error("nf"), { response: { status: 404 } }));
    pollDue([A]);
    await flush();
    expect(useIngestStatusStore.getState().notFound[A]).toBe(true);
    pollDue([A]);
    await flush();
    expect(fetchIngestStatus).toHaveBeenCalledTimes(2);
  });

  it("a response that left before a purge does not repopulate after it", async () => {
    let resolve!: (v: unknown) => void;
    fetchIngestStatus.mockReturnValue(new Promise((r) => (resolve = r)));
    useIngestStatusStore.getState().pollDue([A]);
    useIngestStatusStore.getState().reset();
    resolve(wire(A, "review"));
    await flush();
    expect(useIngestStatusStore.getState().rows).toEqual({});
  });
});
