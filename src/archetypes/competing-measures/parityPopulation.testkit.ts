/**
 * The parity population — every component `parity.test.tsx` renders, keyed exactly as
 * `parity.baseline.json` is. Extracted so the raw-section seals (`src/lib/rawFields.test.ts`)
 * walk the SAME census instead of hand-picking one. Test-only.
 *
 * This kit does not read sessions/ itself: the test supplies `readCapture` (a bare sessions/
 * basename -> parsed JSON), so the kit stays free of Node builtins — `noNodeBuiltinsInTheBundle`
 * treats every non-test .ts/.tsx under src/ as shipping code.
 */
import { COMPETING_MEASURES_FIXTURES } from "./fixtures";

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

export function parityComponents(
  readCapture: (file: string) => unknown,
): Record<string, Record<string, unknown>> {
  const out: Record<string, Record<string, unknown>> = {};
  for (const f of COMPETING_MEASURES_FIXTURES) {
    out[`fixture:${f.name}`] = { archetype: "COMPETING_MEASURES", rows: f.rows, ...f.envelope };
  }
  for (const file of CAPTURE_FILES) {
    const data = readCapture(file) as {
      projected?: { archetype?: string; payload?: Record<string, unknown> }[];
    };
    const projected = Array.isArray(data.projected) ? data.projected : [];
    const matches = projected
      .map((p, i) => ({ p, i }))
      .filter(({ p }) => p.archetype === "COMPETING_MEASURES" && Array.isArray(p.payload?.rows));
    for (const { p, i } of matches) {
      out[`capture:${file}#${i}`] = p.payload as Record<string, unknown>;
    }
  }
  return out;
}
