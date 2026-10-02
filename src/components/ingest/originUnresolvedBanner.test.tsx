/**
 * CORTEX-PROPOSED ORIGIN — Section 6, through SemanticInterpreter. Same wiring discipline as
 * `provenanceFloorLabel.test.tsx`: the banner must be archetype-agnostic, mounted ONCE in the
 * render loop over every component, never per-archetype. This walks the REAL, closed
 * `DISPLAY_ARCHETYPES` population (not two hand-picked fake names) — a mutant mounting the
 * banner inside one archetype's own `case` instead of the loop (O5) must redden this file.
 *
 * `renderComponent(comp, ...)` is called as a plain function INSIDE `SemanticInterpreter`'s own
 * render body (inside the `.map()`, before React starts reconciling), so a card that throws on
 * a minimal, close-to-empty component takes the WHOLE render down with it — there is no way for
 * one archetype's throw to leave its sibling's banner standing. Each archetype is therefore
 * rendered ALONE, inside its own error boundary: a throw is recorded and skipped (nothing can be
 * asserted about a card that never mounted), never silently counted as a pass.
 *
 * ⛔ KNOWN GAP, NOT COVERED: the archetypes in `BANNER_UNPROVEN` throw on a minimal component, so
 * this file proves NOTHING about the banner for them. Do not read the loop mount as covering
 * them — placement is a reason to expect the banner, not a measurement of it. The list is held
 * by EQUALITY: a card that starts throwing reddens here (the gap cannot grow silently), and a
 * card that gains a minimal fixture reddens here too, telling you to take it off the list so the
 * banner assertions start running for it.
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { Component, type ReactNode } from "react";
import { SemanticInterpreter } from "../registry/SemanticInterpreter";
import { DISPLAY_ARCHETYPES } from "@/lib/answerDisplay";

afterEach(cleanup);

const payload = (components: unknown[]) => ({ components });

class CaughtRender extends Component<{ children: ReactNode }, { threw: boolean }> {
  state = { threw: false };
  static getDerivedStateFromError() {
    return { threw: true };
  }
  render() {
    if (this.state.threw) return <div data-render-threw />;
    return this.props.children;
  }
}

function tryRender(comp: Record<string, unknown>): { threw: boolean; hasBanner: boolean } {
  cleanup();
  render(
    <CaughtRender>
      <SemanticInterpreter payload={payload([comp])} />
    </CaughtRender>,
  );
  return {
    threw: document.querySelector("[data-render-threw]") !== null,
    hasBanner: document.querySelector("[data-origin-unresolved-banner]") !== null,
  };
}

/** Archetypes this file cannot prove the banner for (see the header). Measured 2026-10-02:
 *  each needs richer props than `{archetype, origin}` to render at all — the same with no
 *  `origin` key, so unrelated to the banner. Shrink it as they gain minimal fixtures. */
const BANNER_UNPROVEN = [
  "APPROVAL_TASK",
  "ELICITATION",
  "GROUPED_REVIEW",
  "INSTANCES_BY_PROPERTY",
  "TRIAGE_TASK",
  "WORKFLOW_OBSERVATION",
] as const;

describe("OriginUnresolvedBanner, wired through SemanticInterpreter — EVERY DISPLAY_ARCHETYPE", () => {
  it("draws for unresolved, never for resolved or absent, across the whole closed archetype population", () => {
    const threwOnUnresolved: string[] = [];
    let tolerated = 0;

    for (const archetype of DISPLAY_ARCHETYPES) {
      const unresolved = tryRender({ archetype, origin: { status: "unresolved" } });
      if (unresolved.threw) {
        threwOnUnresolved.push(archetype);
        continue;
      }
      tolerated += 1;
      expect(unresolved.hasBanner, `${archetype}: unresolved origin should draw the banner`).toBe(true);

      const resolved = tryRender({ archetype, origin: { status: "resolved" } });
      if (!resolved.threw) {
        expect(resolved.hasBanner, `${archetype}: resolved origin should NOT draw the banner`).toBe(false);
      }

      const absent = tryRender({ archetype });
      if (!absent.threw) {
        expect(absent.hasBanner, `${archetype}: no origin at all should NOT draw the banner`).toBe(false);
      }
    }

    // THE GAP, BY EQUALITY — see the header. Also the positive control: every archetype NOT on
    // the list was rendered and asserted on above, so the walk cannot pass by skipping.
    expect(
      [...threwOnUnresolved].sort(),
      `the archetypes that throw on a minimal component changed. New throwers widen the unproven gap; ` +
        `ones that now render should come OFF BANNER_UNPROVEN so the banner is asserted for them.`,
    ).toEqual([...BANNER_UNPROVEN].sort());
    expect(tolerated).toBe(DISPLAY_ARCHETYPES.length - BANNER_UNPROVEN.length);
  });
});
