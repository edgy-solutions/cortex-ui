/** `retry` on the status store, and the slow cadence for a failed+timeout row. */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const fetchIngestStatus = vi.fn();
const retryIngest = vi.fn();
vi.mock("@/lib/ingestTransport", () => ({
  fetchIngestStatus: (...a: unknown[]) => fetchIngestStatus(...a),
  retryIngest: (...a: unknown[]) => retryIngest(...a),
}));

import { useIngestStatusStore } from "./useIngestStatusStore";
import { INGEST_FAILED_TIMEOUT_POLL_MS } from "@/lib/ingestWire";

const A = `sha256:${"a".repeat(64)}`;
const wire = (stage: string, over: Record<string, unknown> = {}) => ({
  ingest_id: A, sha256: A.slice(7), kind: "pdf", stage, detail: "d", duplicate: null,
  created_at: 1, updated_at: 1, origin: null, case_id: null, ...over,
});
const failure = (reason_code: string | null) => ({ reason_code, reason: "r", step: null, run_id: null, pin_digest: null, failed_at: 1 });
const flush = async () => {
  for (let i = 0; i < 8; i++) await Promise.resolve();
};
const httpErr = (status: number, detail: unknown) => ({ response: { status, data: { detail } } });
const state = () => useIngestStatusStore.getState();
const T0 = 1_000_000;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(T0);
  fetchIngestStatus.mockReset();
  retryIngest.mockReset();
  state().reset();
});
afterEach(() => vi.useRealTimers());

async function seedFailed(reason_code: string | null, attempt = 1) {
  fetchIngestStatus.mockResolvedValueOnce(wire("failed", { failure: failure(reason_code), attempt }));
  state().pollDue([A]);
  await flush();
  expect(state().rows[A]?.stage).toBe("failed");
}

describe("retry", () => {
  it("200: the row is received, attempt from the response, failure null, and polling resumes", async () => {
    await seedFailed("kind_unregistered");
    fetchIngestStatus.mockClear();
    retryIngest.mockResolvedValue({ ingest_id: A, stage: "received", attempt: 2 });
    const r = await state().retry(A);
    expect(r).toEqual({ ok: true });
    expect(retryIngest).toHaveBeenCalledTimes(1);
    expect(retryIngest).toHaveBeenCalledWith(A);
    expect(state().rows[A]).toMatchObject({ stage: "received", attempt: 2, failure: null });
    fetchIngestStatus.mockResolvedValue(wire("extracting", { attempt: 2 }));
    state().pollDue([A]);
    await flush();
    expect(fetchIngestStatus, "polling did not resume after a retry").toHaveBeenCalledTimes(1);
    expect(state().rows[A]?.stage).toBe("extracting");
  });

  it("200 without a usable attempt keeps the row's own", async () => {
    await seedFailed("kind_unregistered", 3);
    retryIngest.mockResolvedValue({ ingest_id: A, stage: "received", attempt: "x" });
    await state().retry(A);
    expect(state().rows[A]?.attempt).toBe(3);
  });

  it("409 not_failed: refetches immediately and says it moved", async () => {
    await seedFailed("kind_unregistered");
    fetchIngestStatus.mockClear();
    fetchIngestStatus.mockResolvedValue(wire("extracting"));
    retryIngest.mockRejectedValue(httpErr(409, { error: "not_failed" }));
    const r = await state().retry(A);
    expect(r).toEqual({ ok: false, message: "It moved since it was read — refreshed." });
    await flush();
    expect(fetchIngestStatus, "no immediate refetch on 409").toHaveBeenCalledTimes(1);
    expect(state().rows[A]?.stage).toBe("extracting");
  });

  it("403: its own message, row untouched", async () => {
    await seedFailed("kind_unregistered");
    retryIngest.mockRejectedValue(httpErr(403, { error: "retry_is_pin_driven", message: "server words" }));
    expect(await state().retry(A)).toEqual({ ok: false, message: "This drop can’t be retried from here." });
    expect(state().rows[A]?.stage).toBe("failed");
  });

  it("other errors: the server message, else 'Retry failed.'", async () => {
    await seedFailed("kind_unregistered");
    retryIngest.mockRejectedValueOnce(httpErr(503, "store down"));
    expect(await state().retry(A)).toEqual({ ok: false, message: "store down" });
    retryIngest.mockRejectedValueOnce(new Error("net"));
    expect(await state().retry(A)).toEqual({ ok: false, message: "Retry failed." });
  });
});

describe("cadence for a failed row", () => {
  it("failed + timeout is re-read at most every 30 s", async () => {
    await seedFailed("timeout");
    fetchIngestStatus.mockResolvedValue(wire("failed", { failure: failure("timeout") }));
    fetchIngestStatus.mockClear();
    state().pollDue([A]);
    await flush();
    expect(fetchIngestStatus, "re-read inside the 30 s window").toHaveBeenCalledTimes(0);
    vi.setSystemTime(T0 + INGEST_FAILED_TIMEOUT_POLL_MS - 1);
    state().pollDue([A]);
    await flush();
    expect(fetchIngestStatus).toHaveBeenCalledTimes(0);
    vi.setSystemTime(T0 + INGEST_FAILED_TIMEOUT_POLL_MS);
    state().pollDue([A]);
    await flush();
    expect(fetchIngestStatus, "not re-read after 30 s").toHaveBeenCalledTimes(1);
  });

  it("a late run takes the row off failed and normal polling resumes", async () => {
    await seedFailed("timeout");
    vi.setSystemTime(T0 + INGEST_FAILED_TIMEOUT_POLL_MS);
    fetchIngestStatus.mockResolvedValue(wire("extracting", { failure: null }));
    state().pollDue([A]);
    await flush();
    expect(state().rows[A]?.stage).toBe("extracting");
    fetchIngestStatus.mockClear();
    state().pollDue([A]);
    await flush();
    expect(fetchIngestStatus).toHaveBeenCalledTimes(1);
  });

  it("failed + another code is read once and never again", async () => {
    await seedFailed("kind_unregistered");
    fetchIngestStatus.mockClear();
    vi.setSystemTime(T0 + 10 * INGEST_FAILED_TIMEOUT_POLL_MS);
    state().pollDue([A]);
    await flush();
    expect(fetchIngestStatus).toHaveBeenCalledTimes(0);
  });
});
