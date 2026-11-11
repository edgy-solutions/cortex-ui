import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, cleanup, waitFor } from "@testing-library/react";

const fetchEntitlements = vi.fn();
vi.mock("@/api/client", () => ({
  fetchEntitlements: (...a: unknown[]) => fetchEntitlements(...a),
  fetchIngestExportProfiles: vi.fn(),
  downloadIngestExport: vi.fn(),
}));

import { useCanExportSelection } from "./useCanExportSelection";

beforeEach(() => window.localStorage.clear());
afterEach(() => {
  cleanup();
  window.localStorage.clear();
  vi.clearAllMocks();
});

describe("useCanExportSelection", () => {
  it("flag off: false, and nothing is fetched", async () => {
    const { result } = renderHook(() => useCanExportSelection());
    await new Promise((r) => setTimeout(r, 20));
    expect(result.current).toBe(false);
    expect(fetchEntitlements).not.toHaveBeenCalled();
  });
  it("flag on and the capability present: true", async () => {
    window.localStorage.setItem("cortex.reviewExport", "1");
    fetchEntitlements.mockResolvedValue({ capabilities: ["ingest:exportBatch"] });
    const { result } = renderHook(() => useCanExportSelection());
    await waitFor(() => expect(result.current).toBe(true));
  });
  it("flag on and the read rejecting: false", async () => {
    window.localStorage.setItem("cortex.reviewExport", "1");
    fetchEntitlements.mockRejectedValue(new Error("down"));
    const { result } = renderHook(() => useCanExportSelection());
    await waitFor(() => expect(fetchEntitlements).toHaveBeenCalled());
    await new Promise((r) => setTimeout(r, 20));
    expect(result.current).toBe(false);
  });
});
