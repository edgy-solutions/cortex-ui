/**
 * ADR-0055 §3 — the package contract and the one gate that keeps its promise real.
 *
 * `defineArchetype` is the ONLY door a package walks through to join the registry. It validates
 * the shape ADR-0055 requires rather than trusting each package to have gotten it right by eye:
 * a `reads` field with no matching `row.passthrough` entry is exactly the defect class this ADR
 * exists to catch (a card reading a field the wire declaration never promised to send), and
 * leaving that check to code review is the thing the ADR calls out as already having failed once.
 *
 * Every rule THROWS, naming the id and the rule, rather than returning a result object — a
 * malformed package is a programming error at module-load time (the registry's `import.meta.glob`
 * sweep), not a runtime condition a caller branches on.
 */
import type { ComponentType } from "react";

/** Cortex's copy of the backend row declaration — see `row.ts` in each package. */
export interface ArchetypeRow {
  readonly archetype: string;
  readonly payload_key: string;
  readonly passthrough: readonly string[];
}

export interface ArchetypeContractLike {
  readonly archetype: string;
}

export interface ArchetypeFixtureLike {
  readonly name: string;
  readonly declares: readonly string[];
}

export interface ArchetypePackageInput<
  TContract extends ArchetypeContractLike = ArchetypeContractLike,
  TFixture extends ArchetypeFixtureLike = ArchetypeFixtureLike,
> {
  readonly id: string;
  readonly contract: TContract;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  readonly Card: ComponentType<any>;
  readonly row: ArchetypeRow;
  readonly reads: readonly string[];
  readonly absences: readonly string[];
  readonly fixtures: readonly TFixture[];
}

export type ArchetypePackage<
  TContract extends ArchetypeContractLike = ArchetypeContractLike,
  TFixture extends ArchetypeFixtureLike = ArchetypeFixtureLike,
> = Readonly<ArchetypePackageInput<TContract, TFixture>>;

const ID_PATTERN = /^[A-Z][A-Z0-9_]*$/;

function fail(id: string, rule: string): never {
  throw new Error(`defineArchetype(${JSON.stringify(id)}): ${rule}`);
}

export function defineArchetype<
  TContract extends ArchetypeContractLike,
  TFixture extends ArchetypeFixtureLike,
>(pkg: ArchetypePackageInput<TContract, TFixture>): ArchetypePackage<TContract, TFixture> {
  const { id, contract, row, reads, absences, fixtures } = pkg;

  if (!id || !ID_PATTERN.test(id)) {
    fail(id, `id must be non-empty and match ${ID_PATTERN}`);
  }
  if (contract.archetype !== id) {
    fail(id, `contract.archetype (${JSON.stringify(contract.archetype)}) must equal the package id`);
  }
  if (row.archetype !== id) {
    fail(id, `row.archetype (${JSON.stringify(row.archetype)}) must equal the package id`);
  }
  if (!row.payload_key) {
    fail(id, "row.payload_key must not be empty");
  }
  for (const field of reads) {
    if (!row.passthrough.includes(field)) {
      fail(
        id,
        `reads field ${JSON.stringify(field)} is not in row.passthrough — a field a card reads ` +
          `that no row declares is a red (ADR-0055 §3)`,
      );
    }
  }
  if (absences.length === 0) {
    fail(id, "absences must not be empty");
  }
  for (const fixture of fixtures) {
    for (const declared of fixture.declares) {
      if (!absences.includes(declared)) {
        fail(
          id,
          `fixture ${JSON.stringify(fixture.name)} declares ${JSON.stringify(declared)}, ` +
            `which is outside absences`,
        );
      }
    }
  }

  return Object.freeze({ id, contract, Card: pkg.Card, row, reads, absences, fixtures });
}

/**
 * ADR-0055 §2's collision rule, made checkable: a declared absence is a fact about ONE card's
 * subtree, never about the document. Scoped to `cardRoot` (checked itself, via `matches`, as well
 * as its descendants) — it must never reach `document`, or two cards on the same page would see
 * each other's refusals.
 */
export function readDeclaredAbsences(cardRoot: Element, absences: readonly string[]): string[] {
  return absences.filter((absence) => {
    const selector = `[${absence}]`;
    return cardRoot.matches(selector) || cardRoot.querySelector(selector) !== null;
  });
}

/** Pick named keys off an untyped wire object — what the interpreter hands a package's Card. */
export function pick(
  obj: Record<string, unknown>,
  keys: readonly string[],
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const key of keys) {
    if (key in obj) out[key] = obj[key];
  }
  return out;
}
