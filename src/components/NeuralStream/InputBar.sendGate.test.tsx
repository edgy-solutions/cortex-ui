/** Ruling 2026-11-16: no question until the entitlement list has loaded. */
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, cleanup, act, fireEvent } from "@testing-library/react";

const sendMessage = vi.fn();
vi.mock("@/hooks/useAgent", () => ({
  useAgent: () => ({ sendMessage, isConnected: true, isProcessing: false }),
}));
vi.mock("@/hooks/useComposerDraft", async () => {
  const React = await import("react");
  return {
    useComposerDraft: () => {
      const [value, setValue] = React.useState("a question");
      return { value, setValue, clearDraft: () => setValue("") };
    },
  };
});
vi.mock("@/components/PersonaPicker", () => ({ PersonaPicker: () => null }));
vi.mock("@/store/useInterviewStore", () => ({
  useInterviewStore: (sel: (s: { phase: string }) => unknown) => sel({ phase: "active" }),
}));
vi.mock("@/lib/ingestFlag", () => ({ isIngestUiEnabled: () => false }));
vi.mock("react-oidc-context", () => ({ useAuth: () => ({ user: null }) }));

import { InputBar } from "./InputBar";
import { usePersonaStore } from "@/store/usePersonaStore";

const LOADED = { user_id: "u", source: "topaz", default: null, cells: [] };
const put = (over: Record<string, unknown>) => act(() => usePersonaStore.setState(over as never));
const btn = (c: HTMLElement) => c.querySelector('button[type="submit"]') as HTMLButtonElement;
const blocked = (c: HTMLElement) => c.querySelector("[data-send-blocked]");
const input = (c: HTMLElement) => c.querySelector('input[type="text"]') as HTMLInputElement;

beforeEach(() => {
  usePersonaStore.setState({
    entitlements: null,
    entitlementsError: null,
    entitlementsLoading: true,
    selectedPersona: null,
    selectedDomains: [],
  } as never);
});
afterEach(() => {
  cleanup();
  sendMessage.mockReset();
});

describe("InputBar send gate", () => {
  it("while loading: button disabled and the loading line shown", () => {
    const { container } = render(<InputBar />);
    expect(btn(container).disabled).toBe(true);
    expect(blocked(container)?.textContent).toMatch(/still loading/);
  });

  it("a failed load says so, with the error", () => {
    const { container } = render(<InputBar />);
    put({ entitlementsError: "HTTP 503", entitlementsLoading: false });
    expect(blocked(container)?.textContent).toContain("HTTP 503");
    expect(btn(container).disabled).toBe(true);
  });

  it("when the load finishes the line goes and the button enables, draft intact", () => {
    const { container } = render(<InputBar />);
    expect(input(container).value).toBe("a question");
    put({ entitlements: LOADED, entitlementsLoading: false });
    expect(blocked(container)).toBeNull();
    expect(btn(container).disabled).toBe(false);
    expect(input(container).value).toBe("a question");
  });

  it("a refused send keeps the draft; a sent one clears it", () => {
    put({ entitlements: LOADED, entitlementsLoading: false });
    const { container } = render(<InputBar />);
    sendMessage.mockReturnValueOnce({ notSent: "nope" });
    fireEvent.submit(container.querySelector("form")!);
    expect(input(container).value).toBe("a question");
    sendMessage.mockReturnValueOnce(true);
    fireEvent.submit(container.querySelector("form")!);
    expect(input(container).value).toBe("");
  });
});
