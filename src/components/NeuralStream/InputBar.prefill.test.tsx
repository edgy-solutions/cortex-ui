import { describe, it, expect, vi, afterEach } from "vitest";
import { render, cleanup, act } from "@testing-library/react";

const sendMessage = vi.fn();
vi.mock("@/hooks/useAgent", () => ({
  useAgent: () => ({ sendMessage, isConnected: true, isProcessing: false }),
}));
vi.mock("@/hooks/useComposerDraft", async () => {
  const React = await import("react");
  return {
    useComposerDraft: () => {
      const [value, setValue] = React.useState("old draft");
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
import { useComposerPrefillStore } from "@/store/useComposerPrefillStore";

afterEach(() => {
  cleanup();
  sendMessage.mockReset();
  useComposerPrefillStore.setState({ text: null });
});

describe("InputBar prefill", () => {
  it("types an offered question over the draft and sends nothing", () => {
    const { container } = render(<InputBar />);
    const input = container.querySelector('input[type="text"]') as HTMLInputElement;
    expect(input.value).toBe("old draft");
    act(() => useComposerPrefillStore.getState().offer("Why is X?"));
    expect(input.value).toBe("Why is X?");
    expect(useComposerPrefillStore.getState().text).toBeNull();
    expect(sendMessage).not.toHaveBeenCalled();
  });
  it("applies text offered before mount", () => {
    useComposerPrefillStore.getState().offer("early");
    const { container } = render(<InputBar />);
    expect((container.querySelector('input[type="text"]') as HTMLInputElement).value).toBe("early");
    expect(sendMessage).not.toHaveBeenCalled();
  });
});
