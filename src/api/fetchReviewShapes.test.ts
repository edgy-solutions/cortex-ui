/**
 * THE CONNECTION ITSELF: `fetchReviewShapes` through the real `request()`, with only the axios adapter stubbed
 * (the pattern of `fetchTaskKinds.test.ts`), so a wrong method or path is caught where the browser would send it.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockGet } = vi.hoisted(() => ({ mockGet: vi.fn() }));
vi.mock("axios", () => ({
  default: {
    get: vi.fn(),
    create: vi.fn(() => ({
      get: mockGet,
      interceptors: { request: { use: vi.fn() }, response: { use: vi.fn() } },
    })),
  },
}));

import { fetchReviewShapes } from "./client";
import { readReviewShapes } from "@/lib/reviewShapes";
import { REVIEW_SHAPES_FIXTURE } from "@/lib/reviewShapesFixture";

beforeEach(() => mockGet.mockReset());

describe("fetchReviewShapes -- the real wiring from GET /review-shapes to readReviewShapes", () => {
  it("sends a GET to /review-shapes with no query, and the answer reads into rows", async () => {
    mockGet.mockResolvedValue({ data: REVIEW_SHAPES_FIXTURE });
    const body = await fetchReviewShapes();
    expect(mockGet).toHaveBeenCalledTimes(1);
    expect(mockGet.mock.calls[0][0]).toBe("/review-shapes");
    expect(mockGet.mock.calls[0][1]?.params).toBeUndefined();
    expect(readReviewShapes(body)).toEqual(REVIEW_SHAPES_FIXTURE);
  });
});
