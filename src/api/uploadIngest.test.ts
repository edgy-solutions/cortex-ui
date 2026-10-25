/**
 * THE CONNECTION ITSELF, for `uploadIngest` — mirrors
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

import { uploadIngest } from "./client";

beforeEach(() => {
  mockPost.mockReset();
});

describe("uploadIngest — the multipart body's key set, exactly", () => {
  it("carries exactly {file, kind, on_behalf_of, content_kind} — no more, no fewer, and NO origin", async () => {
    mockPost.mockResolvedValue({ data: { ingest_id: "sha256:abc" } });
    const file = new File(["x"], "drawing.pdf", { type: "application/pdf" });
    await uploadIngest(file, "pdf", "steward@example.com", "pdf");

    expect(mockPost).toHaveBeenCalledTimes(1);
    const [path, body] = mockPost.mock.calls[0];
    expect(path).toBe("/ingest");
    expect(body).toBeInstanceOf(FormData);
    const keys = new Set((body as FormData).keys());
    // EQUALITY, not containment — a set that merely CONTAINS {file,kind,on_behalf_of} would
    // still pass if an `origin` field (or anything else) had been added alongside them.
    expect(keys).toEqual(new Set(["file", "kind", "on_behalf_of", "content_kind"]));
    // Without it doc-tools refuses "no registered content_kind" and the drop goes `failed`.
    expect((body as FormData).get("content_kind")).toBe("pdf");
  });
});
