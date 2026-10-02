/**
 * THE CONNECTION ITSELF, for `uploadIngest` and `disputeIngestOrigin` — mirrors
 * `fetchTaskKinds.test.ts`'s rationale: every other ingest test mocks `@/lib/ingestTransport` or
 * `@/api/client` wholesale, so the real multipart body `uploadIngest` actually sends is
 * unexercised. This mocks `axios` one level further out so the REAL functions in `src/api/client.ts`
 * run, against a mocked `api.post`.
 *
 * ADR-0041 §2 — the dropper supplies NO origin field: this is the equality (not containment)
 * check that an `origin` key sneaking onto the multipart body would trip.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockPost } = vi.hoisted(() => ({ mockPost: vi.fn() }));
vi.mock("axios", () => ({
  default: {
    get: vi.fn(),
    create: vi.fn(() => ({
      post: mockPost,
      get: vi.fn(),
      interceptors: { request: { use: vi.fn() }, response: { use: vi.fn() } },
    })),
  },
}));

import { uploadIngest, disputeIngestOrigin } from "./client";

beforeEach(() => {
  mockPost.mockReset();
});

describe("uploadIngest — the multipart body's key set, exactly", () => {
  it("carries exactly {file, kind, on_behalf_of} — no more, no fewer, and NO origin", async () => {
    mockPost.mockResolvedValue({ data: { ingest_id: "sha256:abc" } });
    const file = new File(["x"], "drawing.pdf", { type: "application/pdf" });
    await uploadIngest(file, "pdf", "steward@example.com");

    expect(mockPost).toHaveBeenCalledTimes(1);
    const [path, body] = mockPost.mock.calls[0];
    expect(path).toBe("/ingest");
    expect(body).toBeInstanceOf(FormData);
    const keys = new Set((body as FormData).keys());
    // EQUALITY, not containment — a set that merely CONTAINS {file,kind,on_behalf_of} would
    // still pass if an `origin` field (or anything else) had been added alongside them.
    expect(keys).toEqual(new Set(["file", "kind", "on_behalf_of"]));
  });
});

describe("disputeIngestOrigin — the proposed dispute route", () => {
  it("posts {on_behalf_of} with no note, to /ingest/{id}/origin/dispute", async () => {
    mockPost.mockResolvedValue({ data: { steward_task_id: "task-1" } });
    const out = await disputeIngestOrigin("sha256:abc", "steward@example.com");
    expect(mockPost).toHaveBeenCalledWith("/ingest/sha256%3Aabc/origin/dispute", {
      on_behalf_of: "steward@example.com",
    });
    expect(out).toEqual({ steward_task_id: "task-1" });
  });
});
