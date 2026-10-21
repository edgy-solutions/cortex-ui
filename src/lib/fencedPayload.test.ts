import { describe, expect, it } from "vitest";
import { decodeFencedPayload } from "./fencedPayload";

const fence = (body: string, info = "json") => "```" + info + "\n" + body + "\n```";

describe("decodeFencedPayload", () => {
  it("bare fence", () => {
    expect(decodeFencedPayload(fence('{"a": 1}'))).toEqual({ prose: "", payload: { a: 1 } });
  });
  it("prose + fence, prose trimmed, trailing whitespace allowed", () => {
    expect(decodeFencedPayload("Summary line.\n\n" + fence('{"a": 1}') + "\n\n  \n")).toEqual({
      prose: "Summary line.",
      payload: { a: 1 },
    });
  });
  it("two fences -> null", () => {
    expect(decodeFencedPayload(fence('{"a":1}') + "\n\n" + fence('{"b":2}'))).toBeNull();
  });
  it("fence not last -> null", () => {
    expect(decodeFencedPayload(fence('{"a":1}') + "\n\nafter")).toBeNull();
  });
  it("invalid JSON -> null", () => {
    expect(decodeFencedPayload(fence("{nope"))).toBeNull();
  });
  it("array -> null", () => {
    expect(decodeFencedPayload(fence("[1,2]"))).toBeNull();
  });
  it("null body -> null", () => {
    expect(decodeFencedPayload(fence("null"))).toBeNull();
  });
  it("non-json info string -> null", () => {
    expect(decodeFencedPayload(fence('{"a":1}', "python"))).toBeNull();
    expect(decodeFencedPayload(fence('{"a":1}', ""))).toBeNull();
  });
  it("no fence -> null", () => {
    expect(decodeFencedPayload("just prose")).toBeNull();
  });
});
