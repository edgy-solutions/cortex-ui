/**
 * ADR-0055 §3's gate, exercised one rule at a time. Each case asserts the throw MESSAGE names the
 * rule it broke — not merely that it threw — because a throw with the wrong reason is as useless
 * here as no throw at all, and the near-side case (a valid package) proves the gate does not fire
 * on everything.
 */
import { describe, it, expect } from "vitest";
import { defineArchetype } from "./defineArchetype";

function validInput() {
  return {
    id: "SOME_ARCHETYPE",
    contract: { archetype: "SOME_ARCHETYPE" },
    Card: () => null,
    row: {
      archetype: "SOME_ARCHETYPE",
      payload_key: "rows",
      passthrough: ["a", "b", "c"],
    },
    reads: ["a", "b"],
    absences: ["data-refused"],
    fixtures: [{ name: "fixture one", declares: ["data-refused"] }],
  };
}

describe("defineArchetype", () => {
  it("the near side: a valid package does not throw, and comes back frozen", () => {
    const pkg = defineArchetype(validInput());
    expect(pkg.id).toBe("SOME_ARCHETYPE");
    expect(Object.isFrozen(pkg)).toBe(true);
  });

  it("refuses an empty id", () => {
    expect(() => defineArchetype({ ...validInput(), id: "" })).toThrow(/id must be non-empty/);
  });

  it("refuses an id that does not match ^[A-Z][A-Z0-9_]*$", () => {
    expect(() => defineArchetype({ ...validInput(), id: "lower_case" })).toThrow(
      /id must be non-empty and match/,
    );
  });

  it("refuses contract.archetype !== id", () => {
    const input = validInput();
    expect(() =>
      defineArchetype({ ...input, contract: { archetype: "SOMETHING_ELSE" } }),
    ).toThrow(/contract\.archetype .* must equal the package id/);
  });

  it("refuses row.archetype !== id", () => {
    const input = validInput();
    expect(() =>
      defineArchetype({ ...input, row: { ...input.row, archetype: "SOMETHING_ELSE" } }),
    ).toThrow(/row\.archetype .* must equal the package id/);
  });

  it("refuses an empty row.payload_key", () => {
    const input = validInput();
    expect(() =>
      defineArchetype({ ...input, row: { ...input.row, payload_key: "" } }),
    ).toThrow(/row\.payload_key must not be empty/);
  });

  it("refuses a reads field that row.passthrough does not declare", () => {
    const input = validInput();
    expect(() =>
      defineArchetype({ ...input, reads: [...input.reads, "bogus_field"] }),
    ).toThrow(/reads field "bogus_field" is not in row\.passthrough/);
  });

  it("refuses empty absences", () => {
    expect(() => defineArchetype({ ...validInput(), absences: [] })).toThrow(
      /absences must not be empty/,
    );
  });

  it("refuses a fixture declaring an absence outside the package's absences", () => {
    const input = validInput();
    expect(() =>
      defineArchetype({
        ...input,
        fixtures: [{ name: "a stray fixture", declares: ["data-not-in-absences"] }],
      }),
    ).toThrow(/fixture "a stray fixture" declares "data-not-in-absences", which is outside absences/);
  });
});
