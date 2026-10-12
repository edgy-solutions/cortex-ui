/** `failure` / `attempt` on the status row, the retry path and its refusal, and the polling rule for a timed-out row. */
import { describe, it, expect } from "vitest";
import {
  readIngestFailure,
  readIngestStatusRow,
  readIngestRetryRefusal,
  ingestRetryPath,
  ingestStatusPath,
  ingestPollingDone,
  INGEST_FAILURE_TIMEOUT,
  INGEST_FAILURE_KIND_UNREGISTERED,
  type IngestFailure,
} from "./ingestWire";
import { ingestComponentOf, type IngestEntry } from "./ingestArtifact";

const SHA = "a".repeat(64);
const wireRow = (over: Record<string, unknown> = {}) => ({
  ingest_id: `sha256:${SHA}`, sha256: SHA, kind: "pdf", stage: "failed", detail: "old detail", duplicate: null,
  created_at: 1, updated_at: 1, ...over,
});
const fail = (over: Partial<IngestFailure> = {}): IngestFailure => ({
  reason_code: null, reason: "r", step: null, run_id: null, pin_digest: null, failed_at: null, ...over,
});
const wireFailure = (over: Record<string, unknown> = {}) => ({
  reason_code: "kind_unregistered", reason: "kind x is not registered: a, b", step: "parse",
  run_id: "run-1", pin_digest: "sha256:abc", failed_at: 1760300000000, ...over,
});

describe("readIngestFailure", () => {
  it("reads a full object verbatim", () => {
    expect(readIngestFailure(wireFailure())).toEqual({
      reason_code: "kind_unregistered", reason: "kind x is not registered: a, b", step: "parse",
      run_id: "run-1", pin_digest: "sha256:abc", failed_at: 1760300000000,
    });
  });
  it("null is null (a claim of no failure)", () => expect(readIngestFailure(null)).toBeNull());
  it.each([["undefined", undefined], ["string", "boom"], ["number", 3], ["boolean", true]])(
    "%s is no claim", (_n, v) => expect(readIngestFailure(v)).toBeUndefined());
  it.each([["missing", undefined], ["blank", "  "], ["empty", ""], ["number", 4], ["null", null]])(
    "a %s reason is no claim", (_n, reason) => expect(readIngestFailure(wireFailure({ reason }))).toBeUndefined());
  it("keeps reason verbatim, untrimmed", () => expect(readIngestFailure(wireFailure({ reason: " x " }))?.reason).toBe(" x "));
  it("reason_code null / blank / wrong type read as null; an unknown code is kept verbatim", () => {
    expect(readIngestFailure(wireFailure({ reason_code: null }))?.reason_code).toBeNull();
    expect(readIngestFailure(wireFailure({ reason_code: "" }))?.reason_code).toBeNull();
    expect(readIngestFailure(wireFailure({ reason_code: 7 }))?.reason_code).toBeNull();
    expect(readIngestFailure(wireFailure({ reason_code: "some_new_code" }))?.reason_code).toBe("some_new_code");
  });
  it("step / run_id / pin_digest: non-blank string else null", () => {
    const f = readIngestFailure(wireFailure({ step: " ", run_id: 3, pin_digest: undefined }));
    expect([f?.step, f?.run_id, f?.pin_digest]).toEqual([null, null, null]);
  });
  it("failed_at: finite number else null", () => {
    expect(readIngestFailure(wireFailure({ failed_at: 5 }))?.failed_at).toBe(5);
    for (const v of ["5", NaN, Infinity, null]) expect(readIngestFailure(wireFailure({ failed_at: v }))?.failed_at).toBeNull();
  });
});

describe("readIngestStatusRow — failure and attempt", () => {
  it("failure ABSENT omits the key; null keeps it as null; an object keeps it", () => {
    expect("failure" in readIngestStatusRow(wireRow())!).toBe(false);
    const nul = readIngestStatusRow(wireRow({ failure: null }))!;
    expect("failure" in nul).toBe(true);
    expect(nul.failure).toBeNull();
    expect(readIngestStatusRow(wireRow({ failure: wireFailure() }))?.failure?.reason_code).toBe("kind_unregistered");
  });
  it("a malformed failure omits the key (no claim)", () => {
    expect("failure" in readIngestStatusRow(wireRow({ failure: { reason: "" } }))!).toBe(false);
  });
  it.each([1, 2, 40])("attempt %s is kept", (n) => expect(readIngestStatusRow(wireRow({ attempt: n }))?.attempt).toBe(n));
  it.each([0, -1, 1.5, "2", null, NaN])("attempt %s is omitted", (v) => {
    expect("attempt" in readIngestStatusRow(wireRow({ attempt: v }))!).toBe(false);
  });
  it("attempt absent is omitted", () => expect("attempt" in readIngestStatusRow(wireRow())!).toBe(false));
});

describe("ingestPollingDone — failed", () => {
  const done = (failure?: IngestFailure | null) =>
    ingestPollingDone({ stage: "failed", duplicate: null, ...(failure !== undefined ? { failure } : {}) });
  it("failed + timeout is NOT done (a late run can still advance it)", () =>
    expect(done(fail({ reason_code: INGEST_FAILURE_TIMEOUT }))).toBe(false));
  it("failed + kind_unregistered is done", () =>
    expect(done(fail({ reason_code: INGEST_FAILURE_KIND_UNREGISTERED }))).toBe(true));
  it("failed + another code is done", () => expect(done(fail({ reason_code: "other" }))).toBe(true));
  it("failed + reason_code null is done", () => expect(done(fail())).toBe(true));
  it("failed + failure null is done", () => expect(done(null)).toBe(true));
  it("failed + failure absent is done", () => expect(done()).toBe(true));
  it("a timeout failure on a duplicate is still done", () =>
    expect(
      ingestPollingDone({ stage: "failed", duplicate: { of_ingest_id: "x", message: "m" }, failure: fail({ reason_code: "timeout" }) }),
    ).toBe(true));
});

describe("ingestRetryPath / readIngestRetryRefusal", () => {
  it("encodes the id exactly like ingestStatusPath", () => {
    const id = `sha256:${SHA}`;
    expect(ingestRetryPath(id)).toBe(`/ingest/sha256%3A${SHA}/retry`);
    expect(ingestRetryPath(id).replace(/retry$/, "status")).toBe(ingestStatusPath(id));
    expect(ingestRetryPath("a/b c")).toBe("/ingest/a%2Fb%20c/retry");
  });
  it("reads the WRAPPED 409", () =>
    expect(readIngestRetryRefusal({ response: { status: 409, data: { detail: { error: "not_failed" } } } })).toEqual({
      status: 409, error: "not_failed", message: "",
    }));
  it("reads the WRAPPED 403 with its message", () =>
    expect(
      readIngestRetryRefusal({ response: { status: 403, data: { detail: { error: "retry_is_pin_driven", message: "no" } } } }),
    ).toEqual({ status: 403, error: "retry_is_pin_driven", message: "no" }));
  it("an HTTP error with no readable body has error null", () =>
    expect(readIngestRetryRefusal({ response: { status: 500, data: "oops" } })).toEqual({ status: 500, error: null, message: "" }));
  it("a non-HTTP error is null", () => {
    expect(readIngestRetryRefusal(new Error("network"))).toBeNull();
    expect(readIngestRetryRefusal(null)).toBeNull();
  });
});

describe("IngestComponent reason / reason_code / attempt", () => {
  const entry = (rowOver: Record<string, unknown>): IngestEntry => ({
    key: "k", filename: "f.pdf", kind: "pdf", droppedAt: 1, phase: "status", ingestId: `sha256:${SHA}`, error: null,
    acceptedThisSession: true, duplicate: null, note: null, notFound: false,
    row: readIngestStatusRow(wireRow(rowOver)),
  });
  it("failure.reason wins over detail", () => {
    const c = ingestComponentOf(entry({ failure: wireFailure({ reason_code: "timeout" }), attempt: 3 }));
    expect([c.reason, c.reason_code, c.attempt]).toEqual(["kind x is not registered: a, b", "timeout", 3]);
  });
  it("falls back to detail when the fleet sends no failure; no code, no attempt", () => {
    const c = ingestComponentOf(entry({}));
    expect([c.reason, c.reason_code, c.attempt]).toEqual(["old detail", null, null]);
  });
  it("a non-failed stage carries no reason and no code", () => {
    const c = ingestComponentOf(entry({ stage: "received", failure: null, attempt: 2 }));
    expect([c.reason, c.reason_code, c.attempt]).toEqual([null, null, 2]);
  });
});
