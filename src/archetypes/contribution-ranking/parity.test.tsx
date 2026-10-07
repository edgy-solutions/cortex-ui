/**
 * ADR-0055 step 2's promise, made checkable: ZERO VISUAL CHANGE across the extraction.
 *
 * `parity.baseline.json` is not generated here — it was generated ONCE, by a throwaway test, at
 * the pre-move HEAD (before `ContributionRanking.tsx` became this package), rendering every
 * fixture plus the one renderable capture component through the REAL `SemanticInterpreter`
 * (never the bare `ContributionRanking` component — the thing under test is the WIRING,
 * registry lookup included, not just the card). This file re-draws every one of those same
 * payloads through the same dispatch path and diffs the HTML. A baseline this test could
 * regenerate for itself would only ever agree with whatever the code does today.
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { readFileSync } from "node:fs";
import path from "node:path";
import { SemanticInterpreter } from "../../components/registry/SemanticInterpreter";
import { CONTRIBUTION_RANKING_FIXTURES } from "./fixtures";
import baseline from "./parity.baseline.json";

afterEach(cleanup);

const SESSIONS = path.join(__dirname, "../../../sessions");

/**
 * The one capture B0 found with a renderable `final.components[].rows` for this archetype —
 * `sessions/2026-09-26-payload-lot4-contribution-ranking.json`. Unlike COMPETING_MEASURES's
 * captures, this file's final answer sits at `final.components`, not `projected[]`.
 */
const CAPTURE_FILES = ["2026-09-26-payload-lot4-contribution-ranking.json"];

function renderFresh(): Record<string, string> {
  const out: Record<string, string> = {};

  for (const f of CONTRIBUTION_RANKING_FIXTURES) {
    const { container } = render(
      <SemanticInterpreter
        payload={{
          components: [
            {
              archetype: "CONTRIBUTION_RANKING",
              rows: f.rows,
              value_unit: f.value_unit,
              threshold: f.threshold,
              threshold_defaulted: f.threshold_defaulted,
            },
          ],
        }}
      />,
    );
    out[`fixture:${f.name}`] = container.innerHTML;
    cleanup();
  }

  for (const file of CAPTURE_FILES) {
    const data = JSON.parse(readFileSync(path.join(SESSIONS, file), "utf8")) as {
      final?: { components?: { archetype?: string; rows?: unknown }[] };
    };
    const comps = (data.final?.components ?? []).filter(
      (c) => c && c.archetype === "CONTRIBUTION_RANKING" && Array.isArray(c.rows),
    );
    comps.forEach((c, i) => {
      const { container } = render(<SemanticInterpreter payload={{ components: [c] }} />);
      out[`capture:${file}#${i}`] = container.innerHTML;
      cleanup();
    });
  }

  return out;
}

const BASELINE = baseline as Record<string, string>;

describe("CONTRIBUTION_RANKING parity — the package draws exactly what the pre-move card drew", () => {
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

  it("the baseline is at least the measured floor — 10 entries (9 fixtures, 1 renderable capture)", () => {
    expect(Object.keys(BASELINE).length).toBeGreaterThanOrEqual(10);
  });
});
