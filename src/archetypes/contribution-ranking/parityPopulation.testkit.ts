/**
 * The parity population — every component `parity.test.tsx` renders, keyed exactly as
 * `parity.baseline.json` is. Shared with the raw-section seals; test-only.
 *
 * This kit does not read sessions/ itself: the test supplies `readCapture` (a bare sessions/
 * basename -> parsed JSON), so the kit stays free of Node builtins — `noNodeBuiltinsInTheBundle`
 * treats every non-test .ts/.tsx under src/ as shipping code.
 */
import { CONTRIBUTION_RANKING_FIXTURES } from "./fixtures";

/**
 * The one capture B0 found with a renderable `final.components[].rows` for this archetype —
 * `sessions/2026-09-26-payload-lot4-contribution-ranking.json`. Unlike COMPETING_MEASURES's
 * captures, this file's final answer sits at `final.components`, not `projected[]`.
 */
const CAPTURE_FILES = ["2026-09-26-payload-lot4-contribution-ranking.json"];

export function parityComponents(
  readCapture: (file: string) => unknown,
): Record<string, Record<string, unknown>> {
  const out: Record<string, Record<string, unknown>> = {};
  for (const f of CONTRIBUTION_RANKING_FIXTURES) {
    out[`fixture:${f.name}`] = {
      archetype: "CONTRIBUTION_RANKING",
      rows: f.rows,
      value_unit: f.value_unit,
      threshold: f.threshold,
      threshold_defaulted: f.threshold_defaulted,
    };
  }
  for (const file of CAPTURE_FILES) {
    const data = readCapture(file) as {
      final?: { components?: { archetype?: string; rows?: unknown }[] };
    };
    const comps = (data.final?.components ?? []).filter(
      (c) => c && c.archetype === "CONTRIBUTION_RANKING" && Array.isArray(c.rows),
    );
    comps.forEach((c, i) => {
      out[`capture:${file}#${i}`] = c as Record<string, unknown>;
    });
  }
  return out;
}
