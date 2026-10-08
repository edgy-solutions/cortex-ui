/**
 * The parity population — every component `parity.test.tsx` renders, keyed exactly as
 * `parity.baseline.json` is. Test-only.
 *
 * This kit does not read sessions/ itself: the test supplies `readCapture` (a bare sessions/
 * basename -> parsed JSON), so the kit stays free of Node builtins — `noNodeBuiltinsInTheBundle`
 * treats every non-test .ts/.tsx under src/ as shipping code.
 *
 * NO renderable capture exists today (lot 3 is pending from the producer), so `CAPTURE_FILES` is
 * empty; when one lands it is the `projected[]` entry carrying the archetype with `payload.effects`.
 * `CAPTURE_FILES` is a NAMED list, so a capture that lands later is invisible to it —
 * `parity.test.tsx`'s arrival arm reads every sessions/*.json and fails when one appears that
 * this list does not name.
 */
import { DELTA_SET_FIXTURES } from "./fixtures";

export const CAPTURE_FILES: string[] = [];

export function parityComponents(
  readCapture: (file: string) => unknown,
): Record<string, Record<string, unknown>> {
  const out: Record<string, Record<string, unknown>> = {};
  for (const f of DELTA_SET_FIXTURES) {
    out[`fixture:${f.name}`] = { archetype: "DELTA_SET", effects: f.rows, ...f.envelope };
  }
  for (const file of CAPTURE_FILES) {
    const data = readCapture(file) as {
      projected?: { archetype?: string; payload?: Record<string, unknown> }[];
    };
    const projected = Array.isArray(data.projected) ? data.projected : [];
    const matches = projected
      .map((p, i) => ({ p, i }))
      .filter(({ p }) => p.archetype === "DELTA_SET" && Array.isArray(p.payload?.effects));
    for (const { p, i } of matches) {
      out[`capture:${file}#${i}`] = p.payload as Record<string, unknown>;
    }
  }
  return out;
}
