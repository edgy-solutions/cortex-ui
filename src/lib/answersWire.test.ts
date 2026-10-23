import { describe, it, expect } from "vitest";
import { readAnswersPage, readAnswerBody, summaryToArtifact, answerBodyPath } from "./answersWire";

const item = (over: Record<string, unknown> = {}) => ({
  id: "a-1", ts: 1790860800000, title: "what is x", summary: "x is 3", type: "answer", status: "complete",
  subject: { uri: "urn:s:1", label: "Aurora" }, archived: false, ...over,
});

describe("readAnswersPage", () => {
  it("accepts the page envelope and reads the items", () => {
    const p = readAnswersPage({ items: [item(), item({ id: "a-2", summary: null, subject: null })], page: 1, size: 50, total: 2 });
    expect(p).not.toBeNull();
    expect(p!.items.map((i) => i.id)).toEqual(["a-1", "a-2"]);
    expect(p!.items[1]!.summary).toBeNull();
    expect(p!.items[1]!.subject).toBeNull();
    expect([p!.page, p!.size, p!.total, p!.dropped]).toEqual([1, 50, 2, 0]);
  });

  it("an item without an id or a finite ts is dropped and counted", () => {
    const p = readAnswersPage({
      items: [item({ id: undefined }), item({ id: "ok" }), item({ id: "nots", ts: "x" }), item({ id: "inf", ts: Infinity })],
      page: 1, size: 50, total: 4,
    });
    expect(p!.items.map((i) => i.id)).toEqual(["ok"]);
    expect(p!.dropped).toBe(3);
  });

  it("a bad envelope is refused", () => {
    expect(readAnswersPage({ items: [], page: 1, size: 50, total: 2.5 })).toBeNull();
    expect(readAnswersPage({ items: [], page: 1, size: 50, total: "9" })).toBeNull();
    expect(readAnswersPage({ items: [], page: 1.2, size: 50, total: 0 })).toBeNull();
    expect(readAnswersPage({ page: 1, size: 50, total: 0 })).toBeNull();
    expect(readAnswersPage(null)).toBeNull();
  });
});

describe("readAnswerBody", () => {
  it("a body for the wrong id, or with none, is refused", () => {
    expect(readAnswerBody({ id: "other", rendered_output: {}, routing: null, resolved_intent: {} }, "a-1")).toBeNull();
    expect(readAnswerBody({ rendered_output: {} }, "a-1")).toBeNull();
  });

  it("resolved_intent defaults to {} and rendered_output/routing are object-or-null", () => {
    const b = readAnswerBody({ id: "a-1", rendered_output: "nope", routing: [1] }, "a-1");
    expect(b).toEqual({ id: "a-1", rendered_output: null, routing: null, resolved_intent: {} });
    const c = readAnswerBody({ id: "a-1", rendered_output: { components: [] }, routing: { fallback: true }, resolved_intent: { k: 1 } }, "a-1");
    expect(c!.rendered_output).toEqual({ components: [] });
    expect(c!.resolved_intent).toEqual({ k: 1 });
  });
});

describe("summaryToArtifact and the path", () => {
  it("builds a body-less durable stub from the summary; created_at is ts in ms", () => {
    const p = readAnswersPage({ items: [item()], page: 1, size: 50, total: 1 })!;
    const a = summaryToArtifact(p.items[0]!);
    expect(a.created_at).toBe(1790860800000);
    expect(a.question_text).toBe("what is x");
    expect([a.rendered_output, a.routing, a.sources, a.graph_trace, a.graph_trace_alternates]).toEqual([null, null, [], [], []]);
    expect(a.durability_status).toBe("durable");
  });

  it("URL-encodes the id", () => {
    expect(answerBodyPath("urn:li:a/b c")).toBe("/answers/urn%3Ali%3Aa%2Fb%20c/body");
  });
});
