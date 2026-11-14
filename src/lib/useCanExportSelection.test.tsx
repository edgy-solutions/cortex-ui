import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { renderHook, cleanup, act } from "@testing-library/react";

const fetchEntitlements = vi.fn();
vi.mock("@/api/client", () => ({
  fetchEntitlements: (...a: unknown[]) => fetchEntitlements(...a),
  fetchIngestExportProfiles: vi.fn(),
}));

import { useCanExportSelection } from "./useCanExportSelection";
import { usePersonaStore } from "@/store/usePersonaStore";

// The control READS the store the session owner fills; it never touches the wire (see entitlementsRefresh.test.tsx).
beforeEach(() => {
  window.localStorage.clear();
  usePersonaStore.setState({ entitlements: null });
});
afterEach(() => {
  cleanup();
  window.localStorage.clear();
  usePersonaStore.setState({ entitlements: null });
  vi.clearAllMocks();
});

describe("useCanExportSelection", () => {
  it("flag off: false, and nothing is fetched", async () => {
    usePersonaStore.setState({ entitlements: { capabilities: ["ingest:exportBatch"] } as never });
    const { result } = renderHook(() => useCanExportSelection());
    await new Promise((r) => setTimeout(r, 20));
    expect(result.current).toBe(false);
    expect(fetchEntitlements).not.toHaveBeenCalled();
  });
  it("flag on and the capability present in the store: true", () => {
    window.localStorage.setItem("cortex.reviewExport", "1");
    usePersonaStore.setState({ entitlements: { capabilities: ["ingest:exportBatch"] } as never });
    const { result } = renderHook(() => useCanExportSelection());
    expect(result.current).toBe(true);
  });
  it("flag on and no matrix in the store (the first read failed or has not landed): false", async () => {
    window.localStorage.setItem("cortex.reviewExport", "1");
    const { result } = renderHook(() => useCanExportSelection());
    await new Promise((r) => setTimeout(r, 20));
    expect(result.current).toBe(false);
    expect(fetchEntitlements).not.toHaveBeenCalled();
  });
  it("follows the store: the matrix landing later flips it true", () => {
    window.localStorage.setItem("cortex.reviewExport", "1");
    const { result } = renderHook(() => useCanExportSelection());
    expect(result.current).toBe(false);
    act(() => usePersonaStore.setState({ entitlements: { capabilities: ["ingest:exportBatch"] } as never }));
    expect(result.current).toBe(true);
  });
});
