import { describe, expect, it } from "vitest";
import { bounded, boundWarning, boundWarnings } from "./boundedWarning";

describe("bounded", () => {
  it("shows exactly 160", () => expect(bounded("x".repeat(160))).toBe("x".repeat(160)));
  it("withholds 161", () => expect(bounded("x".repeat(161))).toBeNull());
  it("withholds \n", () => expect(bounded("a\nb")).toBeNull());
  it("withholds \r", () => expect(bounded("a\rb")).toBeNull());
  it("empty and whitespace-only are null", () => {
    expect(bounded("")).toBeNull();
    expect(bounded("   ")).toBeNull();
  });
  it("non-string is null", () => expect(bounded(5)).toBeNull());
  it("trims", () => expect(bounded("  hi ")).toBe("hi"));
});

describe("boundWarning", () => {
  it("object with code, message, ref shows all", () => {
    expect(boundWarning({ code: "C", message: "m", telemetry_ref: "t1" })).toEqual({
      code: "C", message: "m", telemetryRef: "t1", withheld: false,
    });
  });
  it("over-long message withheld, code and ref kept", () => {
    expect(boundWarning({ code: "C", message: "x".repeat(161), telemetry_ref: "t1" })).toEqual({
      code: "C", message: null, telemetryRef: "t1", withheld: true,
    });
  });
  it("non-string code is null", () => {
    expect(boundWarning({ code: 7, message: "m" })?.code).toBeNull();
  });
  it("a code is drawn too, so it is bounded the same way: multi-line or over-long code is null", () => {
    expect(boundWarning({ code: "A\nRAW", message: "m" })?.code).toBeNull();
    expect(boundWarning({ code: "C".repeat(161), message: "m" })?.code).toBeNull();
    expect(boundWarning({ code: "C".repeat(161), message: "m" })?.message).toBe("m");
  });
  it("a telemetry ref is drawn behind the click, so it is bounded too", () => {
    expect(boundWarning({ message: "m", telemetry_ref: "t\nraw" })?.telemetryRef).toBeNull();
  });
  it("number item is withheld with no code", () => {
    expect(boundWarning(3)).toEqual({ code: null, message: null, telemetryRef: null, withheld: true });
  });
  it("array and boolean items are withheld", () => {
    expect(boundWarning([1])?.withheld).toBe(true);
    expect(boundWarning(true)?.withheld).toBe(true);
  });
  it("null and undefined are skipped", () => {
    expect(boundWarning(null)).toBeNull();
    expect(boundWarning(undefined)).toBeNull();
  });
  it("legacy string", () => {
    expect(boundWarning("ok")).toEqual({ code: null, message: "ok", telemetryRef: null, withheld: false });
    expect(boundWarning("a\nb")?.withheld).toBe(true);
  });
});

describe("boundWarnings", () => {
  it("non-array gives []", () => {
    expect(boundWarnings("x")).toEqual([]);
    expect(boundWarnings(undefined)).toEqual([]);
  });
  it("drops nulls, keeps the rest", () => expect(boundWarnings([null, "a", 2])).toHaveLength(2));
});
