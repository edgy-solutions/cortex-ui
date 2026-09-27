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

/**
 * ── THE FIELD THAT ARRIVED CORRECTLY AND WAS NEVER READ ────────────────────────────────────
 *
 * `shared_slots` was projected onto every row and had no consumer, so a ratified template that
 * cannot arrange a board was offered exactly like one that can, and drew an empty canvas. These
 * arms are the consumer, and they are here rather than in the component because the decision is
 * a derivation over producer data, not a rendering.
 *
 * Fixtures go through `readTemplateCatalog` on purpose: a hand-built `TemplateCatalog` would let
 * these arms pass over a shape the wire cannot produce.
 */
import {
  needsBinding,
  partitionTemplates,
  refuseTemplateForCreate,
  type TemplateCatalog,
} from "./templateCatalog";

const ready = (...rows: Record<string, unknown>[]): TemplateCatalog =>
  readTemplateCatalog({ composed: true, templates: rows, unreadable: [] });

const BINDABLE = row({
  template_id: "portfolio_planning",
  title: "Portfolio planning",
  shared_slots: [],
});
const UNBOUND = row(); // the real shape: program_finance, shared_slots non-empty

describe("a template that cannot be bound cannot be offered", () => {
  it("reads the slots the producer sent rather than a flag nobody declared", () => {
    const c = ready(UNBOUND);
    if (c.status !== "ready") throw new Error("expected ready");
    expect(needsBinding(c.templates[0])).toBe(true);
  });

  it("STILL offers a template with no shared slots — the near side is the whole menu", () => {
    // If this arm goes with the one above, the picker has stopped offering anything at all,
    // which is a worse outcome than the defect: `>= 0` would refuse every board that works.
    const c = ready(BINDABLE);
    if (c.status !== "ready") throw new Error("expected ready");
    expect(needsBinding(c.templates[0])).toBe(false);
  });

  it("splits the menu and loses nothing — counted, not merely contained", () => {
    // Asserted by ID AND by length in both buckets. A containment check cannot see a row that
    // went missing or one that landed in both, and both are the plausible mistakes here.
    const c = ready(BINDABLE, UNBOUND);
    if (c.status !== "ready") throw new Error("expected ready");
    const { offerable, unbound } = partitionTemplates(c.templates);
    expect(offerable.map((t) => t.templateId)).toEqual(["portfolio_planning"]);
    expect(unbound.map((t) => t.templateId)).toEqual(["program_finance"]);
    expect(offerable.length + unbound.length).toBe(c.templates.length);
  });

  it("names the slot it is waiting for, so the reason is the producer's and not ours", () => {
    const refusal = refuseTemplateForCreate("program_finance", ready(UNBOUND));
    expect(refusal).toMatch(/needs a binding for program_id/);
    expect(refusal).toMatch(/no board was created/);
  });
});

describe("the create permits the safe set and refuses everything else by default", () => {
  it("allows a freeform board — no template is not a bad template", () => {
    expect(refuseTemplateForCreate("", ready(BINDABLE))).toBeNull();
    // And whitespace is the same case, not an id: `"  "` must not reach the find as a name.
    expect(refuseTemplateForCreate("   ", ready(BINDABLE))).toBeNull();
  });

  it("allows a template the catalog is currently offering", () => {
    expect(refuseTemplateForCreate("portfolio_planning", ready(BINDABLE))).toBeNull();
  });

  it("refuses an id the catalog never mentioned, without knowing its spelling", () => {
    expect(refuseTemplateForCreate("invented_board", ready(BINDABLE))).toMatch(/not on offer/);
  });

  it("refuses an id that is only in the unreadable list", () => {
    // It IS ratified and it is NOT offerable, and the safe-set rule catches it without a second
    // branch — which is the point of enumerating what may pass rather than what may not.
    const c = readTemplateCatalog({
      composed: true,
      templates: [BINDABLE],
      unreadable: [{ template_id: "half_written", reason: "yaml: unexpected token" }],
    });
    expect(refuseTemplateForCreate("half_written", c)).toMatch(/not on offer/);
  });

  it("refuses a selection that outlived the catalog it was made from", () => {
    // Reachable, not hypothetical: Cancel leaves the selection set, so an id picked while the
    // registry answered can be submitted after it stopped answering. We cannot confirm it, so
    // we do not carry it — and we say which id we could not confirm.
    expect(refuseTemplateForCreate("portfolio_planning", { status: "unreachable" })).toMatch(
      /portfolio_planning is not on offer/,
    );
  });

  it("still lets a freeform board through when the registry is unreachable", () => {
    // The near side of the arm above. Refusing here would make an unreachable registry block
    // every board in the app, template or not.
    expect(refuseTemplateForCreate("", { status: "unreachable" })).toBeNull();
  });
});
