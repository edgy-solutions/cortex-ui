/**
 * THE WIRING, WHICH IS WHERE THESE ACTUALLY BREAK.
 *
 * ── WHY THIS FILE EXISTS ──────────────────────────────────────────────────────────────────
 *
 * The store classifies correctly and the badge renders four distinct states, both verified by
 * mutation. Then two mutations deleted the calls that connect them — the `report` on success
 * and the `reportFailure` on error — and BOTH SURVIVED. The badge would have sat at "…" for the
 * life of every session, showing nothing, and the entire suite stayed green.
 *
 * That is the third time this exact shape has shipped here: three of five `<SemanticInterpreter>`
 * call sites left unthreaded so `answering_artifact_id` was never posted; a section mounted on
 * the one branch that never renders; and now a signal published by nobody. The helpers are
 * always fine. The wiring is what is missing, and a test that mocks the seam it is checking
 * cannot see it — whatever you mock, you have stopped testing.
 *
 * So the transport is faked and everything above it is real: the actual hook, the actual
 * assembler, the actual store.
 *
 * ── AND ONE THING DELIBERATELY NOT ASSERTED ───────────────────────────────────────────────
 *
 * Not the COUNT of capability rows. That number changes every time a binding lands, and a test
 * pinning it would be edited to match on every one of those days until somebody edited it to
 * match a day it should have failed. What matters is that whatever was sent is what gets
 * reported, so the assertion is the relationship, not the value.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";

const registerFrontendCapabilities = vi.fn();

vi.mock("react-oidc-context", () => ({
  useAuth: () => ({ isAuthenticated: true, user: null }),
}));
vi.mock("@/api/client", () => ({
  registerFrontendCapabilities: (...args: unknown[]) => registerFrontendCapabilities(...args),
  fetchBffVersion: vi.fn().mockResolvedValue({ kind: "unreachable" }),
  fetchEntitlements: vi.fn().mockResolvedValue({}),
  fetchLineageEdges: vi.fn().mockResolvedValue([]),
  fetchCanvases: vi.fn().mockResolvedValue([]),
  saveCanvases: vi.fn().mockResolvedValue(undefined),
}));

import { useFrontendCapabilityRegistration } from "@/App";
import { useRegistrationStore } from "@/store/useRegistrationStore";

beforeEach(() => {
  registerFrontendCapabilities.mockReset();
  useRegistrationStore.setState({ status: "idle", sent: null, accepted: null, reassertions: 0 });
});
afterEach(() => vi.restoreAllMocks());

const state = () => useRegistrationStore.getState();

describe("the registration publishes what the server said", () => {
  it("reports AGREEMENT when the server kept everything", async () => {
    // The relationship, not the number: whatever the hook offered is what must be reported.
    let offered = 0;
    registerFrontendCapabilities.mockImplementation((payload: { capabilities: unknown[] }) => {
      offered = payload.capabilities.length;
      return Promise.resolve({ accepted: offered, frontend_id: "cortex-ui-desktop" });
    });

    renderHook(() => useFrontendCapabilityRegistration());

    await waitFor(() => expect(state().status).toBe("agreed"));
    expect(state().sent).toBe(offered);
    expect(state().accepted).toBe(offered);
    expect(offered).toBeGreaterThan(0); // the assembler produced a real payload
  });

  it("reports the MISMATCH when the server kept fewer — the whole point", async () => {
    // The failure this badge exists for: a shorter menu draws a plausible wrong card later,
    // with nothing thrown and nothing blank.
    registerFrontendCapabilities.mockImplementation((payload: { capabilities: unknown[] }) =>
      Promise.resolve({ accepted: payload.capabilities.length - 1, frontend_id: "x" }),
    );

    renderHook(() => useFrontendCapabilityRegistration());

    await waitFor(() => expect(state().status).toBe("partial"));
    expect(state().accepted).toBe((state().sent ?? 0) - 1);
  });

  it("reports a FAILED request as failed, never as a partial acceptance", async () => {
    // Nothing was established either way. The repair is a retry, not a hunt for a refused row.
    registerFrontendCapabilities.mockRejectedValue(new Error("network"));

    renderHook(() => useFrontendCapabilityRegistration());

    await waitFor(() => expect(state().status).toBe("failed"));
    expect(state().accepted).toBeNull();
  });

  it("leaves the badge at IDLE until something has actually happened", async () => {
    // The control. A hook that published on mount regardless would satisfy the three tests
    // above while reporting a result nobody had received.
    registerFrontendCapabilities.mockReturnValue(new Promise(() => {}));
    renderHook(() => useFrontendCapabilityRegistration());
    expect(state().status).toBe("idle");
  });

  it("sends the build's SHA as its version, not a placeholder", async () => {
    // Every registration this surface ever made recorded `frontend_version: "dev"` — the env
    // var it read is set nowhere in this repo. Server-side that is truthy, printable and
    // useless for saying which build advertised which menu.
    registerFrontendCapabilities.mockResolvedValue({ accepted: 0, frontend_id: "x" });
    renderHook(() => useFrontendCapabilityRegistration());
    await waitFor(() => expect(registerFrontendCapabilities).toHaveBeenCalled());
    const payload = registerFrontendCapabilities.mock.calls[0][0] as { frontend_version: string };
    expect(payload.frontend_version).not.toBe("dev");
    expect(payload.frontend_version).toBeTruthy();
  });
});
