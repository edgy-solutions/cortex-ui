/**
 * THE RAW SECTION'S SELECTOR — the human's 2026-10-07 ruling (ADR-0055 amendment requested of
 * Lane 1): an archetype draws what it declares, and every other payload key goes in ONE collapsed
 * raw section.
 *
 * DECLARED SET
 *  - a PACKAGED archetype (`src/archetypes/registry.ts`): its package's `reads`, plus the row's
 *    `payload_key` — the dispatch hands the Card that key too, so it is drawn, not raw;
 *  - otherwise the CONTRACT's `fields` keys (the same `CONTRACTS` table `unconsumedFields` uses).
 *
 * RAW = every own key of the component that is not STRUCTURAL, not declared, and not one of the
 * interpreter's own reads (`INTERPRETER_READS`).
 *
 * An archetype with neither a package nor a contract has no declaration: "everything is raw"
 * would be noise, so it gets NO raw section (`no_declaration`) — the same rule, for the same
 * reason, as `unconsumedFields`'s own `no_declaration`.
 *
 * Pure. Values are returned untouched; drawing them (raw, as JSON) is `RawFields.tsx`'s job.
 */
import { archetypePackage } from "@/archetypes/registry";
import { CONTRACTS, STRUCTURAL } from "@/lib/unconsumedFields";

export type RawFieldsResult =
  | { status: "no_declaration" }
  | { status: "raw"; fields: Record<string, unknown> };

/**
 * Keys SemanticInterpreter itself reads off the component and uses, outside any archetype's
 * declared set — so they are drawn (or used), not raw. NOT added to STRUCTURAL, which would also
 * silence the HUD report. Keyed by archetype; "*" means every component.
 *
 * CHECKABLE: `rawFields.test.ts` asserts each name appears as `comp.<name>` in
 * SemanticInterpreter.tsx's SOURCE TEXT — file-wide for "*", and inside that archetype's own
 * `case` block otherwise. A name here that the interpreter stops reading is a red.
 */
export const INTERPRETER_READS: Readonly<Record<string, readonly string[]>> = {
  "*": ["source_persona"],
  // Passed explicitly to the card, outside `pick(comp, pkg.reads)` (the producer carries the pair
  // "for every archetype", not as a per-archetype passthrough entry).
  CONTRIBUTION_RANKING: ["valid_as_of", "state_version"],
  VARIANCE_TREE: ["valid_as_of", "state_version"],
  MULTI_SERIES: ["valid_as_of", "state_version"],
  SHORTFALL_GRID: ["valid_as_of", "state_version"],
  DELTA_SET: ["valid_as_of", "state_version"],
};

export function interpreterReadsOf(archetype: string): Set<string> {
  const own = Object.hasOwn(INTERPRETER_READS, archetype) ? INTERPRETER_READS[archetype] : [];
  return new Set([...INTERPRETER_READS["*"], ...own]);
}

/** The keys this archetype draws, or null when this repo declares nothing for it. */
export function declaredKeysOf(archetype: string): Set<string> | null {
  const pkg = archetypePackage(archetype);
  if (pkg) return new Set([...pkg.reads, pkg.row.payload_key]);
  const contract = Object.hasOwn(CONTRACTS, archetype) ? CONTRACTS[archetype] : undefined;
  if (contract && typeof contract.fields === "object" && contract.fields !== null) {
    return new Set(Object.keys(contract.fields));
  }
  return null;
}

export function rawFieldsOf(component: unknown): RawFieldsResult {
  if (typeof component !== "object" || component === null || Array.isArray(component)) {
    return { status: "no_declaration" };
  }
  const c = component as Record<string, unknown>;
  const archetype = typeof c.archetype === "string" ? c.archetype.trim() : "";
  if (!archetype) return { status: "no_declaration" };
  const declared = declaredKeysOf(archetype);
  if (!declared) return { status: "no_declaration" };
  const excused = interpreterReadsOf(archetype);
  const fields: Record<string, unknown> = {};
  for (const key of Object.keys(c)) {
    if (STRUCTURAL.has(key) || declared.has(key) || excused.has(key)) continue;
    fields[key] = c[key];
  }
  return { status: "raw", fields };
}
