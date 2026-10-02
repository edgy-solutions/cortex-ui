/**
 * ADR-0055 step 2's promise, made checkable: ZERO VISUAL CHANGE across the extraction.
 *
 * `parity.baseline.json` is not generated here — it was generated ONCE, by a throwaway script, at
 * the pre-move HEAD `00eeb73`, before `CompetingMeasures.tsx` became a package. This file re-draws
 * every one of those same payloads through the same real dispatch path (`SemanticInterpreter`,
 * never the bare `CompetingMeasures` component — the thing under test is the WIRING, registry
 * lookup included, not just the card) and diffs the HTML. A baseline this test could regenerate
 * for itself would only ever agree with whatever the code does today.
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { readFileSync } from "node:fs";
import path from "node:path";
import { SemanticInterpreter } from "../../components/registry/SemanticInterpreter";
import { COMPETING_MEASURES_FIXTURES } from "./fixtures";
import baseline from "./parity.baseline.json";

afterEach(cleanup);

const SESSIONS = path.join(__dirname, "../../../sessions");

/**
 * The same 4 files B0 found with `grep -l COMPETING_MEASURES sessions/*payload*.json`. Two never
 * carry a renderable `projected[].payload.rows` for this archetype — the string only appears
 * inside a `presentation_provenance.refusals[]` log entry — and B0 recorded that rather than
 * dropping them silently. Kept in the list here too, so the entries this test fails to find a
 * baseline key for remain an observed zero rather than a file nobody looked at again.
 */
const CAPTURE_FILES = [
  "2026-09-19-payload-finance-eac-comparison.json",
  "2026-09-19-payload-finance-np-meridian-brief.json",
  "2026-09-29-payload-finance-eac-roll-7-no-longer-refuses.json",
  "2026-09-30-payload-docs-add-an-engine-roll-8.json",
];

function renderFresh(): Record<string, string> {
  const out: Record<string, string> = {};

  for (const f of COMPETING_MEASURES_FIXTURES) {
    const { container } = render(
      <SemanticInterpreter
        payload={{ components: [{ archetype: "COMPETING_MEASURES", rows: f.rows, ...f.envelope }] }}
      />,
    );
    out[`fixture:${f.name}`] = container.innerHTML;
    cleanup();
  }

  for (const file of CAPTURE_FILES) {
    const data = JSON.parse(readFileSync(path.join(SESSIONS, file), "utf8")) as {
      projected?: { archetype?: string; payload?: Record<string, unknown> }[];
    };
    const projected = Array.isArray(data.projected) ? data.projected : [];
    const matches = projected
      .map((p, i) => ({ p, i }))
      .filter(({ p }) => p.archetype === "COMPETING_MEASURES" && Array.isArray(p.payload?.rows));
    for (const { p, i } of matches) {
      const { container } = render(<SemanticInterpreter payload={{ components: [p.payload] }} />);
      out[`capture:${file}#${i}`] = container.innerHTML;
      cleanup();
    }
  }

  return out;
}

const BASELINE = baseline as Record<string, string>;

describe("COMPETING_MEASURES parity — the package draws exactly what the pre-move card drew", () => {
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

  it("the baseline is at least the B0 floor — 9 entries (7 fixtures, 2 renderable captures)", () => {
    expect(Object.keys(BASELINE).length).toBeGreaterThanOrEqual(9);
  });
});
