/**
 * THE CONNECTION ITSELF, for the export file routes -- same rationale as
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

import { checkNoticesExport, downloadNoticesExport } from "./client";
import { readUnexportableRefusal, refusalCode } from "@/lib/reviewExport";

// The notices route's refusal bodies, verbatim in shape: `policy_refusal` 403.
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
  it("the notices download: 403 not_entitled_to_export_batch", async () => {
    mockPost.mockRejectedValueOnce(blobRefusal(403, NOT_ENTITLED));
    const err = await downloadNoticesExport("alpha-x", ["ing-1", "ing-2"]).catch((e: unknown) => e);
    expect(refusalCode(err), "the 403's code must survive the Blob body").toEqual({ status: 403, code: "not_entitled_to_export_batch" });
    expect(mockPost).toHaveBeenCalledWith(
      "/ingest/export/notices",
      { notice_ids: ["ing-1", "ing-2"], profile: "alpha-x" },
      { responseType: "blob" },
    );
  });

  it("the notices download: a 422 Blob reads export_notices_unexportable and the rows with their state", async () => {
    const rows = [{ notice_id: "ing-2", reason: "state_not_exportable", state: "synthetic-state-a" }];
    mockPost.mockRejectedValueOnce(
      blobRefusal(422, { detail: { error: "export_notices_unexportable", unexportable: rows, message: "m" } }),
    );
    const err = await downloadNoticesExport("alpha-x", ["ing-1", "ing-2"]).catch((e: unknown) => e);
    expect(refusalCode(err)).toEqual({ status: 422, code: "export_notices_unexportable" });
    expect(readUnexportableRefusal(err)).toEqual(rows);
  });

  it("check_only: a well-formed body reads; a malformed one throws", async () => {
    mockPost.mockResolvedValueOnce({ data: { profile: "alpha-x", version: 1, notices: 1, unexportable: [] } });
    await expect(checkNoticesExport("alpha-x", ["ing-1"])).resolves.toEqual({ profile: "alpha-x", version: 1, notices: 1, unexportable: [] });
    expect(mockPost.mock.calls[0]![1]).toEqual({ notice_ids: ["ing-1"], profile: "alpha-x", check_only: true });
    mockPost.mockResolvedValueOnce({ data: { profile: "alpha-x", version: "1", notices: 1, unexportable: [] } });
    await expect(checkNoticesExport("alpha-x", ["ing-1"])).rejects.toThrow(/malformed/);
  });

  it("a body that is not JSON keeps its status and reads no code", async () => {
    mockPost.mockRejectedValueOnce({ response: { status: 502, data: new Blob(["<html>bad gateway</html>"]) } });
    const err = await downloadNoticesExport("alpha-x", ["ing-1"]).catch((e: unknown) => e);
    expect(refusalCode(err)).toEqual({ status: 502, code: null });
  });
});
