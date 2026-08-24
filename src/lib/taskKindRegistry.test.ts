/**
 * CHARACTERIZATION of the task-kind PRESENTATION REGISTRY — the one address that decides
 * what a task's chip says, what the HUD calls it, and which card species renders it.
 *
 * The property that matters here is not "the table has five rows". It is that the table is
 * the ONLY place a kind string is read. Everything downstream keys on the ARCHETYPE, so a
 * kind added as a row renders correctly with no code change, and a kind added as a
 * `kind === "..."` branch somewhere else is the bug this module exists to prevent. The
 * sweeps below are therefore stated against the registry's own declared population, read
 * from the module source, so a sixth row cannot inherit "tested" by being forgotten here.
 *
 * That derivation carries a POSITIVE CONTROL: a regex that silently matched nothing would
 * turn every assertion under it into a pass over an empty list, which reads as coverage and
 * is none.
 *
 * The second theme is the HONEST DEFAULT. An undeclared kind gets TASK / Task /
 * APPROVAL_TASK — a label that says nothing (harmless) plus an archetype that hands the user
 * two verbs (not harmless, per the module's own comment). Both halves are pinned by exact
 * value, in both directions, because a "helpful" guess here invents an affordance nobody
 * authorised.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it, expect } from "vitest";
import {
  taskKindDisplay,
  taskKindLabel,
  taskKindTitle,
  isRegisteredKind,
  type TaskKindDisplay,
} from "./taskKindRegistry";

const MODULE_SRC = readFileSync(path.join(__dirname, "taskKindRegistry.ts"), "utf8");

/** The declared rows, read from the table itself rather than hand-listed. A hand list is a
 *  thing someone must remember to extend; the module's own source is not. */
const DECLARED_KINDS = (() => {
  const block = MODULE_SRC.match(/const REGISTRY:[^=]*=\s*\{([\s\S]*?)\n\};/)?.[1] ?? "";
  return [...block.matchAll(/^ {2}([a-z_]+):\s*\{/gm)].map((m) => m[1]);
})();

/** The archetype vocabulary, read from the interface's union. */
const DECLARED_ARCHETYPES = (() => {
  const union = MODULE_SRC.match(/archetype:\s*("[A-Z_]+"(?:\s*\|\s*"[A-Z_]+")*)/)?.[1] ?? "";
  return [...union.matchAll(/"([A-Z_]+)"/g)].map((m) => m[1] as TaskKindDisplay["archetype"]);
})();

/**
 * Which card species each declared kind renders as. Stated exhaustively rather than derived
 * from the registry, precisely so it is NOT a tautology: adding a row without deciding its
 * species fails the coverage assertion below instead of quietly inheriting a default.
 */
const EXPECTED_ARCHETYPE: Record<string, TaskKindDisplay["archetype"]> = {
  grouped_review: "GROUPED_REVIEW",
  pcn_disposition: "APPROVAL_TASK",
  access_request: "APPROVAL_TASK",
  workflow_ack: "APPROVAL_TASK",
  extraction_refusal: "TRIAGE_TASK",
};

const DEFAULT_BADGE = "TASK";
const DEFAULT_TITLE = "Task";

describe("taskKindRegistry — the derived population", () => {
  it("the derivations actually read the module source — positive control", () => {
    // Every sweep below iterates these lists. A regex that matched nothing would make each of
    // them pass instantly over zero cases and report as coverage.
    expect(DECLARED_KINDS).toContain("grouped_review");
    expect(DECLARED_KINDS).toContain("extraction_refusal");
    expect(DECLARED_KINDS.length).toBeGreaterThanOrEqual(5);
    expect(DECLARED_ARCHETYPES).toEqual(["GROUPED_REVIEW", "APPROVAL_TASK", "TRIAGE_TASK"]);
  });

  it("EVERY declared row has a decided species — a new kind cannot ride in undecided", () => {
    // The forcing function. Adding a row to the table without adding it here fails, which is
    // the moment to ask "which card renders this?" — the question the registry exists to make
    // someone answer once, in one place.
    expect(Object.keys(EXPECTED_ARCHETYPE).sort()).toEqual([...DECLARED_KINDS].sort());
  });
});

describe("taskKindDisplay — every declared kind resolves to a complete, distinct row", () => {
  it("gives each declared kind a non-empty badge, a non-empty title and a DECLARED archetype", () => {
    // An archetype outside the union has no renderer at all: the canvas falls through to
    // nothing and the card is blank with no error anywhere.
    expect(DECLARED_KINDS.length).toBeGreaterThanOrEqual(5);

    for (const kind of DECLARED_KINDS) {
      const d = taskKindDisplay(kind);
      expect(d.badge.length, kind).toBeGreaterThan(0);
      expect(d.title.length, kind).toBeGreaterThan(0);
      expect(DECLARED_ARCHETYPES, kind).toContain(d.archetype);
      expect(isRegisteredKind(kind), kind).toBe(true);
    }
  });

  it("pins each kind's SPECIES — the refusal is a triage card, never an approval", () => {
    // The bug that shipped: `extraction_refusal` was unregistered, fell back to APPROVAL_TASK,
    // and offered "Approve"/"Reject" on *"this notice could not be prepared for review"* —
    // recording a decision the data cannot represent. The mapping is the contract, so the
    // exact values are asserted rather than a shape.
    for (const [kind, archetype] of Object.entries(EXPECTED_ARCHETYPE)) {
      expect(taskKindDisplay(kind).archetype, kind).toBe(archetype);
    }
  });

  it("no declared kind wears the DEFAULT badge or title — registered and unregistered stay legible", () => {
    // If a real row's badge were "TASK", the chip could no longer tell a declared kind from a
    // kind nobody registered, and the honest-default signal would be invisible on the timeline.
    for (const kind of DECLARED_KINDS) {
      expect(taskKindDisplay(kind).badge, kind).not.toBe(DEFAULT_BADGE);
      expect(taskKindDisplay(kind).title, kind).not.toBe(DEFAULT_TITLE);
    }
  });

  it("badges and titles are UNIQUE across kinds — two species sharing a chip read as one", () => {
    // The badge is the only per-kind mark on a timeline row. Duplicate it and two different
    // tasks become indistinguishable at a glance, which is where a reviewer acts on the wrong one.
    const badges = DECLARED_KINDS.map((k) => taskKindDisplay(k).badge);
    const titles = DECLARED_KINDS.map((k) => taskKindDisplay(k).title);

    expect(new Set(badges).size).toBe(DECLARED_KINDS.length);
    expect(new Set(titles).size).toBe(DECLARED_KINDS.length);
  });

  it("returns the LIVE table row, not a copy — the same object every call", () => {
    // Characterized as found, not endorsed. Nothing freezes these rows, so a consumer that
    // mutated the returned object (`d.badge = ...`) would silently rewrite the registry for
    // every other reader in the session. Recorded so that is a known hazard, not a surprise.
    expect(taskKindDisplay("workflow_ack")).toBe(taskKindDisplay("workflow_ack"));
    expect(taskKindDisplay("nope-a")).toBe(taskKindDisplay("nope-b"));
  });
});

describe("taskKindDisplay — the honest default for an undeclared kind", () => {
  it("returns TASK / Task / APPROVAL_TASK and reports itself UNREGISTERED", () => {
    // Both halves matter and they disagree in spirit: the LABEL admits ignorance, the
    // ARCHETYPE does not — it still names the approval species. The module's comment says the
    // card degrades to a no-verb read-only mode; that gating lives in ApprovalTaskCard, not
    // here, so this function alone cannot be read as "safe by default".
    expect(taskKindDisplay("a_kind_nobody_registered")).toEqual({
      badge: DEFAULT_BADGE,
      title: DEFAULT_TITLE,
      archetype: "APPROVAL_TASK",
    });
    expect(isRegisteredKind("a_kind_nobody_registered")).toBe(false);
  });

  it("an EMPTY kind takes the same default rather than an empty chip", () => {
    // A projection row with a blank kind is a real shape (an unmapped upstream field). A
    // zero-width badge renders as a floating gap nobody can explain.
    expect(taskKindDisplay("")).toEqual(taskKindDisplay("a_kind_nobody_registered"));
    expect(isRegisteredKind("")).toBe(false);
  });

  it("lookup is CASE-SENSITIVE and does NOT trim — a padded or shouted kind loses its row", () => {
    // Pinned as found. Kind casing/padding is not enforced by anything upstream, so a
    // projector emitting " grouped_review " silently downgrades a review batch to a generic
    // approval card — visibly wrong only to someone who knows what the card should have been.
    for (const variant of ["GROUPED_REVIEW", "Grouped_Review", " grouped_review", "grouped_review "]) {
      expect(taskKindDisplay(variant).archetype, variant).toBe("APPROVAL_TASK");
      expect(isRegisteredKind(variant), variant).toBe(false);
    }
    expect(taskKindDisplay("grouped_review").archetype).toBe("GROUPED_REVIEW");
  });

  it("an INHERITED Object.prototype key is NOT a task kind — it degrades to the default", () => {
    // This test previously pinned the defect: `kind in REGISTRY` and `REGISTRY[kind]` walked
    // the prototype chain of a plain object literal, so "constructor" / "toString" reported
    // as declared kinds whose display row was a JS builtin. `?? DEFAULT` could not rescue it
    // — a builtin is not nullish — so the badge came back `undefined`, rendering a blank chip
    // and feeding `undefined` into the HUD. A lookup FAILING while presenting as success.
    //
    // Now closed with `Object.hasOwn`, and the test flipped to guard the fix rather than
    // record the defect. It is kept (not deleted) because the defect is re-introduced by any
    // return to `in` or bare index access, which are the natural things to write here.
    //
    // Reachability is the reason this was worth a line of code: `kind` is a PROJECTION FIELD.
    // It arrives from data, so nothing upstream in this repo constrains it to the declared set.
    for (const key of ["constructor", "toString", "valueOf", "hasOwnProperty", "__proto__"]) {
      expect(isRegisteredKind(key), key).toBe(false);
      expect(taskKindDisplay(key), key).toEqual({
        badge: DEFAULT_BADGE,
        title: DEFAULT_TITLE,
        archetype: "APPROVAL_TASK",
      });
      // The visible symptom the fix removes: a blank chip and `undefined` in the HUD.
      expect(taskKindLabel(key), key).toBe(DEFAULT_BADGE);
      expect(taskKindTitle(key), key).toBe(DEFAULT_TITLE);
    }
  });
});

describe("taskKindLabel / taskKindTitle — thin projections that must never drift", () => {
  it("read the SAME row taskKindDisplay returns, for every declared kind and for the default", () => {
    // Three exported readers, one table. If one of them ever grew its own lookup (a cache, a
    // second map, a special case), the chip and the HUD would name the same task differently
    // and nothing would throw. Swept over the declared population plus an undeclared kind.
    const population = [...DECLARED_KINDS, "a_kind_nobody_registered", ""];
    expect(population.length).toBeGreaterThanOrEqual(6);

    for (const kind of population) {
      const d = taskKindDisplay(kind);
      expect(taskKindLabel(kind), kind).toBe(d.badge);
      expect(taskKindTitle(kind), kind).toBe(d.title);
    }
  });

  it("the undeclared kind's chip and HUD title are the exact honest strings", () => {
    // The one place this module emits text of its own. "TASK" reads as a category admission;
    // anything richer would be a claim about a kind nobody declared.
    expect(taskKindLabel("nope")).toBe(DEFAULT_BADGE);
    expect(taskKindTitle("nope")).toBe(DEFAULT_TITLE);
  });
});
