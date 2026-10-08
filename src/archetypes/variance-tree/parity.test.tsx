/**
 * ADR-0055 step 2's promise, made checkable: ZERO VISUAL CHANGE across the extraction.
 *
 * `parity.baseline.json` is not generated here — it was generated ONCE, by a throwaway script, at
 * the pre-move HEAD `73cbd67`, before `planning/VarianceTree.tsx` became a package. This file re-draws
 * every one of those same payloads through the same real dispatch path (`SemanticInterpreter`,
 * never the bare `VarianceTree` component — the thing under test is the WIRING, registry
 * lookup included, not just the card) and diffs the HTML. A baseline this test could regenerate
 * for itself would only ever agree with whatever the code does today.
 */
import { describe, it, expect, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { render, cleanup } from "@testing-library/react";
import { SemanticInterpreter } from "../../components/registry/SemanticInterpreter";
import { parityComponents } from "./parityPopulation.testkit";
import baseline from "./parity.baseline.json";

afterEach(cleanup);

const readCapture = (f: string): unknown =>
  JSON.parse(readFileSync(path.join(__dirname, "../../../sessions", f), "utf8"));

/** The population lives in `parityPopulation.testkit.ts`, shared with the raw-section seals. */
function renderFresh(): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, component] of Object.entries(parityComponents(readCapture))) {
    const { container } = render(<SemanticInterpreter payload={{ components: [component] }} />);
    out[key] = container.innerHTML;
    cleanup();
  }
  return out;
}

const BASELINE = baseline as Record<string, string>;

describe("VARIANCE_TREE parity — the package draws exactly what the pre-move card drew", () => {
  it("every baseline key renders byte-identical HTML today", () => {
    const fresh = renderFresh();
    for (const key of Object.keys(BASELINE)) {
      expect(fresh[key], `${key}: present in the baseline but not in a fresh render`).toBeDefined();
      expect(fresh[key], `${key}: HTML diverged from the pre-move baseline`).toBe(BASELINE[key]);
    }
  });

  it("the key SET matches, counted fresh — an added fixture or capture with no baseline entry is a red", () => {
    const fresh = renderFresh();
    expect(new Set(Object.keys(fresh))).toEqual(new Set(Object.keys(BASELINE)));
  });

  it("the baseline is at least the pre-move floor — 12 entries (10 fixtures, 2 renderable captures)", () => {
    expect(Object.keys(BASELINE).length).toBeGreaterThanOrEqual(12);
  });
});
