import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";

const fetchAnswersPage = vi.fn();
const fetchAnswerBody = vi.fn();
vi.mock("@/api/client", async (orig) => ({
  ...(await orig<typeof import("@/api/client")>()),
  fetchAnswersPage: (...a: unknown[]) => fetchAnswersPage(...a),
  fetchAnswerBody: (...a: unknown[]) => fetchAnswerBody(...a),
}));

import { ensureBody, loadFirstAnswersPage, loadOlderAnswers, runAnswerSearch } from "./answersPaging";
import { useCanvasStore } from "@/store/useCanvasStore";
import { INITIAL_ANSWER_PAGING } from "./electricApply";

const T0 = 1790860800000;
const raw = (page: number, n: number, total: number, prefix = "a") => ({
  items: Array.from({ length: n }, (_, i) => {
    const k = (page - 1) * 50 + i;
    return { id: `${prefix}-${k}`, ts: T0 - k * 60_000, title: `q ${k}`, summary: `s ${k}`, type: "answer", status: "complete", subject: null, archived: false };
  }),
  page, size: 50, total,
});
const ids = () => useCanvasStore.getState().artifacts.map((a) => a.id);

beforeEach(() => {
  fetchAnswersPage.mockReset();
  fetchAnswerBody.mockReset();
  useCanvasStore.setState({ artifacts: [], bodies: {}, answerPaging: INITIAL_ANSWER_PAGING, answerSearch: null });
});
afterEach(() => {
  useCanvasStore.setState({ artifacts: [], bodies: {}, answerPaging: INITIAL_ANSWER_PAGING, answerSearch: null });
});

describe("loadOlderAnswers: a failed page keeps what was read", () => {
  it("unfiltered: page 2 fails, page 1's rows stay and the paging says failed; asking again reads page 2", async () => {
    fetchAnswersPage.mockResolvedValueOnce(raw(1, 50, 120));
    await loadFirstAnswersPage();
    expect(ids()).toHaveLength(50);
    fetchAnswersPage.mockRejectedValueOnce(new Error("503"));
    await loadOlderAnswers();
    expect(ids()).toHaveLength(50);
    expect(useCanvasStore.getState().answerPaging.status).toBe("failed");
    fetchAnswersPage.mockResolvedValueOnce(raw(2, 50, 120));
    await loadOlderAnswers();
    expect(fetchAnswersPage).toHaveBeenLastCalledWith({ page: 2, size: 50 });
    expect(ids()).toHaveLength(100);
  });

  it("search: page 2 fails, the search's rows stay and the search says failed", async () => {
    fetchAnswersPage.mockResolvedValueOnce(raw(1, 50, 80, "f"));
    await runAnswerSearch("pump");
    expect(useCanvasStore.getState().answerSearch?.ids).toHaveLength(50);
    fetchAnswersPage.mockRejectedValueOnce(new Error("503"));
    await loadOlderAnswers();
    expect(fetchAnswersPage).toHaveBeenLastCalledWith({ page: 2, size: 50, q: "pump" });
    expect(useCanvasStore.getState().answerSearch?.ids).toHaveLength(50);
    expect(useCanvasStore.getState().answerSearch?.status).toBe("failed");
    expect(ids()).toHaveLength(50);
  });
});

describe("ensureBody reads one answer once", () => {
  it("two asks while the first is in flight make one read", async () => {
    fetchAnswersPage.mockResolvedValueOnce(raw(1, 3, 3));
    await loadFirstAnswersPage();
    let resolve!: (v: unknown) => void;
    fetchAnswerBody.mockReturnValue(new Promise((r) => (resolve = r)));
    const first = ensureBody("a-1");
    const second = ensureBody("a-1");
    resolve({ id: "a-1", rendered_output: { components: [] }, routing: { fallback: true }, resolved_intent: {} });
    await Promise.all([first, second]);
    expect(fetchAnswerBody).toHaveBeenCalledTimes(1);
    expect(useCanvasStore.getState().bodies["a-1"]).toBe("loaded");
    await ensureBody("a-1");
    expect(fetchAnswerBody).toHaveBeenCalledTimes(1);
  });
});
