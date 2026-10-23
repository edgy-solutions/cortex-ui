import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { renderHook, act, waitFor, cleanup } from "@testing-library/react";

const fetchAnswerBody = vi.fn();
vi.mock("@/api/client", async (orig) => ({
  ...(await orig<typeof import("@/api/client")>()),
  fetchAnswerBody: (...a: unknown[]) => fetchAnswerBody(...a),
}));

import { useOpenedAnswerBody } from "./useOpenedAnswerBody";
import { useCanvasStore } from "@/store/useCanvasStore";
import { readAnswersPage, summaryToArtifact } from "./answersWire";

const stub = () =>
  summaryToArtifact(
    readAnswersPage({
      items: [{ id: "a-1", ts: 1790860800000, title: "q", summary: "s", type: "answer", status: "complete", subject: null, archived: false }],
      page: 1, size: 50, total: 1,
    })!.items[0]!,
  );

beforeEach(() => {
  window.localStorage.setItem("cortex.answerSummaries", "1");
  fetchAnswerBody.mockReset();
  useCanvasStore.setState({ artifacts: [stub()], bodies: {} });
});
afterEach(() => {
  cleanup();
  window.localStorage.removeItem("cortex.answerSummaries");
  useCanvasStore.setState({ artifacts: [], bodies: {} });
});

describe("useOpenedAnswerBody", () => {
  it("reads the opened answer's body once, shows loading, then the body lands", async () => {
    let resolve!: (v: unknown) => void;
    fetchAnswerBody.mockReturnValue(new Promise((r) => (resolve = r)));
    const { result } = renderHook(() => useOpenedAnswerBody(useCanvasStore.getState().artifacts[0]!));
    expect(result.current.view).toBe("loading");
    expect(fetchAnswerBody).toHaveBeenCalledTimes(1);
    await act(async () => {
      resolve({ id: "a-1", rendered_output: { components: [] }, routing: { fallback: true }, resolved_intent: {} });
    });
    await waitFor(() => expect(useCanvasStore.getState().bodies["a-1"]).toBe("loaded"));
    expect(useCanvasStore.getState().artifacts[0]!.rendered_output).toEqual({ components: [] });
    expect(fetchAnswerBody).toHaveBeenCalledTimes(1);
  });

  it("a failed read says failed, and Retry reads again", async () => {
    // Any read after the first hangs, so a failed read that re-fired itself is counted, not looped forever.
    fetchAnswerBody.mockRejectedValueOnce(new Error("503")).mockReturnValue(new Promise(() => {}));
    const seen: string[] = [];
    const unsub = useCanvasStore.subscribe((s) => seen.push(s.bodies["a-1"] ?? "absent"));
    const { result } = renderHook(() => useOpenedAnswerBody(useCanvasStore.getState().artifacts[0]!));
    await waitFor(() => expect(seen).toContain("failed"));
    await act(async () => {
      for (let i = 0; i < 20; i++) await Promise.resolve();
    });
    unsub();
    // A failed read must not re-fire itself: only Retry reads again.
    expect(fetchAnswerBody).toHaveBeenCalledTimes(1);
    expect(useCanvasStore.getState().bodies["a-1"]).toBe("failed");
    fetchAnswerBody.mockResolvedValueOnce({ id: "a-1", rendered_output: { components: [] }, routing: { fallback: true }, resolved_intent: {} });
    await act(async () => result.current.retry());
    await waitFor(() => expect(useCanvasStore.getState().bodies["a-1"]).toBe("loaded"));
    expect(fetchAnswerBody).toHaveBeenCalledTimes(2);
  });

  it("flag off: nothing is read and there is no view", () => {
    window.localStorage.removeItem("cortex.answerSummaries");
    const { result } = renderHook(() => useOpenedAnswerBody(useCanvasStore.getState().artifacts[0]!));
    expect(result.current.view).toBeNull();
    expect(fetchAnswerBody).not.toHaveBeenCalled();
  });
});
