/**
 * Ruling, architect via Chris, 2026-11-16: "cortex: do not send a question until the entitlement
 * list has loaded; if it fails to load, say so and do not send."
 */
import { describe, it, expect, beforeEach } from "vitest";
import { usePersonaStore } from "@/store/usePersonaStore";
import { sendReadiness } from "./sendReadiness";

const matrix = (cells: [string, string][]) => ({
  user_id: "u",
  source: "topaz",
  default: null,
  cells: cells.map(([persona, domain]) => ({ persona, domain })),
});
const put = (over: Record<string, unknown>) => usePersonaStore.setState(over as never);
const read = () => sendReadiness(usePersonaStore.getState());

beforeEach(() => {
  put({ entitlements: null, entitlementsLoading: false, entitlementsError: null, selectedPersona: null, selectedDomains: [] });
});

describe("sendReadiness", () => {
  it("not loaded, no error: loading", () => {
    const r = read();
    expect(r.ready).toBe(false);
    if (!r.ready) {
      expect(r.why).toBe("loading");
      expect(r.message).toMatch(/still loading/);
    }
  });

  it("not loaded, terminal error: failed, with the error text and the not-sent statement", () => {
    put({ entitlementsError: "HTTP 503 upstream" });
    const r = read();
    expect(r.ready).toBe(false);
    if (!r.ready) {
      expect(r.why).toBe("failed");
      expect(r.message).toContain("HTTP 503 upstream");
      expect(r.message).toMatch(/nothing was sent/);
    }
  });

  it("loaded with cells: ready, the pick first then the platform domains", () => {
    put({
      entitlements: matrix([["PFA", "PROGRAM_FINANCE"], ["PFA", "MESH"], ["PFA", "DOCS"]]),
      selectedPersona: "PFA",
      selectedDomains: ["PROGRAM_FINANCE"],
    });
    expect(read()).toEqual({
      ready: true,
      cell: { active_persona: "PFA", active_domains: ["PROGRAM_FINANCE", "MESH", "DOCS"] },
    });
  });

  it("loaded with zero cells: ready, no cell (the legacy path)", () => {
    put({ entitlements: matrix([]) });
    expect(read()).toEqual({ ready: true, cell: undefined });
  });

  it("a matrix beside a stale error is READY: a refresh failure keeps the matrix", () => {
    put({
      entitlements: matrix([["PFA", "PROGRAM_FINANCE"]]),
      entitlementsError: "refresh failed",
      selectedPersona: "PFA",
      selectedDomains: ["PROGRAM_FINANCE"],
    });
    expect(read().ready).toBe(true);
  });
});
