/**
 * ADR-0055 — the DERIVED registry. One archetype package per archetype directory's `index.ts`,
 * swept by Vite's glob import rather than hand-listed: a hand-kept array is a second door a
 * package could walk through without `defineArchetype`'s gate ever running, and this repo has
 * already paid once for a guard that quietly stopped running (see CLAUDE.md's gated-build note).
 * This file's own test asserts its SOURCE TEXT contains no archetype id literal — a hand-listed
 * entry here is itself a red.
 */
import type { ArchetypePackage } from "./defineArchetype";

type GlobModules = Record<string, { default: ArchetypePackage }>;

/**
 * The construction logic, pulled out of module-load time so it is unit-testable: the duplicate-id
 * throw cannot otherwise be exercised without a second real `index.ts` on disk sharing an id.
 */
export function buildRegistry(modules: GlobModules): Map<string, ArchetypePackage> {
  const packages = new Map<string, ArchetypePackage>();
  for (const [path, mod] of Object.entries(modules)) {
    const pkg = mod.default;
    if (packages.has(pkg.id)) {
      throw new Error(
        `archetype registry: duplicate id ${JSON.stringify(pkg.id)} — ${path} collides with an ` +
          `earlier package`,
      );
    }
    packages.set(pkg.id, pkg);
  }
  return packages;
}

const modules = import.meta.glob("./*/index.ts", { eager: true }) as unknown as GlobModules;

const packages = buildRegistry(modules);

export const ARCHETYPE_PACKAGES: ReadonlyMap<string, ArchetypePackage> = packages;

export function archetypePackage(id: string): ArchetypePackage | undefined {
  return packages.get(id);
}
