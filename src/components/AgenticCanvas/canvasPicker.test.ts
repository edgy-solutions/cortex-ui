/**
 * THE LENS ROW OFFERS LENSES, AND HAS NEVER OFFERED TEMPLATES. (The form's separate template
 * menu came later — see the last section, and do not read this file as covering it.)
 *
 * A live walk found "Portfolio Planning and no Program Finance" and asked the right question:
 * is that list a derivation or a literal correct-when-written? **It was a literal**, and a
 * literal is indistinguishable from a derivation until a second member arrives.
 *
 * But it is a literal over the WRONG POPULATION to be that defect. The picker offers a canvas's
 * `use` — the chrome a board is read through. `program_finance` is a `template_id`, naming the
 * ratified YAML that ARRANGES a board. ADR-0050 §7 separated them deliberately, because they
 * were one concept only while there was one template.
 *
 * ── THE NAME COLLISION IS WHY IT READS AS A TEMPLATE PICKER ───────────────────────────────
 *
 * The lens `portfolio_planning` and the template registry's LEGACY ALIAS `portfolio_planning`
 * are the same string — the alias exists so boards authored before templates had ids keep their
 * layout. So "Portfolio planning" in this list looks like a template on offer, and the obvious
 * next question is where its Program Finance sibling went. It was never there.
 *
 * ── WHAT WAS ACTUALLY WRONG, AND IS NOW FIXED ─────────────────────────────────────────────
 *
 * The labels are keyed by the union rather than listed beside it, so a fifth `CanvasUse` fails
 * the build instead of being silently absent from the picker. A union is erased at runtime and
 * there is nothing to derive FROM, so the compiler is the closest thing to a population check
 * available — verified by adding a lens and watching the build go red, not by assertion.
 *
 * ── WHAT WAS OPEN HERE IS NOW RULED, AND THIS HEADER OUTLIVED ITS OWN BODY ────────────────
 *
 * It used to end: *"`template_id` is set in exactly ONE place — the seed path. `createCanvas`
 * cannot set one, so there is no way for a person to hand-build a board with any template at
 * all."* That was true when written and stopped being true when `/templates` landed with
 * R-039's read path — and the last `it` in this file had ALREADY been inverted to say so while
 * this paragraph still said the opposite. **A file arguing with itself is how a wrong premise
 * survives**, so the stale half is replaced rather than annotated.
 *
 * The settled state: the form offers a LENS row (this file's subject) and, separately, the
 * ratified TEMPLATE menu. `createCanvas` takes a `templateId` and stamps it. Which templates
 * may be offered is not a free choice either — a ratified template whose shared slots nothing
 * binds cannot arrange a board, and offering one drew an empty canvas on a live walk. That
 * partition and its rendering are sealed in `dockBarTemplatePicker.test.tsx` and
 * `src/lib/templateCatalog.test.ts`; nothing about it belongs in here, which is about lenses.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { KNOWN_TEMPLATE_IDS, PROGRAM_FINANCE_TEMPLATE_ID } from "@/lib/stageConstants";

const src = (rel: string) => readFileSync(path.join(__dirname, rel), "utf8");

describe("the picker's list cannot drift from the lens vocabulary", () => {
  it("labels are keyed by the union, not listed beside it", () => {
    // The repair, asserted on the mechanism rather than the outcome: a `Record<CanvasUse, …>`
    // makes the compiler refuse a lens with no label. An array literal could not.
    const dock = src("DockBar.tsx");
    expect(dock).toMatch(/Record<CanvasUse, string>/);
    // And the offered list is built FROM it, so the two cannot disagree.
    expect(dock).toMatch(/Object\.entries\(USE_LABELS\)/);
  });

  it("offers every lens the store declares", () => {
    // A runtime echo of what the compiler now enforces. Weaker than the type check and kept
    // because it names the population in a form a reader can see.
    const store = src("../../store/useStageStore.ts");
    const union = store.slice(store.indexOf("export type CanvasUse"));
    const lenses = [...union.slice(0, union.indexOf(";")).matchAll(/"([a-z_]+)"/g)].map((m) => m[1]);
    expect(lenses.length).toBeGreaterThanOrEqual(4);
    const dock = src("DockBar.tsx");
    for (const lens of lenses) {
      expect(dock, `lens ${lens} has no label`).toContain(`${lens}:`);
    }
  });
});

describe("lenses and templates are different vocabularies", () => {
  it("the picker does NOT offer template ids", () => {
    // The walk's expectation, recorded as the fact rather than the surprise: `program_finance`
    // is a template and this picker has never offered templates.
    const dock = src("DockBar.tsx");
    const offered = [...dock.matchAll(/^\s{2}([a-z_]+):\s*"/gm)].map((m) => m[1]);
    expect(offered).not.toContain(PROGRAM_FINANCE_TEMPLATE_ID);
    expect(offered.length).toBeGreaterThan(0);
  });

  it("the collision that makes it read otherwise is REAL and is the legacy alias", () => {
    // `portfolio_planning` is both a lens and a template key. That is not a mistake — the
    // template alias keeps pre-id boards laying out — but it is why the picker looks like a
    // template menu. Asserted so nobody "tidies" one of the two names away.
    expect(KNOWN_TEMPLATE_IDS).toContain("portfolio_planning");
    expect(src("DockBar.tsx")).toContain("portfolio_planning:");
  });

  /**
   * THE RULING CAME, AND THIS ASSERTION EXPIRED WITH IT.
   *
   * It read "NO hand-build path sets a template — the open ruling, not a defect", and it was
   * right to: only the seed path stamped `template_id`, so a person could not build a
   * templated board at all. It existed to hold the question OPEN rather than let an absence
   * age into a design.
   *
   * `/templates` now serves the ratified menu (R-039's read path) and `createCanvas` takes a
   * `templateId`. So it is INVERTED rather than deleted: the fact it guarded still matters,
   * it is simply the other way round, and a reader finding this later should see the state
   * changed by RULING rather than by drift.
   */
  it("the hand-build path CAN set a template, since a menu now exists to pick from", () => {
    const store = src("../../store/useStageStore.ts");
    expect(store).toContain("createCanvas: (name, use, enter = true, templateId) =>");
    // ABSENT, NEVER EMPTY-STRING: `template_id` decides which lens arranges the board, so
    // "" would route as a template named nothing.
    expect(store).toContain("const tid = templateId?.trim();");
    expect(store).toContain("...(tid ? { template_id: tid } : {})");
  });

  it("and the picker offers what the SERVER ratified, not a hardcoded list", () => {
    /*
      The whole point of the read path: a menu built from cortex's own constants would drift from
      the registry silently — the two-declarations shape found three times this week.

      ⛔ RE-KEYED ONTO THE SUBJECT, BECAUSE THE SPELLING WAS NOT THE CLAIM. This asserted the
      literal `catalog.templates.map`, and it went red the day the menu started being FILTERED
      before it was rendered — an improvement, keyed out by an assertion pinned to one phrasing.
      What must hold is that the rows come from the store and that no template id is written down
      here; how they are narrowed on the way to the screen is the business of the seals that
      cover the narrowing.
    */
    const dock = src("DockBar.tsx");
    expect(dock).toContain("useTemplateStore");
    // The rows are the store's, whatever the local name for them is.
    expect(dock).toMatch(/catalog\.templates/);
    /*
      And no template id is spelled in this component — that is what "hardcoded list" means.

      ⚠ THE FLOOR IS NOT DECORATION. `KNOWN_TEMPLATE_IDS` has exactly ONE member today, and it is
      `portfolio_planning`, which this loop must skip because the lens collides with it by design.
      So the obvious spelling of this check — iterate the known ids, skip the collision — is a
      loop over an EMPTY list: green forever, measuring nothing. The population is widened to the
      ids cortex can name at all and then asserted to be non-empty, so the check goes red if it
      ever stops having something to check.
    */
    const spellable = [...new Set([...KNOWN_TEMPLATE_IDS, PROGRAM_FINANCE_TEMPLATE_ID])].filter(
      (id) => id !== "portfolio_planning",
    );
    expect(spellable.length).toBeGreaterThan(0);
    for (const id of spellable) {
      expect(dock, `${id} is written into the picker`).not.toContain(`"${id}"`);
    }
  });
});
