import { describe, it, expect } from "vitest";
import { attestationHold, viewerAuthzIdOf } from "./dropperHold";

const stamped = (attestation: unknown) => ({ attestation });
const SECOND = (excluded: unknown) => stamped({ mode: "second_party", excluded });

describe("attestationHold reads the served attestation.excluded, and works nothing out", () => {
  it("held when the server names the viewer", () => {
    expect(attestationHold(SECOND(["alice"]), "alice")).toBe("dropper");
  });
  it("held for any name the server lists (the delegate as well as the dropper)", () => {
    expect(attestationHold(SECOND(["carol", "svc:bot"]), "carol")).toBe("dropper");
  });
  it("control: the self mode's empty list holds nobody", () => {
    expect(attestationHold(stamped({ mode: "self", excluded: [] }), "alice")).toBeNull();
  });
  it("not held for a viewer the server does not name", () => {
    expect(attestationHold(SECOND(["alice"]), "bob")).toBeNull();
  });
  it("exact compare: no trim, no case folding", () => {
    expect(attestationHold(SECOND(["alice"]), "Alice")).toBeNull();
    expect(attestationHold(SECOND(["alice"]), " alice")).toBeNull();
  });
  it("not held when the viewer is unknown", () => {
    expect(attestationHold(SECOND(["alice"]), null)).toBeNull();
  });
  it("dropped_by is not read: a dropper the server does not exclude is not held", () => {
    expect(attestationHold({ dropped_by: { authz_id: "alice" }, attestation: { mode: "self", excluded: [] } }, "alice")).toBeNull();
  });
  it("no attestation key (pre-1.9.0): no hold, the server decides at the act", () => {
    expect(attestationHold({ dropped_by: { authz_id: "alice" } }, "alice")).toBeNull();
    expect(attestationHold(null, "alice")).toBeNull();
    expect(attestationHold("not a payload", "alice")).toBeNull();
  });
  it("a null attestation is absent, as the act route reads it", () => {
    expect(attestationHold(stamped(null), "alice")).toBeNull();
  });
  it("a mode this card does not know does not open a hold by itself", () => {
    expect(attestationHold(stamped({ mode: "third_party", excluded: [] }), "alice")).toBeNull();
  });
});

describe("a present block that cannot be read holds, whoever the viewer is (fail closed)", () => {
  const cases: [string, unknown][] = [
    ["a string", "second_party"],
    ["an array", [["alice"]]],
    ["no excluded", { mode: "second_party" }],
    ["excluded a string", { mode: "second_party", excluded: "alice" }],
    ["excluded with a non-string", { mode: "second_party", excluded: ["alice", 7] }],
    ["excluded null", { mode: "second_party", excluded: null }],
  ];
  for (const [name, block] of cases) {
    it(name, () => {
      expect(attestationHold(stamped(block), "bob")).toBe("attestation-unreadable");
      expect(attestationHold(stamped(block), null)).toBe("attestation-unreadable");
    });
  }
});

describe("viewerAuthzIdOf", () => {
  it("reads authz_id only", () => {
    expect(viewerAuthzIdOf({ authz_id: "alice" })).toBe("alice");
    expect(viewerAuthzIdOf({ authz_id: "" })).toBeNull();
    expect(viewerAuthzIdOf({ authz_id: null })).toBeNull();
    expect(viewerAuthzIdOf(null)).toBeNull();
  });
});
