/**
 * #595'S `answer_timing` AND `waiting`, FROM THE SSE TEXT TO THE STRIP.
 *
 * The architect (2026-11-27, via Chris): "#595 is approved, so its event shapes are final. Build
 * against the SSE text in its tests." The fixture is that text, composed line for line from #595's
 * emitters at 3efeaea4 (see its `origin`), in the orders #595's tests assert.
 *
 * Nothing between the text and the screen is mocked except the transport's socket: each block goes
 * through the real `parseSSE`, the real stream handler in `useInterviewAgent`, the real store, the
 * real `useLiveStages` and the real `LiveAnswerStrip`. Only Date and the interval are faked, so
 * react-query's microtasks still run.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, renderHook, act, cleanup } from "@testing-library/react";
import { createElement, type ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useInterviewStore } from "@/store/useInterviewStore";
import { useCanvasStore } from "@/store/useCanvasStore";
import { usePersonaStore } from "@/store/usePersonaStore";
import { parseSSE } from "@/api/client";
import { useInterviewAgent } from "@/hooks/useInterviewAgent";
import { LiveAnswerStrip } from "./LiveAnswerStrip";
import { deriveStages } from "./useLiveStages";

const transport = vi.hoisted(() => ({ onEvent: null as ((e: unknown) => void) | null }));

vi.mock("@/api/client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/api/client")>()),
  streamInterviewResponse: (_req: unknown, onEvent: (e: unknown) => void) =>
    new Promise<void>(() => {
      transport.onEvent = onEvent;
    }),
  healthCheck: async () => true,
}));

const FIXTURE = JSON.parse(
  readFileSync(
    path.join(__dirname, "../../../fixtures/captures/2026-11-27-sse-answer-timing-pr595-3efeaea4.json"),
    "utf8",
  ),
) as { sse: Record<"run_path" | "queued_then_admitted" | "admission_queue" | "nothing_served", string> };

/** Split SSE text into (event, data) blocks, as the wire frames them. */
function blocks(text: string): { event: string; data: string }[] {
  return text
    .split("\n\n")
    .filter((b) => b.trim())
    .map((b) => {
      const line = (k: string) =>
        b.split("\n").find((l) => l.startsWith(`${k}: `))!.slice(k.length + 2);
      return { event: line("event"), data: line("data") };
    });
}

const wrapper = ({ children }: { children: ReactNode }) =>
  createElement(QueryClientProvider, { client: new QueryClient() }, children);

const flush = async () => {
  for (let i = 0; i < 10; i++) await Promise.resolve();
};

async function startTurn() {
  const hook = renderHook(() => useInterviewAgent(), { wrapper });
  const strip = render(<LiveAnswerStrip />);
  await act(async () => {
    hook.result.current.sendMessage("what is the burn rate on lot 4?");
    await flush();
  });
  expect(transport.onEvent).not.toBeNull();
  return strip.container;
}

function feed(text: string, upTo = Infinity) {
  blocks(text)
    .slice(0, upTo)
    .forEach(({ event, data }) => {
      const parsed = parseSSE(event, data);
      act(() => {
        if (parsed) transport.onEvent!(parsed);
      });
    });
}

const tick = (ms: number) =>
  act(() => {
    vi.advanceTimersByTime(ms);
  });

const q = (c: HTMLElement, sel: string) => c.querySelector(sel)?.textContent ?? null;
/** The rows the strip draws from, in drawing order. */
const drawn = () =>
  deriveStages(
    useInterviewStore.getState().messages.filter((m) => m.role === "agent").at(-1)?.thinkingSteps ?? [],
  ).map((r) => r.kind);

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date", "setInterval", "clearInterval"], now: new Date("2026-11-27T12:00:00Z") });
  usePersonaStore.setState({ entitlements: { user_id: "u", source: "topaz", default: null, cells: [] }, entitlementsError: null, entitlementsLoading: false, selectedPersona: null, selectedDomains: [] } as never);
  window.localStorage.clear();
  window.sessionStorage.clear();
  useInterviewStore.getState().reset();
  useCanvasStore.getState().clearCanvas();
  transport.onEvent = null;
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("parseSSE reads #595's answer_timing as sent", () => {
  it("the four keys, verbatim", () => {
    const b = blocks(FIXTURE.sse.run_path).find((x) => x.event === "answer_timing")!;
    expect(parseSSE(b.event, b.data)).toEqual({
      type: "answer_timing",
      run_id: "run-fail-1",
      elapsed_ms: 1800,
      expected_ms: 42000,
      deadline_ms: 901800,
    });
  });

  it("a served null stays null, and an absent time reads as null, never as zero", () => {
    const b = blocks(FIXTURE.sse.nothing_served).find((x) => x.event === "answer_timing")!;
    expect(parseSSE(b.event, b.data)).toMatchObject({ expected_ms: null, deadline_ms: null });
    expect(parseSSE("answer_timing", '{"run_id": "r", "elapsed_ms": 5}')).toMatchObject({
      expected_ms: null,
      deadline_ms: null,
    });
  });

  it("an event with no elapsed time is dropped rather than read as 0:00", () => {
    expect(parseSSE("answer_timing", '{"run_id": "r", "expected_ms": 42000}')).toBeNull();
  });
});

describe("the run path: waiting after understanding, then the timing judges the clock", () => {
  it("the clock restarts on the server's elapsed_ms, not the client's head start", async () => {
    const c = await startTurn();
    tick(5_000); // the client has counted 5 s before the stream speaks
    expect(q(c, "[data-live-elapsed]")).toBe("· 0:05");
    feed(FIXTURE.sse.run_path);
    // The server says 1.8 s since the answer's birth. 0:06 would be the client's own clock.
    expect(q(c, "[data-live-elapsed]")).toBe("· 0:01");
    expect(drawn().slice(0, 3)).toEqual(["understanding", "waiting", "locating"]);
    expect(c.textContent).toContain("Locating the subject");
  });

  it("under E it judges nothing; from E it says longer than usual; from 2E the stalled line", async () => {
    const c = await startTurn();
    feed(FIXTURE.sse.run_path); // elapsed 1.8 s, E = 42 s (#595's EXPECTED), D = 901.8 s
    tick(40_000); // 41.8 s
    expect(q(c, "[data-live-timing]")).toBeNull();
    tick(250); // 42.05 s: at E
    expect(q(c, '[data-live-timing="long"]')).toBe("— longer than usual (usually under 0:50)");
    tick(42_000); // 84.05 s: past 2E
    expect(q(c, '[data-live-timing="long"]')).toBeNull();
    expect(q(c, '[data-live-timing="stalled"]')).toBe(
      "Still working after 1:24. Answers usually finish in under 0:50, so this one may be stuck. The server stops waiting at 15:01.",
    );
    // The stage and the clock are still drawn above it.
    expect(q(c, "[data-live-elapsed]")).toBe("· 1:24");
  });
});

describe("queued then admitted: the later timing wins, because the deadline moved", () => {
  it("restarts the clock on the second elapsed_ms and reads the moved deadline", async () => {
    const c = await startTurn();
    feed(FIXTURE.sse.queued_then_admitted); // second timing: elapsed 122.3 s, D 1021.8 s
    expect(q(c, "[data-live-elapsed]")).toBe("· 2:02");
    expect(q(c, '[data-live-timing="stalled"]')).toBe(
      "Still working after 2:02. Answers usually finish in under 0:50, so this one may be stuck. The server stops waiting at 17:01.",
    );
  });
});

describe("nothing served: elapsed only, however long", () => {
  it("an hour on, no judgement and no deadline", async () => {
    const c = await startTurn();
    feed(FIXTURE.sse.nothing_served);
    tick(3_600_000);
    expect(q(c, "[data-live-elapsed]")).toBe("· 60:01");
    expect(q(c, "[data-live-timing]")).toBeNull();
    expect(c.textContent).not.toMatch(/longer than usual|stuck|stops waiting/i);
  });
});

describe("the admission queue: waiting comes first, understanding starts after", () => {
  it("while queued the strip names the wait, not the seed's understanding", async () => {
    const c = await startTurn();
    feed(FIXTURE.sse.admission_queue, 2); // waiting started, answer_queued
    expect(c.textContent).toContain("Waiting to start");
    expect(c.textContent).not.toContain("Understanding your question");
  });

  it("admitted, it names understanding, with the wait drawn ahead of it", async () => {
    const c = await startTurn();
    feed(FIXTURE.sse.admission_queue);
    expect(c.textContent).toContain("Understanding your question");
    expect(c.textContent).toContain("Stage 2/6");
    expect(drawn().slice(0, 2)).toEqual(["waiting", "understanding"]);
  });
});
