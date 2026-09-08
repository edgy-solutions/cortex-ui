/**
 * THE DISCRIMINATION, TESTED AT ITS OWN SURFACE.
 *
 * These predicates were first exercised only THROUGH `observe`, and a mutation survey showed
 * that was not a test of them. `observe` checks health FIRST, and `unrenderable` counts as
 * health — so a mutant that made `serverHasNoMenuForUs` return true for `unrenderable` changed
 * nothing observable, because the earlier branch had already returned. The sequence test named
 * "the cost-bindings trap" was passing for a reason other than the one in its comment.
 *
 * That is the same lesson as last week's, one layer up: a check that co-occurs with the
 * behaviour is not a check of the behaviour. Here the masking agent was GUARD ORDER rather than
 * a string match, and the fix is the same — assert the thing itself, at the surface where it
 * decides.
 *
 * ── WHY THESE TWO PREDICATES CARRY THE WHOLE DESIGN ───────────────────────────────────────
 *
 * Getting them wrong in either direction is costly and neither failure is loud:
 *
 *   too broad  -> re-posts on answers a re-post cannot repair, once per answer, forever
 *   too narrow -> the session stays blank until someone reloads, which is the status quo
 *
 * `capability_registry.py` derives every `presentation_source` from ONE variable —
 * `anonymous = menu_for(frontend_id) is None` — which is what makes the split exact rather
 * than a heuristic. These tests pin cortex's reading of that mapping so a producer that changes
 * it is caught here rather than by a blank canvas.
 */
import { describe, it, expect } from "vitest";
import {
  serverHasNoMenuForUs,
  serverHasOurMenu,
  NO_MENU_SOURCE,
  NO_MENU_REFUSAL_CODE,
} from "./menuPresence";

const OURS = "cortex-ui-desktop";

describe("the server saying it has no menu for us", () => {
  it("reads the post-wipe answer", () => {
    expect(serverHasNoMenuForUs({ presentation_source: NO_MENU_SOURCE, frontend_id: OURS }, OURS)).toBe(true);
  });

  it("reads the EMPTY-UNION answer, which carries no selection_basis", () => {
    // The state `readPresentation` is deliberately blind to, and the first state after a wipe.
    expect(
      serverHasNoMenuForUs(
        { presentation_source: NO_MENU_SOURCE, frontend_id: OURS, reason: "no frontend has registered — union is empty" },
        OURS,
      ),
    ).toBe(true);
  });

  it("reads the LIVE-VIEW refusal, which is stamped in the same anonymous branch", () => {
    expect(
      serverHasNoMenuForUs(
        { presentation_source: "refused", refusal_code: NO_MENU_REFUSAL_CODE, frontend_id: OURS },
        OURS,
      ),
    ).toBe(true);
  });

  it("does NOT read a refusal for some OTHER cause", () => {
    // `refused` is a category carrying its cause in `refusal_code`, by the producer's explicit
    // design. Triggering on the category would re-post a registration that is present and fine
    // the first time a second refusal code appears — a defect authored in advance.
    expect(
      serverHasNoMenuForUs(
        { presentation_source: "refused", refusal_code: "some_future_cause", frontend_id: OURS },
        OURS,
      ),
    ).toBe(false);
    expect(serverHasNoMenuForUs({ presentation_source: "refused", frontend_id: OURS }, OURS)).toBe(false);
  });

  it("does NOT read `unrenderable` — the menu is PRESENT and the subject is unbound", () => {
    // The repair for this is a row in the assembler. Seven cost subjects sat in exactly this
    // state; a re-post would have fired on every one of their answers and fixed none of them.
    expect(serverHasNoMenuForUs({ presentation_source: "unrenderable", frontend_id: OURS }, OURS)).toBe(false);
  });

  it("does NOT read a healthy answer", () => {
    expect(serverHasNoMenuForUs({ presentation_source: "registered", frontend_id: OURS }, OURS)).toBe(false);
  });

  it("ignores an answer stamped for another surface, and accepts one with no id", () => {
    expect(serverHasNoMenuForUs({ presentation_source: NO_MENU_SOURCE, frontend_id: "other" }, OURS)).toBe(false);
    expect(serverHasNoMenuForUs({ presentation_source: NO_MENU_SOURCE }, OURS)).toBe(true);
    expect(serverHasNoMenuForUs({ presentation_source: NO_MENU_SOURCE, frontend_id: null }, OURS)).toBe(true);
  });

  it("is silent on anything it cannot read", () => {
    for (const junk of [null, undefined, 42, "default-menu", [], {}, { presentation_source: 7 }]) {
      expect(serverHasNoMenuForUs(junk, OURS), String(junk)).toBe(false);
    }
  });
});

describe("the server proving it DOES hold our menu", () => {
  it("counts both non-anonymous labels", () => {
    // Both are stamped from a menu the lookup actually found, so either is proof the row is
    // back. `unrenderable` is the interesting one: the answer did not draw, and the fact it
    // reports is nonetheless that our registration is present.
    expect(serverHasOurMenu({ presentation_source: "registered", frontend_id: OURS }, OURS)).toBe(true);
    expect(serverHasOurMenu({ presentation_source: "unrenderable", frontend_id: OURS }, OURS)).toBe(true);
  });

  it("does NOT count the wipe itself as health", () => {
    // The mutation that made this matter: accepting `default-menu` here would reset the backoff
    // on the very evidence the backoff exists to pace.
    expect(serverHasOurMenu({ presentation_source: NO_MENU_SOURCE, frontend_id: OURS }, OURS)).toBe(false);
    expect(
      serverHasOurMenu({ presentation_source: "refused", refusal_code: NO_MENU_REFUSAL_CODE, frontend_id: OURS }, OURS),
    ).toBe(false);
  });

  it("ignores another surface's health", () => {
    expect(serverHasOurMenu({ presentation_source: "registered", frontend_id: "other" }, OURS)).toBe(false);
  });

  it("the two predicates never both hold — they partition the labels", () => {
    // Not a tautology: they are written independently, and a producer adding a label that both
    // accepted would give a session that re-posts and resets on the same answer, forever.
    const labels = [
      { presentation_source: "registered" },
      { presentation_source: "unrenderable" },
      { presentation_source: NO_MENU_SOURCE },
      { presentation_source: "refused", refusal_code: NO_MENU_REFUSAL_CODE },
      { presentation_source: "refused", refusal_code: "some_future_cause" },
    ];
    for (const l of labels) {
      const missing = serverHasNoMenuForUs(l, OURS);
      const present = serverHasOurMenu(l, OURS);
      expect(missing && present, JSON.stringify(l)).toBe(false);
    }
  });
});
