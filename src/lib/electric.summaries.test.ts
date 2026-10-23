/**
 * The summaries-mode shape asks Electric for no body column, and `must-refetch` re-reads page 1.
 * The ShapeStream constructor is mocked, so what is asserted is what would go on the wire.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const constructed: Array<{ params?: Record<string, unknown> }> = [];
let deliver: (msgs: unknown[]) => void = () => {};
vi.mock("@electric-sql/client", () => ({
  ShapeStream: class {
    constructor(opts: { params?: Record<string, unknown> }) {
      constructed.push(opts);
    }
    subscribe(cb: (m: unknown[]) => void) {
      deliver = cb;
      return () => {};
    }
  },
  isChangeMessage: (m: { value?: unknown }) => m.value !== undefined,
  isControlMessage: (m: { headers?: { control?: string } }) => m.headers?.control !== undefined,
}));
vi.mock("@/config", () => ({ config: { VITE_API_URL: "https://bff.example" }, readRuntimeConfig: () => undefined }));
const loadFirstAnswersPage = vi.fn(() => Promise.resolve());
vi.mock("@/lib/answersPaging", () => ({ loadFirstAnswersPage: () => loadFirstAnswersPage() }));

import { startArtifactsSubscription, ANSWER_SUMMARY_COLUMNS } from "./electric";
import { useCanvasStore } from "@/store/useCanvasStore";
import { INITIAL_ANSWER_PAGING } from "./electricApply";

const BODY_COLUMNS = ["rendered_output", "routing", "resolved_intent", "sources", "graph_trace", "graph_trace_alternates"];
const flush = () => new Promise((r) => setTimeout(r, 0));

beforeEach(() => {
  constructed.length = 0;
  loadFirstAnswersPage.mockClear();
  vi.spyOn(console, "info").mockImplementation(() => {});
});
afterEach(() => {
  window.localStorage.removeItem("cortex.answerSummaries");
  useCanvasStore.getState().clearCanvas();
  vi.restoreAllMocks();
});

describe("the answers shape's params", () => {
  it("summaries mode asks Electric for no body column", async () => {
    window.localStorage.setItem("cortex.answerSummaries", "1");
    const stop = startArtifactsSubscription("tok");
    await flush();
    const cols = constructed[0]!.params!.columns as string[];
    expect(cols).toContain("id");
    for (const c of BODY_COLUMNS) expect(cols, c).not.toContain(c);
    expect(cols).toEqual([...ANSWER_SUMMARY_COLUMNS]);
    stop();
  });

  it("flag off sends no columns param, and starts without waiting for a page", () => {
    const stop = startArtifactsSubscription("tok");
    expect(constructed).toHaveLength(1);
    expect(constructed[0]!.params).not.toHaveProperty("columns");
    expect(loadFirstAnswersPage).not.toHaveBeenCalled();
    stop();
  });
});

describe("must-refetch", () => {
  it("clears bodies and paging and refetches page 1", async () => {
    window.localStorage.setItem("cortex.answerSummaries", "1");
    const stop = startArtifactsSubscription("tok");
    await flush();
    expect(loadFirstAnswersPage).toHaveBeenCalledTimes(1);
    useCanvasStore.setState({
      bodies: { a: "loaded" },
      answerPaging: { status: "loaded", loaded: 50, total: 900, nextPage: 2, frontier: 5 },
    });
    deliver([{ headers: { control: "must-refetch" } }]);
    expect(useCanvasStore.getState().bodies).toEqual({});
    expect(useCanvasStore.getState().answerPaging).toEqual(INITIAL_ANSWER_PAGING);
    expect(loadFirstAnswersPage).toHaveBeenCalledTimes(2);
    stop();
  });
});
