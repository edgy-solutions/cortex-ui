import { describe, it, expect } from "vitest";
import { excludedAttesters, viewerAuthzIdOf, viewerIsDropper } from "./dropperHold";

const by = (dropped_by: unknown) => ({ dropped_by });

describe("viewerIsDropper mirrors the server's _excluded_attesters", () => {
  it("held when dropped_by.authz_id is the viewer", () => {
    expect(viewerIsDropper(by({ authz_id: "alice", on_behalf_of: null }), "alice")).toBe(true);
  });
  it("held when dropped_by.on_behalf_of is the viewer, with a different authz_id (delegation)", () => {
    expect(viewerIsDropper(by({ authz_id: "svc:bot", on_behalf_of: "alice" }), "alice")).toBe(true);
  });
  it("not held for a different viewer", () => {
    expect(viewerIsDropper(by({ authz_id: "alice", on_behalf_of: "carol" }), "bob")).toBe(false);
  });
  it("not held when the viewer is unknown (null)", () => {
    expect(viewerIsDropper(by({ authz_id: "alice" }), null)).toBe(false);
  });
  it("a legacy string dropped_by excludes nobody, as on the server", () => {
    expect(viewerIsDropper(by("alice"), "alice")).toBe(false);
    expect(excludedAttesters(by("alice")).size).toBe(0);
  });
  it("dropped_by absent or null: not held", () => {
    expect(viewerIsDropper({}, "alice")).toBe(false);
    expect(viewerIsDropper(by(null), "alice")).toBe(false);
    expect(viewerIsDropper(null, "alice")).toBe(false);
  });
  it("on_behalf_of null is ignored, not thrown on", () => {
    expect(viewerIsDropper(by({ authz_id: "alice", on_behalf_of: null }), "alice")).toBe(true);
  });
  it("an empty-string authz_id excludes nobody, and the selector maps an empty viewer id to null", () => {
    expect(viewerAuthzIdOf({ authz_id: "" })).toBeNull();
    expect(viewerAuthzIdOf({})).toBeNull();
    expect(viewerAuthzIdOf(null)).toBeNull();
    expect(viewerAuthzIdOf({ authz_id: "alice" })).toBe("alice");
    expect(excludedAttesters(by({ authz_id: "", on_behalf_of: "" })).size).toBe(0);
    expect(viewerIsDropper(by({ authz_id: "" }), viewerAuthzIdOf({ authz_id: "" }))).toBe(false);
  });
  it("compares exactly: no case folding", () => {
    expect(viewerIsDropper(by({ authz_id: "Alice" }), "alice")).toBe(false);
  });
});
