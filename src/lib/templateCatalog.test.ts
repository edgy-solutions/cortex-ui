/**
 * FOUR STATES, AND EVERY COLLAPSE LOSES A REPAIR.
 *
 * The producer distinguishes "the directory could not be read" from "nothing is ratified" on
 * purpose — `gateway.py`'s `/templates` says so in as many words: "anything raising out of the
 * read is reported as not-composed rather than as an empty menu." A reader that flattened them
 * would discard, at the first seam, a distinction made one hop earlier deliberately.
 *
 * The failure that matters: a deployment accident rendering as a COMPLETE-LOOKING PICKER WITH
 * NOTHING IN IT. A user reads that as "no boards exist", which is a claim nobody made.
 */
import { describe, it, expect } from "vitest";
import { readTemplateCatalog } from "./templateCatalog";

const row = (over: Record<string, unknown> = {}) => ({
  template_id: "program_finance",
  title: "Program finance",
  description: "Cost and schedule for one program",
  template_ref: "program_finance@a1b2c3d4e5f6",
  panels: 6,
  shared_slots: ["program_id"],
  ...over,
});

describe("the catalog keeps its four states apart", () => {
  it("reads a composed menu", () => {
    const c = readTemplateCatalog({ composed: true, templates: [row()], unreadable: [] });
    expect(c.status).toBe("ready");
    if (c.status !== "ready") return;
    expect(c.templates[0].templateId).toBe("program_finance");
    expect(c.templates[0].panels).toBe(6);
    expect(c.templates[0].sharedSlots).toEqual(["program_id"]);
    expect(c.templates[0].templateRef).toBe("program_finance@a1b2c3d4e5f6");
  });

  it("calls an UNREACHABLE endpoint unreachable — not empty", () => {
    // cortex knows NOTHING here, which is different from knowing there is nothing. Rendering
    // this as an empty menu asserts a fact the producer never sent.
    expect(readTemplateCatalog(null).status).toBe("unreachable");
    expect(readTemplateCatalog(undefined).status).toBe("unreachable");
  });

  it("calls `composed: false` UNREADABLE — the deployment accident", () => {
    // THE CASE THIS READER EXISTS FOR. An empty list under `composed: false` is not a menu; it
    // is the producer saying it could not read its own directory.
    const c = readTemplateCatalog({ composed: false, templates: [], unreadable: [] });
    expect(c.status).toBe("unreadable");
  });

  it("calls a composed-but-empty menu EMPTY — the control", () => {
    // Without this, a reader that reported everything as unreadable would pass the test above
    // and hide a genuine "nothing is ratified" behind an error state.
    const c = readTemplateCatalog({ composed: true, templates: [], unreadable: [] });
    expect(c.status).toBe("empty");
  });

  it("tests `composed` POSITIVELY — an absent flag is not a success", () => {
    // The flag's entire job is to distinguish a real empty menu from a failed read. Assuming
    // success when the producer did not say so reintroduces the case it was added to prevent.
    for (const composed of [undefined, "true", 1, null]) {
      const c = readTemplateCatalog({ composed, templates: [row()] });
      expect(c.status, String(composed)).toBe("unreadable");
    }
  });

  it("NAMES a template that will not load rather than dropping it", () => {
    // The producer's reasoning, and the picker is where it becomes visible: omitting it makes
    // the list SHORTER with nothing saying why, and a shorter list reads as the complete set.
    const c = readTemplateCatalog({
      composed: true,
      templates: [row()],
      unreadable: [{ template_id: "broken_board", reason: "ValidationError: panels missing" }],
    });
    if (c.status !== "ready") throw new Error("expected ready, got " + c.status);
    expect(c.unreadable).toEqual([
      { templateId: "broken_board", reason: "ValidationError: panels missing" },
    ]);
  });

  it("carries `unreadable` in the EMPTY and UNREADABLE states too", () => {
    // A directory where every ratified file is broken composes to zero offerable boards and a
    // full unreadable list. Dropping it there would leave the picker saying "nothing exists"
    // when the truth is "everything is broken" — opposite repairs.
    const c = readTemplateCatalog({
      composed: true,
      templates: [],
      unreadable: [{ template_id: "a", reason: "x" }],
    });
    if (c.status !== "empty") throw new Error("expected empty, got " + c.status);
    expect(c.unreadable).toHaveLength(1);
  });

  it("drops a row that names no template, and keeps its neighbours", () => {
    // A row naming nothing cannot be offered — picking it would send an id the producer never
    // gave. Same rule `readExclusions` applies to a verb-less exclusion.
    const c = readTemplateCatalog({
      composed: true,
      templates: [{ title: "nameless" }, row(), { template_id: "   " }],
      unreadable: [],
    });
    expect(c.status).toBe("ready");
    if (c.status !== "ready") return;
    expect(c.templates.map((t) => t.templateId)).toEqual(["program_finance"]);
  });

  it("drops an UNREADABLE row that names no template — found by a surviving mutant", () => {
    // The offerable rows were guarded and the unofferable ones were not. A nameless entry here
    // renders as "— cannot be offered: <reason>" with nothing before the dash: a row about a
    // template that is not identified, which a reader cannot act on and cannot dismiss.
    // Symmetry with `readRow` was assumed rather than tested, which is what let it through.
    const c = readTemplateCatalog({
      composed: true,
      templates: [row()],
      unreadable: [{ reason: "no id on this one" }, { template_id: "broken", reason: "x" }],
    });
    if (c.status !== "ready") throw new Error("expected ready");
    expect(c.unreadable.map((u) => u.templateId)).toEqual(["broken"]);
  });

  it("defaults a missing panel count to 0 rather than inventing one", () => {
    const c = readTemplateCatalog({
      composed: true,
      templates: [row({ panels: "six" })],
      unreadable: [],
    });
    if (c.status !== "ready") throw new Error("expected ready");
    expect(c.templates[0].panels).toBe(0);
  });
});
