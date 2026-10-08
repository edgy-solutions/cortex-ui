/**
 * The parity population — every component `parity.test.tsx` renders, keyed exactly as
 * `parity.baseline.json` is. Test-only.
 *
 * This kit does not read sessions/ itself: the test supplies `readCapture` (a bare sessions/
 * basename -> parsed JSON), so the kit stays free of Node builtins — `noNodeBuiltinsInTheBundle`
 * treats every non-test .ts/.tsx under src/ as shipping code.
 *
 * One renderable capture: the `projected[]` entry carrying the archetype with `payload.rows`.
 * `CAPTURE_FILES` is a NAMED list, so a capture that lands later is invisible to it —
 * `parity.test.tsx`'s arrival arm reads every sessions/*.json and fails when one appears that
 * this list does not name.
 */
import { SHORTFALL_GRID_FIXTURES } from "./fixtures";

export const CAPTURE_FILES = ["2026-09-19-payload-finance-funding-status.json"];

export function parityComponents(
  readCapture: (file: string) => unknown,
): Record<string, Record<string, unknown>> {
  const out: Record<string, Record<string, unknown>> = {};
  for (const f of SHORTFALL_GRID_FIXTURES) {
    out[`fixture:${f.name}`] = { archetype: "SHORTFALL_GRID", rows: f.rows, ...f.envelope };
  }
  for (const file of CAPTURE_FILES) {
    const data = readCapture(file) as {
      projected?: { archetype?: string; payload?: Record<string, unknown> }[];
    };
    const projected = Array.isArray(data.projected) ? data.projected : [];
    const matches = projected
      .map((p, i) => ({ p, i }))
      .filter(({ p }) => p.archetype === "SHORTFALL_GRID" && Array.isArray(p.payload?.rows));
    for (const { p, i } of matches) {
      out[`capture:${file}#${i}`] = p.payload as Record<string, unknown>;
    }
  }
  return out;
}
