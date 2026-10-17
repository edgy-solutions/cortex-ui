import { describe, expect, it } from "vitest";
import { MODEL_QUESTIONS } from "./contract";
import { questionState, readAnswers } from "./questionState";

const allUnreadable = (r: ReturnType<typeof readAnswers>) =>
  MODEL_QUESTIONS.every((q) => r.byQuestion[q].state === "unreadable");

describe("questionState", () => {
  it("undefined is unreadable", () => expect(questionState(undefined)).toBe("unreadable"));
  it("null is unreadable", () => expect(questionState(null)).toBe("unreadable"));
  it("{state: not_recorded} is not-recorded", () =>
    expect(questionState({ state: "not_recorded" })).toBe("not-recorded"));
  it("{state: not-recorded} (hyphen) is unreadable", () =>
    expect(questionState({ state: "not-recorded" })).toBe("unreadable"));
  it("{state: open} is unreadable (a ratified model holds no open question)", () =>
    expect(questionState({ state: "open" })).toBe("unreadable"));
  it("answered with a value is answered", () =>
    expect(questionState({ state: "answered", value: "x" })).toBe("answered"));
  it("'Answered' (wrong case) is unreadable", () =>
    expect(questionState({ state: "Answered", value: "x" })).toBe("unreadable"));
  it("answered with a blank value is unreadable", () =>
    expect(questionState({ state: "answered", value: "  " })).toBe("unreadable"));
  it("answered with a non-string value is unreadable", () =>
    expect(questionState({ state: "answered", value: 3 })).toBe("unreadable"));
  it("answered with a list value is answered, joined", () => {
    const r = readAnswers({ consuming_domains: { state: "answered", value: ["A", "B"] } });
    expect(r.byQuestion.consuming_domains.state).toBe("answered");
    expect(r.byQuestion.consuming_domains.value).toBe("A, B");
  });
  it("answered with an empty list is unreadable", () =>
    expect(questionState({ state: "answered", value: [] })).toBe("unreadable"));
  it("answered with a list holding a blank is unreadable", () =>
    expect(questionState({ state: "answered", value: ["  "] })).toBe("unreadable"));
  // The breaking input for every-vs-some: ["  "] is blank throughout, so both agree on it.
  it("answered with a list mixing a value and a blank is unreadable, not half-read", () =>
    expect(questionState({ state: "answered", value: ["FINANCE", "  "] })).toBe("unreadable"));
  it("answered with a blank source is answered, with no source", () => {
    const r = readAnswers({ identity: { state: "answered", value: "x", source: "  " } });
    expect(r.byQuestion.identity.state).toBe("answered");
    expect(r.byQuestion.identity.source).toBeUndefined();
  });
  it("answered with a real source keeps it", () => {
    const r = readAnswers({ identity: { state: "answered", value: "x", source: "shape:A" } });
    expect(r.byQuestion.identity.source).toBe("shape:A");
  });
  it("deferred with a reason is deferred", () =>
    expect(questionState({ state: "deferred", reason: "waiting on the steward" })).toBe("deferred"));
  it("deferred with an empty reason is unreadable", () =>
    expect(questionState({ state: "deferred", reason: "" })).toBe("unreadable"));
  it("deferred with a whitespace reason is unreadable", () =>
    expect(questionState({ state: "deferred", reason: "  " })).toBe("unreadable"));
  it("deferred with no reason is unreadable", () =>
    expect(questionState({ state: "deferred" })).toBe("unreadable"));
  it("an unknown state is unreadable", () =>
    expect(questionState({ state: "maybe", value: "x" })).toBe("unreadable"));
  it("an array is unreadable", () => expect(questionState([])).toBe("unreadable"));
  it("a string is unreadable", () => expect(questionState("x")).toBe("unreadable"));
  it("a number is unreadable", () => expect(questionState(3)).toBe("unreadable"));

  it("a MISSING key is unreadable and flagged missing", () => {
    const r = readAnswers({ identity: { state: "not_recorded" } });
    expect(r.byQuestion.identity.state).toBe("not-recorded");
    expect(r.byQuestion.lifecycle).toEqual({ state: "unreadable", missing: true });
  });
  it("a present-but-malformed key is unreadable and NOT flagged missing", () => {
    const r = readAnswers({ lifecycle: "x" });
    expect(r.byQuestion.lifecycle.state).toBe("unreadable");
    expect(r.byQuestion.lifecycle.missing).toBeUndefined();
  });
  it("readAnswers(null) is all unreadable", () => {
    const r = readAnswers(null);
    expect(allUnreadable(r)).toBe(true);
    expect(r.unknownKeys).toEqual([]);
  });
  it("readAnswers(undefined) is all unreadable", () => {
    expect(allUnreadable(readAnswers(undefined))).toBe(true);
  });
  it("readAnswers([]) is all unreadable", () => {
    const r = readAnswers([]);
    expect(allUnreadable(r)).toBe(true);
    expect(r.unknownKeys).toEqual([]);
  });
  // [] has no own keys, so it cannot tell "an array is not answers" from "an array is an empty
  // object". A non-empty one can: read as an object, its index "0" would surface as a key.
  it("readAnswers(['x']) is all unreadable and names no index as an unknown key", () => {
    const r = readAnswers(["x"]);
    expect(allUnreadable(r)).toBe(true);
    expect(r.unknownKeys).toEqual([]);
  });
  it("readAnswers('x') is all unreadable", () => {
    const r = readAnswers("x");
    expect(allUnreadable(r)).toBe(true);
    expect(r.unknownKeys).toEqual([]);
  });
  it("__proto__ / owner are unknown keys, never answers", () => {
    const r = readAnswers(JSON.parse('{"__proto__": {"state":"answered","value":"x"}, "owner": 1}'));
    expect(MODEL_QUESTIONS.some((q) => r.byQuestion[q].state === "answered")).toBe(false);
    expect(r.unknownKeys).toContain("__proto__");
    expect(r.unknownKeys).toContain("owner");
  });
  it("inherited names are never read as answers", () => {
    const r = readAnswers({ toString: () => "x", constructor: 1 });
    expect(allUnreadable(r)).toBe(true);
    expect(r.unknownKeys).toEqual(["toString", "constructor"]);
  });
  it("the result has exactly the 8 MODEL_QUESTIONS keys", () => {
    expect(Object.keys(readAnswers({ owner: 1 }).byQuestion).sort()).toEqual(
      [...MODEL_QUESTIONS].sort(),
    );
    expect(MODEL_QUESTIONS).toHaveLength(8);
  });
});
