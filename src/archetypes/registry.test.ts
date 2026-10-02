/**
 * ADR-0055 — the registry is DERIVED, never hand-kept. Three things that claim could silently
 * stop being true: the lookup could resolve nothing, a literal id could creep back into the
 * source (the second door the ADR forbids), and two packages sharing an id could be swallowed
 * silently instead of refused.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { archetypePackage, ARCHETYPE_PACKAGES, buildRegistry } from "./registry";
import type { ArchetypePackage } from "./defineArchetype";

describe("the archetype registry", () => {
  it("archetypePackage resolves the COMPETING_MEASURES package", () => {
    const pkg = archetypePackage("COMPETING_MEASURES");
    expect(pkg).toBeDefined();
    expect(pkg!.id).toBe("COMPETING_MEASURES");
    expect(pkg!.row.payload_key).toBe("rows");
  });

  it("an unregistered id resolves to undefined, not a thrown error", () => {
    expect(archetypePackage("NO_SUCH_ARCHETYPE")).toBeUndefined();
  });

  it("ARCHETYPE_PACKAGES carries the same package archetypePackage resolves", () => {
    expect(ARCHETYPE_PACKAGES.get("COMPETING_MEASURES")).toBe(archetypePackage("COMPETING_MEASURES"));
  });

  it("the registry's own source names no archetype id literal — it must stay DERIVED", () => {
    // The pattern every real archetype id matches: quoted, uppercase, underscored, 4+ chars. A
    // hand-listed `archetypePackage("COMPETING_MEASURES")`-style entry would match this and is
    // exactly the second door ADR-0055 forbids — the registry's whole point is that a new
    // package needs no edit here at all.
    const src = readFileSync(path.join(__dirname, "registry.ts"), "utf8");
    const matches = src.match(/"[A-Z][A-Z_]{3,}"/g);
    expect(matches, `found a literal archetype id in registry.ts: ${JSON.stringify(matches)}`).toBeNull();
  });

  it("a duplicate id throws, naming the colliding path", () => {
    const a = { id: "DUPLICATE_ID" } as unknown as ArchetypePackage;
    const b = { id: "DUPLICATE_ID" } as unknown as ArchetypePackage;
    expect(() =>
      buildRegistry({
        "./a/index.ts": { default: a },
        "./b/index.ts": { default: b },
      }),
    ).toThrow(/duplicate id "DUPLICATE_ID"/);
  });

  it("two DIFFERENT ids do not throw — the near side of the duplicate rule", () => {
    const a = { id: "FIRST_ID" } as unknown as ArchetypePackage;
    const b = { id: "SECOND_ID" } as unknown as ArchetypePackage;
    const built = buildRegistry({
      "./a/index.ts": { default: a },
      "./b/index.ts": { default: b },
    });
    expect(built.size).toBe(2);
  });
});
