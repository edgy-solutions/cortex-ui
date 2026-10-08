/**
 * The parity population — every component `parity.test.tsx` renders, keyed exactly as
 * `parity.baseline.json` is. Test-only.
 *
 * This kit does not read sessions/ itself: the test supplies `readCapture` (a bare sessions/
 * basename -> parsed JSON), so the kit stays free of Node builtins — `noNodeBuiltinsInTheBundle`
 * treats every non-test .ts/.tsx under src/ as shipping code.
 *
 * One renderable capture, found by `scratchpad/archCensus.mjs`: the `projected[]` entry carrying
 * the archetype with `payload.rows`. Every other mention of the id in a capture sits under
 * `presentation_provenance.refusals[]`, which is not renderable and is deliberately not added.
 */
import { MULTI_SERIES_FIXTURES } from "./fixtures";

const CAPTURE_FILES = ["2026-09-19-payload-finance-burn-rate.json"];

export function parityComponents(
  readCapture: (file: string) => unknown,
): Record<string, Record<string, unknown>> {
  const out: Record<string, Record<string, unknown>> = {};
  for (const f of MULTI_SERIES_FIXTURES) {
    out[`fixture:${f.name}`] = { archetype: "MULTI_SERIES", rows: f.rows, ...f.envelope };
  }
  for (const file of CAPTURE_FILES) {
    const data = readCapture(file) as {
      projected?: { archetype?: string; payload?: Record<string, unknown> }[];
    };
    const projected = Array.isArray(data.projected) ? data.projected : [];
    const matches = projected
      .map((p, i) => ({ p, i }))
      .filter(({ p }) => p.archetype === "MULTI_SERIES" && Array.isArray(p.payload?.rows));
    for (const { p, i } of matches) {
      out[`capture:${file}#${i}`] = p.payload as Record<string, unknown>;
    }
  }
  return out;
}
