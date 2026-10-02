/**
 * THE CONNECTION ITSELF, NOT JUST THE READER.
 *
 * `taskKindsResponse.test.tsx` proves `readTaskKindsResponse` parses the route envelope
 * correctly, and that the store/card do the right thing once fed its output. Neither test
 * touches `fetchTaskKinds` in THIS file (`src/api/client.ts`) — every other test mocks
 * `@/api/client` wholesale, so the wiring between `api.get("/task_kinds")` and the reader
 * is itself unexercised. A mutant that reverted `fetchTaskKinds` to its old array-only
 * parsing would pass every other test in the suite and still be dead wrong on the live wire.
 *
 * This file mocks `axios` (one level further out) so the REAL `fetchTaskKinds` runs, against
 * a mocked `api.get`, exactly as the browser would call it.
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

import { fetchTaskKinds } from "./client";

beforeEach(() => {
  mockGet.mockReset();
});

describe("fetchTaskKinds — the real wiring from GET /task_kinds to readTaskKindsResponse", () => {
  it("reads the route envelope shape into declarations", async () => {
    mockGet.mockResolvedValue({
      data: {
        composed: true,
        kinds: {
          risk_acceptance_medium: {
            kind: "risk_acceptance_medium",
            declared: true,
            archetype: "APPROVAL_TASK",
            badge: "ACCEPT-M",
            title: "Medium risk acceptance",
            accepts: ["accepted", "rejected"],
            reason_required: ["accepted"],
          },
        },
      },
    });
    const out = await fetchTaskKinds();
    expect(out).toEqual([
      {
        kind: "risk_acceptance_medium",
        declared: true,
        archetype: "APPROVAL_TASK",
        badge: "ACCEPT-M",
        title: "Medium risk acceptance",
        accepts: ["accepted", "rejected"],
        reason_required: ["accepted"],
      },
    ]);
    expect(mockGet).toHaveBeenCalledWith("/task_kinds");
  });

  it("the OLD array forms are no longer accepted — a bare array reads as unreachable", async () => {
    mockGet.mockResolvedValue({ data: [{ kind: "x", declared: true, accepts: [] }] });
    expect(await fetchTaskKinds()).toBeNull();
  });

  it("the OLD {kinds: [...]} array form is no longer accepted either", async () => {
    mockGet.mockResolvedValue({ data: { kinds: [{ kind: "x", declared: true, accepts: [] }] } });
    expect(await fetchTaskKinds()).toBeNull();
  });

  it("composed:false reads as unreachable, not an empty menu", async () => {
    mockGet.mockResolvedValue({ data: { composed: false, kinds: {} } });
    expect(await fetchTaskKinds()).toBeNull();
  });

  it("a rejected request reads as unreachable", async () => {
    mockGet.mockRejectedValue(new Error("network down"));
    expect(await fetchTaskKinds()).toBeNull();
  });
});
