/**
 * CHARACTERIZATION of the task-kind presentation module: archetype resolution plus display hints.
 *
 * Display hints (badge/title) are the SERVED /task_kinds declaration's (the interim cortex table
 * is retired, 2026-10-30). `taskKindDisplay` reads a `byKind` map (the shape
 * `useTaskKindStore.byKind` holds); a kind the menu does not serve, or serves an empty badge or
 * title for, gets the HONEST DEFAULT TASK / Task, field by field.
 *
 * The archetype vocabulary is read from the module's own union, with a POSITIVE CONTROL: a regex
 * that silently matched nothing would turn every assertion under it into a pass over an empty list.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it, expect } from "vitest";
import {
  taskKindDisplay,
  taskKindLabel,
  taskKindTitle,
  type TaskCardArchetype,
} from "./taskKindRegistry";
import { taskArchetype } from "./taskArtifact";
import type { TaskDeclaration } from "./taskDeclaration";

/** A served menu for the given kind -> archetype pairs (the shape `useTaskKindStore.byKind` holds). */
const servedMenu = (m: Record<string, string>): Record<string, TaskDeclaration> =>
  Object.fromEntries(
    Object.entries(m).map(([kind, archetype]) => [
      kind,
      { kind, declared: true, archetype, badge: "", title: "", accepts: [], reasonRequired: new Set<string>() },
    ]),
  );

const decl = (kind: string, badge: string, title: string): TaskDeclaration => ({
  kind, declared: true, archetype: "APPROVAL_TASK", badge, title, accepts: [], reasonRequired: new Set<string>(),
});


const MODULE_SRC = readFileSync(path.join(__dirname, "taskKindRegistry.ts"), "utf8");

/** The archetype vocabulary, read from the interface's union. */
const DECLARED_ARCHETYPES = (() => {
  const union = MODULE_SRC.match(/type TaskCardArchetype =\s*("[A-Z_]+"(?:\s*\|\s*"[A-Z_]+")*)/)?.[1] ?? "";
  return [...union.matchAll(/"([A-Z_]+)"/g)].map((m) => m[1] as TaskCardArchetype);
})();

/**
 * Which card species each declared kind renders as. Stated exhaustively rather than derived
 * from the registry, precisely so it is NOT a tautology: adding a row without deciding its
 * species fails the coverage assertion below instead of quietly inheriting a default.
 */
const EXPECTED_ARCHETYPE: Record<string, TaskCardArchetype> = {
  grouped_review: "GROUPED_REVIEW",
  pcn_disposition: "APPROVAL_TASK",
  access_request: "APPROVAL_TASK",
  workflow_ack: "APPROVAL_TASK",
  extraction_refusal: "TRIAGE_TASK",
  document_empty_confirm: "APPROVAL_TASK",
};

const DEFAULT_BADGE = "TASK";
const DEFAULT_TITLE = "Task";

describe("taskKindRegistry — the archetype vocabulary", () => {
  it("the derivation actually reads the module source — positive control", () => {
    expect(DECLARED_ARCHETYPES).toEqual(["GROUPED_REVIEW", "APPROVAL_TASK", "TRIAGE_TASK"]);
  });
});

describe("taskKindDisplay — display hints are the SERVED ones", () => {
  const byKind = {
    served_a: decl("served_a", "ALPHA", "Alpha task"),
    served_b: decl("served_b", "BETA", "Beta task"),
    empty_badge: decl("empty_badge", "", "Only a title"),
    empty_title: decl("empty_title", "ONLY", ""),
  };

  it("uses a served badge and title verbatim", () => {
    expect(taskKindDisplay("served_a", byKind)).toEqual({ badge: "ALPHA", title: "Alpha task" });
    expect(taskKindLabel("served_b", byKind)).toBe("BETA");
    expect(taskKindTitle("served_b", byKind)).toBe("Beta task");
  });

  it("an unserved kind gives TASK / Task", () => {
    expect(taskKindDisplay("a_kind_nobody_served", byKind)).toEqual({ badge: DEFAULT_BADGE, title: DEFAULT_TITLE });
    expect(taskKindDisplay("grouped_review", {})).toEqual({ badge: DEFAULT_BADGE, title: DEFAULT_TITLE });
  });

  it("badge and title fall back INDEPENDENTLY: a served empty one takes that field's default only", () => {
    expect(taskKindDisplay("empty_badge", byKind)).toEqual({ badge: DEFAULT_BADGE, title: "Only a title" });
    expect(taskKindDisplay("empty_title", byKind)).toEqual({ badge: "ONLY", title: DEFAULT_TITLE });
  });

  it("an EMPTY kind takes the default rather than an empty chip", () => {
    expect(taskKindDisplay("", byKind)).toEqual({ badge: DEFAULT_BADGE, title: DEFAULT_TITLE });
  });

  it("an INHERITED Object.prototype key is NOT a served kind — it degrades to the default", () => {
    // `kind` is a PROJECTION FIELD: it arrives from data. `in` / bare index access walk the prototype
    // chain and hand back a builtin (not nullish), which rendered a blank chip and `undefined`.
    for (const key of ["constructor", "toString", "valueOf", "hasOwnProperty", "__proto__"]) {
      expect(taskKindDisplay(key, byKind), key).toEqual({ badge: DEFAULT_BADGE, title: DEFAULT_TITLE });
      expect(taskKindLabel(key, byKind), key).toBe(DEFAULT_BADGE);
      expect(taskKindTitle(key, byKind), key).toBe(DEFAULT_TITLE);
    }
  });

  it("taskKindLabel / taskKindTitle read the SAME answer taskKindDisplay returns", () => {
    for (const kind of [...Object.keys(byKind), "a_kind_nobody_served", ""]) {
      const d = taskKindDisplay(kind, byKind);
      expect(taskKindLabel(kind, byKind), kind).toBe(d.badge);
      expect(taskKindTitle(kind, byKind), kind).toBe(d.title);
    }
  });
});

describe("resolveTaskArchetype / taskArchetype — the species is SERVED", () => {
  it("the species table below covers the archetype vocabulary", () => {
    expect(new Set(Object.values(EXPECTED_ARCHETYPE))).toEqual(new Set(DECLARED_ARCHETYPES));
  });

  it("pins each kind's SPECIES — the refusal is a triage card, never an approval", () => {
    // The bug that shipped: `extraction_refusal` was unregistered, fell back to APPROVAL_TASK,
    // and offered "Approve"/"Reject" on *"this notice could not be prepared for review"* —
    // recording a decision the data cannot represent. The mapping is the contract, so the
    // exact values are asserted rather than a shape.
    for (const [kind, archetype] of Object.entries(EXPECTED_ARCHETYPE)) {
      // SERVED: the archetype comes from the menu, not the table.
      expect(taskArchetype({ kind, declaration: undefined }, servedMenu(EXPECTED_ARCHETYPE)), kind).toBe(archetype);
      // ...and with nothing served, the kind draws the generic fallback, never a guessed species.
      expect(taskArchetype({ kind, declaration: undefined }, {}), kind).toBe("APPROVAL_TASK");
      expect(taskArchetype({ kind, declaration: undefined }), kind).toBe("APPROVAL_TASK");
    }
  });


  it("lookup is CASE-SENSITIVE and does NOT trim — a padded or shouted kind loses its row", () => {
    // Pinned as found. Kind casing/padding is not enforced by anything upstream, so a
    // projector emitting " grouped_review " silently downgrades a review batch to a generic
    // approval card — visibly wrong only to someone who knows what the card should have been.
    for (const variant of ["GROUPED_REVIEW", "Grouped_Review", " grouped_review", "grouped_review "]) {
      expect(taskArchetype({ kind: variant, declaration: undefined }, servedMenu(EXPECTED_ARCHETYPE)), variant).toBe("APPROVAL_TASK");
    }
    expect(taskArchetype({ kind: "grouped_review", declaration: undefined }, servedMenu(EXPECTED_ARCHETYPE))).toBe("GROUPED_REVIEW");
  });

});
