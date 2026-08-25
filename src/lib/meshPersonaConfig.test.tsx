/**
 * The property under test is not "config loads" — it is that N cards produce ONE request.
 *
 * A session with seventy answers mounts seventy `SemanticInterpreter`s, each of which calls
 * `useMeshConfig`. Before this fix that was ~seventy simultaneous `GET /mesh/config` for a
 * payload that is global, immutable and identical for all of them — enough fan-out to saturate
 * cortex-bff's event loop, make `/health` miss its readiness window, and get the pod pulled
 * from the service endpoints, at which point the edge answered 404 with no CORS headers.
 *
 * Note what a single-mount test would prove: nothing. "One fetch" is trivially true for one
 * mount whether or not a cache exists, so the guard has to mount MANY. That is the assertion
 * the red-proof bites on.
 *
 * The failure direction matters as much as the success one. A rejected promise parked in the
 * cache slot would poison it for the session — every later card awaiting a minutes-old failure
 * with no path back short of a reload, which is the fetch-once-never-retry trap in a new
 * costume. So a failed wave must leave the next mount able to try again.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";

const getMeshConfig = vi.fn();
vi.mock("@/api/client", () => ({ getMeshConfig: () => getMeshConfig() }));

import { useMeshConfig, __resetMeshConfigCache } from "./meshPersonaConfig";

beforeEach(() => {
  getMeshConfig.mockReset();
  __resetMeshConfigCache();
});

describe("useMeshConfig — one fetch per session, not one per card", () => {
  it("SEVENTY mounts issue ONE request — the fan-out that took the backend down", () => {
    // Seventy is not arbitrary: it is the answer count in the session where this fired.
    getMeshConfig.mockResolvedValue({ personas: { DATA_STEWARD: { label: "Steward" } } });

    const hooks = Array.from({ length: 70 }, () => renderHook(() => useMeshConfig()));

    expect(getMeshConfig).toHaveBeenCalledTimes(1);
    hooks.forEach((h) => h.unmount());
  });

  it("every caller receives the shared result, not just the one that fetched", () => {
    // Sharing a request is only correct if it also shares the answer. A cache that fetched once
    // and resolved one caller would trade a storm for a bug.
    getMeshConfig.mockResolvedValue({ personas: { DATA_STEWARD: { label: "Steward" } } });

    const a = renderHook(() => useMeshConfig());
    const b = renderHook(() => useMeshConfig());

    return waitFor(() => {
      expect(a.result.current.personaConfig).toEqual({ DATA_STEWARD: { label: "Steward" } });
      expect(b.result.current.personaConfig).toEqual({ DATA_STEWARD: { label: "Steward" } });
    });
  });

  it("a FAILED wave does not poison the cache — the next mount tries again", async () => {
    // The self-sealing trap, guarded. If the rejected promise stayed in the slot, every card
    // mounted after a transient failure would await that failure forever.
    getMeshConfig.mockRejectedValueOnce(new Error("network"));
    const first = renderHook(() => useMeshConfig());
    await waitFor(() => expect(getMeshConfig).toHaveBeenCalledTimes(1));
    first.unmount();

    getMeshConfig.mockResolvedValue({ personas: { OK: { label: "Recovered" } } });
    const second = renderHook(() => useMeshConfig());

    await waitFor(() => {
      expect(getMeshConfig).toHaveBeenCalledTimes(2);
      expect(second.result.current.personaConfig).toEqual({ OK: { label: "Recovered" } });
    });
  });

  it("cards mounting DURING a failing request still share it — the bound is per WAVE", () => {
    // "At most once" means once per attempt-wave, not one retry per session. Ten cards mounting
    // while one request is in flight must not become ten requests just because it will fail.
    getMeshConfig.mockRejectedValue(new Error("network"));

    const hooks = Array.from({ length: 10 }, () => renderHook(() => useMeshConfig()));

    expect(getMeshConfig).toHaveBeenCalledTimes(1);
    hooks.forEach((h) => h.unmount());
  });

  it("renders an empty config rather than throwing when the fetch fails", async () => {
    // Honest-empty: the persona colouring degrades, the card still draws. A config failure must
    // not take the answer surface with it.
    getMeshConfig.mockRejectedValue(new Error("network"));
    const r = renderHook(() => useMeshConfig());
    await waitFor(() => expect(getMeshConfig).toHaveBeenCalled());
    expect(r.result.current.personaConfig).toEqual({});
  });
});
