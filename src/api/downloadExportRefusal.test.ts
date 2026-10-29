/**
 * THE CONNECTION ITSELF, for the two export file routes -- same rationale as
 * `fetchIllustrationContent.test.ts`: `axios` is mocked one level out so the REAL functions in
 * `src/api/client.ts` run. They fetch with `responseType: "blob"`, so a refusal body arrives as a
 * Blob; lane 01's #154 (a14e21b5) raises `HTTPException(detail={error, ...})`, so the code is
 * `detail.error` inside that Blob. Without the client re-reading it every refusal reads "no reason code".
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockGet } = vi.hoisted(() => ({ mockGet: vi.fn() }));
vi.mock("axios", () => ({
  default: {
    get: vi.fn(),
    create: vi.fn(() => ({
      get: mockGet,
      post: vi.fn(),
      interceptors: { request: { use: vi.fn() }, response: { use: vi.fn() } },
    })),
  },
}));

import { downloadBatchExport, downloadIngestExport } from "./client";
import { refusalCode } from "@/lib/reviewExport";

// #154's bodies, verbatim in shape: gateway.py `_export_one` 409 and `policy_refusal` 403.
const NOT_PROMOTED = { detail: { error: "ingest_not_promoted", status: "review", message: "only a promoted notice can be exported" } };
const NOT_ENTITLED = {
  detail: {
    error: "not_entitled_to_export_batch",
    policy_id: "capability_grants:ingest:exportBatch",
    missing_binding: "can_invoke ingest:exportBatch",
  },
};
const blobRefusal = (status: number, body: unknown) => ({
  response: { status, data: new Blob([JSON.stringify(body)], { type: "application/json" }) },
});

beforeEach(() => mockGet.mockReset());

describe("a Blob refusal body reaches refusalCode as #154's detail.error", () => {
  it("one notice: 409 ingest_not_promoted", async () => {
    mockGet.mockRejectedValueOnce(blobRefusal(409, NOT_PROMOTED));
    const err = await downloadIngestExport("ing-1", "alpha-x").catch((e: unknown) => e);
    expect(refusalCode(err), "the 409's code must survive the Blob body").toEqual({ status: 409, code: "ingest_not_promoted" });
  });

  it("the batch: 403 not_entitled_to_export_batch", async () => {
    mockGet.mockRejectedValueOnce(blobRefusal(403, NOT_ENTITLED));
    const err = await downloadBatchExport("alpha-x", "2026-10-01", "2026-10-05").catch((e: unknown) => e);
    expect(refusalCode(err), "the 403's code must survive the Blob body").toEqual({ status: 403, code: "not_entitled_to_export_batch" });
  });

  it("a body that is not JSON keeps its status and reads no code", async () => {
    mockGet.mockRejectedValueOnce({ response: { status: 502, data: new Blob(["<html>bad gateway</html>"]) } });
    const err = await downloadIngestExport("ing-1", "alpha-x").catch((e: unknown) => e);
    expect(refusalCode(err)).toEqual({ status: 502, code: null });
  });
});
