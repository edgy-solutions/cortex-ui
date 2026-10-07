/**
 * The parity population — every component `parity.test.tsx` renders, keyed exactly as
 * `parity.baseline.json` is. Shared with the raw-section seals; test-only.
 *
 * This kit does not read sessions/ itself: the test supplies `readCapture` (a bare sessions/
 * basename -> parsed JSON), so the kit stays free of Node builtins — `noNodeBuiltinsInTheBundle`
 * treats every non-test .ts/.tsx under src/ as shipping code.
 */
import { KNOWLEDGE_DOCUMENT_FIXTURES } from "./fixtures";

/**
 * The only 2 capture files carrying KNOWLEDGE_DOCUMENT (confirmed via
 * `grep -rl "KNOWLEDGE_DOCUMENT" sessions/*.json`), with two different wire shapes: the
 * np-meridian-brief payload lives at `projected[].payload`, the roll-8 payload lives at
 * `raw_events[].event === "final_payload".data.components[]`.
 */
const PROJECTED_CAPTURE = "2026-09-19-payload-finance-np-meridian-brief.json";
const FINAL_PAYLOAD_CAPTURE = "2026-09-30-payload-docs-add-an-engine-roll-8.json";

export function parityComponents(
  readCapture: (file: string) => unknown,
): Record<string, Record<string, unknown>> {
  const out: Record<string, Record<string, unknown>> = {};
  for (const f of KNOWLEDGE_DOCUMENT_FIXTURES) {
    out[`fixture:${f.name}`] = { archetype: "KNOWLEDGE_DOCUMENT", ...f.payload };
  }
  {
    const data = readCapture(PROJECTED_CAPTURE) as {
      projected?: { archetype?: string; payload?: Record<string, unknown> }[];
    };
    const projected = Array.isArray(data.projected) ? data.projected : [];
    const matches = projected
      .map((p, i) => ({ p, i }))
      .filter(({ p }) => p.archetype === "KNOWLEDGE_DOCUMENT" && p.payload);
    for (const { p, i } of matches) {
      out[`capture:${PROJECTED_CAPTURE}#${i}`] = p.payload as Record<string, unknown>;
    }
  }
  {
    const data = readCapture(FINAL_PAYLOAD_CAPTURE) as {
      raw_events: { event?: string; data?: { components?: Record<string, unknown>[] } }[];
    };
    const finals = data.raw_events.filter((e) => e.event === "final_payload");
    const docs = (finals[0]?.data?.components ?? []).filter((c) => c.archetype === "KNOWLEDGE_DOCUMENT");
    docs.forEach((doc, i) => {
      out[`capture:${FINAL_PAYLOAD_CAPTURE}#${i}`] = doc;
    });
  }
  return out;
}
