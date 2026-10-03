/**
 * THE CONNECTION ITSELF, for `fetchIllustrationContent` — same rationale as
 * `uploadIngest.test.ts`: mocks `axios` one level further out so the REAL function in
 * `src/api/client.ts` runs, against a mocked `api.get`, so the guard call this function makes
 * BEFORE axios ever sees the path is actually exercised rather than assumed.
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

import { fetchIllustrationContent } from "./client";

beforeEach(() => {
  mockGet.mockReset();
});

describe("fetchIllustrationContent — goes through the minted api wrapper", () => {
  it("requests the path with responseType text and an identity transformResponse", async () => {
    mockGet.mockResolvedValue({ data: "<svg></svg>" });
    const out = await fetchIllustrationContent("/ingest/x/icn");
    expect(mockGet).toHaveBeenCalledTimes(1);
    const [path, opts] = mockGet.mock.calls[0];
    expect(path).toBe("/ingest/x/icn");
    expect(opts.responseType).toBe("text");
    expect(opts.transformResponse("<svg></svg>")).toBe("<svg></svg>");
    expect(out).toBe("<svg></svg>");
  });

  // I3b — the guard must run BEFORE axios is ever called, because axios would send this
  // caller's bearer to whatever host an absolute URL names.
  it("refuses an absolute URL and never calls the mocked api.get (M3b's target)", async () => {
    await expect(fetchIllustrationContent("https://evil.example/icn.svg")).rejects.toThrow();
    expect(mockGet).not.toHaveBeenCalled();
  });

  it("refuses a protocol-relative URL the same way", async () => {
    await expect(fetchIllustrationContent("//evil.example/a")).rejects.toThrow();
    expect(mockGet).not.toHaveBeenCalled();
  });
});
