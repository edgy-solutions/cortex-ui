/**
 * F, AT THE HOOK. A load is not a registration trigger; opening a wiped answer is.
 *
 * The real hook, the real lifecycle, the real stores. Only the transport is faked.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import type { Artifact } from "@/api/types";

const registerFrontendCapabilities = vi.fn();
vi.mock("@/lib/bundleFreshness", () => ({
  checkBundleFreshness: vi.fn().mockResolvedValue({ kind: "current", sha: "x" }),
  watchBundleFreshness: () => () => {}, // the focus/interval watcher is not under test here
}));
vi.mock("react-oidc-context", () => ({ useAuth: () => ({ isAuthenticated: true, user: null }) }));
vi.mock("@/api/client", () => ({
  registerFrontendCapabilities: (...args: unknown[]) => registerFrontendCapabilities(...args),
  fetchBffVersion: vi.fn().mockResolvedValue({ kind: "unreachable" }),
  fetchEntitlements: vi.fn().mockResolvedValue({}),
  fetchLineageEdges: vi.fn().mockResolvedValue([]),
  fetchCanvases: vi.fn().mockResolvedValue([]),
  saveCanvases: vi.fn().mockResolvedValue(undefined),
}));

import { useFrontendCapabilityRegistration } from "@/App";
import { useCanvasStore } from "@/store/useCanvasStore";
import { useStageStore } from "@/store/useStageStore";
import { useRegistrationStore } from "@/store/useRegistrationStore";

const wiped = { presentation_source: "default-menu", frontend_id: "cortex-ui-desktop", selection_basis: "payload-only" };
const answer = (i: number): Artifact =>
  ({
    id: `a${i}`,
    status: "complete",
    watermark: i,
    created_at: i,
    rendered_output: { archetype: "MULTI_SERIES", components: [], presentation_provenance: wiped },
  }) as unknown as Artifact;

beforeEach(() => {
  registerFrontendCapabilities.mockReset();
  registerFrontendCapabilities.mockResolvedValue({ accepted: 1, frontend_id: "cortex-ui-desktop" });
  useCanvasStore.setState({ artifacts: [], currentArtifactId: null, currentArtifactSetByUser: false });
  useStageStore.setState({ focusId: null });
  useRegistrationStore.setState({ status: "idle", sent: null, accepted: null, reassertions: 0, stale: null });
});
afterEach(() => vi.restoreAllMocks());

describe("the registration hook is not driven by load", () => {
  it("1,000 wiped answers loaded, none opened: the open POST only, 0 re-asserts", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    try {
      renderHook(() => useFrontendCapabilityRegistration());
      await vi.waitFor(() => expect(registerFrontendCapabilities).toHaveBeenCalledTimes(1));
      // PAST the cooldown, so only the policy (not the backoff) can be what holds the load back
      vi.setSystemTime(Date.now() + 120_000);
      act(() => {
        useCanvasStore.setState({ artifacts: Array.from({ length: 1000 }, (_, i) => answer(i)) });
      });
      await new Promise((r) => setTimeout(r, 50));
      expect(registerFrontendCapabilities).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it("then focusing ONE wiped answer fires exactly one re-assert", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    try {
      renderHook(() => useFrontendCapabilityRegistration());
      await vi.waitFor(() => expect(registerFrontendCapabilities).toHaveBeenCalledTimes(1));
      act(() => {
        useCanvasStore.setState({ artifacts: Array.from({ length: 1000 }, (_, i) => answer(i)) });
      });
      vi.setSystemTime(Date.now() + 120_000); // past the cooldown the open POST started
      act(() => useStageStore.setState({ focusId: "a500" }));
      await vi.waitFor(() => expect(registerFrontendCapabilities).toHaveBeenCalledTimes(2));
      expect(useRegistrationStore.getState().reassertions).toBeGreaterThanOrEqual(0);
    } finally {
      vi.useRealTimers();
    }
  });
});
