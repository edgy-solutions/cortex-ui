/**
 * formatRequestedBy renders an actor id by its species PREFIX. Exact values, one arm per branch,
 * including the near side (a plain id passes through unchanged).
 */
import { describe, it, expect } from "vitest";
import { formatRequestedBy, isServiceIdentity } from "./requestedBy";

describe("formatRequestedBy", () => {
  it("drops a human: species prefix (Chris, 2026-11-16)", () => {
    expect(formatRequestedBy("human:bob@example.com")).toBe("bob@example.com");
  });
  it("leaves a bare human: alone rather than rendering nothing", () => {
    expect(formatRequestedBy("human:")).toBe("human:");
  });
  it("strips only a LEADING prefix", () => {
    expect(formatRequestedBy("bob+human:x@example.com")).toBe("bob+human:x@example.com");
  });
  it("renders a service as automated, and a human: id is not a service", () => {
    expect(formatRequestedBy("svc:review-starter")).toBe("review-starter (automated)");
    expect(isServiceIdentity("human:bob@example.com")).toBe(false);
  });
  it("passes a plain id through, and renders nothing for an absent one", () => {
    expect(formatRequestedBy("alice@example.com")).toBe("alice@example.com");
    expect(formatRequestedBy(null)).toBe("");
    expect(formatRequestedBy(undefined)).toBe("");
  });
});
