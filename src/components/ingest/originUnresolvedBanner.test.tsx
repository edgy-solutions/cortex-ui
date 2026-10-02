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
 * asserted about a card that never mounted), never silently counted as a pass. The population
 * total at the end is a POSITIVE CONTROL — this walk is only meaningful if most of the 29
 * archetypes actually tolerate a minimal component.
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

    // POSITIVE CONTROL — see the file header. If this ever drops near zero, the walk below it
    // measured nothing: every archetype threw on a minimal component and every assertion above
    // was skipped rather than run. As of this writing, 22/28 tolerate a minimal component; the
    // 6 that do not (ELICITATION, INSTANCES_BY_PROPERTY, WORKFLOW_OBSERVATION, APPROVAL_TASK,
    // TRIAGE_TASK, GROUPED_REVIEW) need richer props than `{archetype, origin}` to render at
    // all — unrelated to this banner, since the SAME is true with no `origin` key present.
    expect(
      tolerated,
      `only ${tolerated}/${DISPLAY_ARCHETYPES.length} archetypes rendered a minimal component without throwing; threw on: ${JSON.stringify(threwOnUnresolved)}`,
    ).toBeGreaterThan(DISPLAY_ARCHETYPES.length / 2);
  });
});
