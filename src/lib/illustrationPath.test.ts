import { describe, it, expect } from "vitest";
import { gatewayRelativePath } from "./illustrationPath";

describe("gatewayRelativePath — enumerates the safe set", () => {
  it("accepts an ordinary gateway-relative path", () => {
    expect(gatewayRelativePath("/ingest/x/icn")).toBe("/ingest/x/icn");
  });

  it("refuses every form named by the spec, each for its own reason", () => {
    const refused: unknown[] = [
      "https://x/y", // absolute, has a scheme
      "//evil.example/a", // protocol-relative
      "/\\evil", // a "/" followed by a backslash
      "/a/../b", // a ".." path segment
      "javascript:alert(1)", // not even slash-rooted
      "", // empty
      null,
      42, // not a string at all
      "a/b", // relative, no leading slash
    ];
    for (const form of refused) {
      expect(gatewayRelativePath(form), JSON.stringify(form)).toBeNull();
    }
  });

  it("refuses undefined too (not named by the spec's list, but the same non-string case)", () => {
    expect(gatewayRelativePath(undefined)).toBeNull();
  });

  it("refuses a control character embedded in an otherwise-valid path", () => {
    expect(gatewayRelativePath("/ingest/\x01x")).toBeNull();
  });

  it("refuses a scheme embedded later in the string, not just at the front", () => {
    expect(gatewayRelativePath("/ingest/https://evil.example")).toBeNull();
  });

  it("does not refuse a filename that merely CONTAINS two dots outside a path segment", () => {
    expect(gatewayRelativePath("/a..b/c")).toBe("/a..b/c");
  });
});
