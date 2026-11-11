/**
 * THE CONNECTION ITSELF, for the two export file routes -- same rationale as
 * `fetchIllustrationContent.test.ts`: `axios` is mocked one level out so the REAL functions in
 * `src/api/client.ts` run. They fetch with `responseType: "blob"`, so a refusal body arrives as a
 * Blob; lane 01's #154 (a14e21b5) raises `HTTPException(detail={error, ...})`, so the code is
 * `detail.error` inside that Blob. Without the client re-reading it every refusal reads "no reason code".
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockGet, mockPost } = vi.hoisted(() => ({ mockGet: vi.fn(), mockPost: vi.fn() }));
vi.mock("axios", () => ({
  default: {
    get: vi.fn(),
    create: vi.fn(() => ({
      get: mockGet,
      post: mockPost,
      interceptors: { request: { use: vi.fn() }, response: { use: vi.fn() } },
    })),
  },
}));

import { downloadSelectionExport, downloadIngestExport, resolveIngestExport } from "./client";
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

beforeEach(() => {
  mockGet.mockReset();
  mockPost.mockReset();
});

describe("a Blob refusal body reaches refusalCode as #154's detail.error", () => {
  it("one notice: 409 ingest_not_promoted", async () => {
    mockGet.mockRejectedValueOnce(blobRefusal(409, NOT_PROMOTED));
    const err = await downloadIngestExport("ing-1", "alpha-x").catch((e: unknown) => e);
    expect(refusalCode(err), "the 409's code must survive the Blob body").toEqual({ status: 409, code: "ingest_not_promoted" });
  });

  it("the selection download: 403 not_entitled_to_export_batch", async () => {
    mockPost.mockRejectedValueOnce(blobRefusal(403, NOT_ENTITLED));
    const err = await downloadSelectionExport("alpha-x", ["ing-1", "ing-2"]).catch((e: unknown) => e);
    expect(refusalCode(err), "the 403's code must survive the Blob body").toEqual({ status: 403, code: "not_entitled_to_export_batch" });
    expect(mockPost).toHaveBeenCalledWith("/ingest/export", { profile: "alpha-x", ingest_ids: ["ing-1", "ing-2"] }, { responseType: "blob" });
  });

  it("resolve: a JSON 409 passes through untouched, so refusalCode reads detail.error", async () => {
    const refusal = { response: { status: 409, data: NOT_PROMOTED } };
    mockPost.mockRejectedValueOnce(refusal);
    const err = await resolveIngestExport({ ingestIds: ["ing-1"] }).catch((e: unknown) => e);
    expect(err).toBe(refusal);
    expect(refusalCode(err)).toEqual({ status: 409, code: "ingest_not_promoted" });
  });

  it("a body that is not JSON keeps its status and reads no code", async () => {
    mockGet.mockRejectedValueOnce({ response: { status: 502, data: new Blob(["<html>bad gateway</html>"]) } });
    const err = await downloadIngestExport("ing-1", "alpha-x").catch((e: unknown) => e);
    expect(refusalCode(err)).toEqual({ status: 502, code: null });
  });
});
