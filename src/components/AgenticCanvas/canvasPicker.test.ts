/**
 * THE NEW-CANVAS PICKER OFFERS LENSES, AND HAS NEVER OFFERED TEMPLATES.
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
 * ── WHAT IS STILL OPEN, AND IS A RULING RATHER THAN A DEFECT ──────────────────────────────
 *
 * `template_id` is set in exactly ONE place — the seed path. `createCanvas` cannot set one, so
 * **there is no way for a person to hand-build a board with any template at all**, finance or
 * portfolio. Whether the picker should offer arrangements, and whether a finance board should
 * have its own lens, are both product rulings nobody has made. Recorded here so the absence is
 * a decision somebody can find rather than an omission.
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

  it("NO hand-build path sets a template — the open ruling, not a defect", () => {
    // `createCanvas` takes a name and a lens. Only the seed path stamps `template_id`, so a
    // person cannot build a templated board by hand at all. Whether they should is a ruling.
    const store = src("../../store/useStageStore.ts");
    expect(store.match(/template_id:/g)?.length).toBe(1);
    expect(store).toMatch(/createCanvas:\s*\(name, use, enter = true\)/);
  });
});
