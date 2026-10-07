/**
 * The raw section's selector, sealed over the POPULATION — the human's 2026-10-07 ruling
 * (ADR-0055 amendment requested of Lane 1).
 *
 * The population is the one the three parity suites already build (`parityPopulation.testkit.ts`:
 * every fixture and capture behind every `parity.baseline.json`), never a hand-picked sample,
 * plus the maintenance-bridge components.
 */
import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { archetypePackage } from "@/archetypes/registry";
import { parityComponents as competing } from "@/archetypes/competing-measures/parityPopulation.testkit";
import { parityComponents as ranking } from "@/archetypes/contribution-ranking/parityPopulation.testkit";
import { parityComponents as knowledge } from "@/archetypes/knowledge-document/parityPopulation.testkit";

const readCapture = (f: string): unknown =>
  JSON.parse(readFileSync(path.join(__dirname, "../../sessions", f), "utf8"));
import { componentFromMaintenanceBridge } from "@/archetypes/workflow-case/fromMaintenanceBridge";
import {
  MAINT_ACTION_APPROVED,
  MAINT_ACTION_REJECTED,
  MAINT_EVENT,
} from "@/archetypes/workflow-case/fixtures/maintenanceBridge";
import { rawFieldsOf, declaredKeysOf, interpreterReadsOf } from "./rawFields";
import { STRUCTURAL } from "./unconsumedFields";

const POPULATION: Record<string, Record<string, unknown>> = {
  ...Object.fromEntries(Object.entries(competing(readCapture)).map(([k, v]) => [`CM ${k}`, v])),
  ...Object.fromEntries(Object.entries(ranking(readCapture)).map(([k, v]) => [`CR ${k}`, v])),
  ...Object.fromEntries(Object.entries(knowledge(readCapture)).map(([k, v]) => [`KD ${k}`, v])),
  "bridge: approved": componentFromMaintenanceBridge(MAINT_EVENT, MAINT_ACTION_APPROVED),
  "bridge: rejected": componentFromMaintenanceBridge(MAINT_EVENT, MAINT_ACTION_REJECTED),
  "bridge: no action": componentFromMaintenanceBridge(MAINT_EVENT),
};

function rawOrFail(c: Record<string, unknown>): Record<string, unknown> {
  const r = rawFieldsOf(c);
  if (r.status !== "raw") throw new Error(`expected a declaration for ${String(c.archetype)}`);
  return r.fields;
}

describe("the population is real (a partition over nothing proves nothing)", () => {
  it("covers at least the 30 parity entries plus the 3 bridge components", () => {
    expect(Object.keys(POPULATION).length).toBeGreaterThanOrEqual(33);
  });
});

describe("seal 1 — partition: payload keys == declared ⊎ STRUCTURAL ⊎ interpreter reads ⊎ raw, exactly", () => {
  for (const [name, comp] of Object.entries(POPULATION)) {
    it(name, () => {
      const keys = Object.keys(comp);
      const declared = declaredKeysOf(String(comp.archetype))!;
      const raw = Object.keys(rawOrFail(comp));
      const excused = interpreterReadsOf(String(comp.archetype));
      const structuralHere = keys.filter((k) => STRUCTURAL.has(k));
      const excusedHere = keys.filter((k) => excused.has(k) && !STRUCTURAL.has(k) && !declared.has(k));
      const declaredHere = keys.filter((k) => declared.has(k) && !STRUCTURAL.has(k));
      // SIZE: the three parts add up to the whole, with no key counted twice...
      expect(declaredHere.length + structuralHere.length + excusedHere.length + raw.length).toBe(keys.length);
      // ...and SET: they are the same keys, not merely as many.
      expect(new Set([...declaredHere, ...structuralHere, ...excusedHere, ...raw])).toEqual(new Set(keys));
    });
  }
});

describe("seal 2 — disjoint: raw ∩ declared = ∅ (and raw ∩ STRUCTURAL = ∅)", () => {
  for (const [name, comp] of Object.entries(POPULATION)) {
    it(name, () => {
      const declared = declaredKeysOf(String(comp.archetype))!;
      const raw = Object.keys(rawOrFail(comp));
      expect(raw.filter((k) => declared.has(k))).toEqual([]);
      expect(raw.filter((k) => STRUCTURAL.has(k))).toEqual([]);
      expect(raw.filter((k) => interpreterReadsOf(String(comp.archetype)).has(k))).toEqual([]);
    });
  }

  it("a packaged archetype's declared set is its reads plus its payload_key, exactly", () => {
    const pkg = archetypePackage("COMPETING_MEASURES")!;
    expect(declaredKeysOf("COMPETING_MEASURES")).toEqual(new Set([...pkg.reads, pkg.row.payload_key]));
  });
});

describe("seal 6 — an archetype with no declaration shows no raw section", () => {
  /** The archetypes found in ALL sessions/*payload*.json captures with neither a package nor a contract. */
  const found = new Set<string>();
  const walk = (n: unknown): void => {
    if (Array.isArray(n)) n.forEach(walk);
    else if (n && typeof n === "object") {
      const o = n as Record<string, unknown>;
      if (typeof o.archetype === "string" && /^[A-Z][A-Z0-9_]*$/.test(o.archetype)) found.add(o.archetype);
      Object.values(o).forEach(walk);
    }
  };
  const SESSIONS = path.join(__dirname, "../../sessions");
  for (const f of readdirSync(SESSIONS).filter((n) => n.includes("payload") && n.endsWith(".json"))) {
    walk(JSON.parse(readFileSync(path.join(SESSIONS, f), "utf8")));
  }
  /** Test-visible: quoted by the report. */
  const NO_DECLARATION_FOUND = [...found].filter((a) => declaredKeysOf(a) === null).sort();

  it("the no_declaration archetypes in the captures are exactly these five", () => {
    expect(NO_DECLARATION_FOUND).toEqual([
      "APPROVAL_TASK",
      "INSTANCES_BY_PROPERTY",
      "SOURCE_LEDGER",
      "TRIAGE_TASK",
      "WORKFLOW_OBSERVATION",
    ]);
  });

  it("each reports no_declaration even when it carries extra keys", () => {
    for (const a of NO_DECLARATION_FOUND) {
      expect(rawFieldsOf({ archetype: a, zz_probe: 1 })).toEqual({ status: "no_declaration" });
    }
  });

  it("an unknown archetype and a non-component are no_declaration too", () => {
    expect(rawFieldsOf({ archetype: "NOT_A_THING", x: 1 })).toEqual({ status: "no_declaration" });
    expect(rawFieldsOf(null)).toEqual({ status: "no_declaration" });
    expect(rawFieldsOf({})).toEqual({ status: "no_declaration" });
  });
});
