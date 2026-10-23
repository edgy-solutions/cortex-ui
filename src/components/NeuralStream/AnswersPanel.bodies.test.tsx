/**
 * The seal (architect, overnight 10-23): with `answerSummaries` on, the list render requests no bodies.
 *
 * THE INSTRUMENT IS THE WIRE, NOT THE CLIENT FUNCTION. Every request leaves jsdom through
 * `XMLHttpRequest.open` (axios's adapter here) or `fetch`; both are recorded, so a body read that
 * bypassed `fetchAnswerBody` (a direct `fetch`, a second axios instance) is counted too. The control
 * proves the recorder sees a real `fetchAnswerBody`, so a zero below is a measurement, not a blind spot.
 *
 * Opening goes through the real `CanvasPane`, which is where an opened answer's body is read.
 */
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, cleanup, fireEvent, act, waitFor } from "@testing-library/react";
import type { Artifact } from "@/api/types";

vi.mock("./LiveAnswerStrip", () => ({ LiveAnswerStrip: () => null }));
vi.mock("./useLiveStages", () => ({ useLiveStages: () => ({ active: false }) }));

import { AnswersPanel } from "./AnswersPanel";
import { CanvasPane } from "@/components/AgenticCanvas/CanvasPane";
import { useCanvasStore } from "@/store/useCanvasStore";
import { useAnswerPanelStore } from "@/store/useAnswerPanelStore";
import { readAnswersPage, summaryToArtifact } from "@/lib/answersWire";
import { fetchAnswerBody } from "@/api/client";

const BODY = /\/answers\/[^/?#]+\/body(?:[?#]|$)/;
let urls: string[] = [];
// A fresh id prefix per test: the recorder never answers, so a read stays in `ensureBody`'s module-level
// in-flight set for the rest of the file, and a reused id would be skipped there instead of reaching the wire.
let run = 0;
const id = (i: number) => `ans-${run}-${i}`;
const bodyReads = () => urls.filter((u) => BODY.test(u));
// axios dispatches after its interceptor chain (microtasks), so a count is read only after the queue drains.
const drain = () =>
  act(async () => {
    for (let i = 0; i < 20; i++) await Promise.resolve();
  });

const NOW = Date.UTC(2026, 9, 10, 12, 0, 0);
const stubs = (n: number): Artifact[] => {
  const page = readAnswersPage({
    items: Array.from({ length: n }, (_, i) => ({
      id: id(i), ts: NOW - i * 60_000 * 7, title: `question ${i}`, summary: `summary ${i}`, type: "answer",
      status: "complete", subject: { uri: `urn:s:${i % 50}`, label: `Topic ${i % 9}` }, archived: false,
    })),
    page: 1, size: 50, total: n,
  })!;
  return page.items.map(summaryToArtifact);
};
const rowFor = (n: number) =>
  [...document.querySelectorAll("[data-virtual-item]")].find((e) => e.textContent!.includes(`summary ${n}`) && !e.textContent!.includes(`summary ${n}0`)) as HTMLElement;
const press = (n: number) => {
  const target = rowFor(n).querySelector("p") as HTMLElement;
  fireEvent.pointerDown(target, { button: 0, clientX: 5, clientY: 5 });
  fireEvent.pointerUp(document, { clientX: 5, clientY: 5 });
};

beforeEach(() => {
  urls = [];
  run++;
  window.localStorage.setItem("cortex.answerSummaries", "1");
  // Record, then open for real (axios sets headers next); `send` is a no-op, so no request ever answers
  // and nothing downstream can mask a read.
  const open = XMLHttpRequest.prototype.open as (...a: unknown[]) => void;
  vi.spyOn(XMLHttpRequest.prototype, "open").mockImplementation(function (this: XMLHttpRequest, ...a: unknown[]) {
    urls.push(String(a[1]));
    open.apply(this, a);
  } as never);
  vi.spyOn(XMLHttpRequest.prototype, "send").mockImplementation(() => {});
  vi.spyOn(globalThis, "fetch").mockImplementation((input: RequestInfo | URL) => {
    urls.push(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
    return new Promise<Response>(() => {});
  });
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  window.localStorage.removeItem("cortex.answerSummaries");
  useCanvasStore.setState({ artifacts: [], currentArtifactId: null, bodies: {} });
  useAnswerPanelStore.setState({ sortMode: "TIME", search: "" });
});

describe("the list render requests no bodies", () => {
  it("control: the recorder sees a body read made through the client", async () => {
    void fetchAnswerBody("ans-x");
    await drain();
    expect(bodyReads()).toHaveLength(1);
    expect(bodyReads()[0]).toMatch(/\/answers\/ans-x\/body$/);
  });

  for (const mode of ["TIME", "TOPIC", "TYPE", "GRAPH"] as const) {
    it(`${mode}: rendering 50 body-less rows requests no body`, async () => {
      useAnswerPanelStore.setState({ sortMode: mode });
      useCanvasStore.setState({ artifacts: stubs(50) });
      render(<AnswersPanel />);
      expect(document.querySelectorAll("[data-virtual-item]").length).toBeGreaterThan(0);
      await drain();
      expect(bodyReads()).toEqual([]);
      expect(useCanvasStore.getState().bodies).toEqual({});
    });
  }

  it("opening one answer requests exactly its body, and opening it again requests nothing more", async () => {
    useCanvasStore.setState({ artifacts: stubs(50) });
    render(
      <>
        <AnswersPanel />
        <CanvasPane />
      </>,
    );
    await drain();
    expect(bodyReads()).toEqual([]);
    press(3);
    expect(useCanvasStore.getState().currentArtifactId).toBe(id(3));
    await waitFor(() => expect(bodyReads()).toHaveLength(1));
    expect(bodyReads()[0].endsWith(`/answers/${id(3)}/body`)).toBe(true);
    press(3);
    await drain();
    expect(bodyReads()).toHaveLength(1);
  });

  it("searching the rail requests no body", async () => {
    vi.useFakeTimers();
    try {
      useCanvasStore.setState({ artifacts: stubs(50) });
      render(
        <>
          <AnswersPanel />
          <CanvasPane />
        </>,
      );
      act(() => useAnswerPanelStore.getState().setSearch("summary 4"));
      await act(async () => {
        vi.advanceTimersByTime(400);
      });
      await drain();
      // The search DID go to the server (so this arm is not passing on a dead search box)...
      expect(urls.some((u) => /\/answers\?/.test(u) && /q=summary/.test(u))).toBe(true);
      // ...and asked for no body.
      expect(bodyReads()).toEqual([]);
    } finally {
      vi.useRealTimers();
    }
  });
});
