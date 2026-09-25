/**
 * THE SAME EXPORT, SEALED AGAINST THE NINE REAL FINANCE CAPTURES.
 *
 * The order this was built for says "Finance panels second, same shape", and seals the whole thing
 * with "Fixture from the real payload". For CONTRIBUTION_RANKING that second phrase has no
 * referent — no capture ever projected to it, and the one that considered it refused it, which
 * `cardExport.fixture.ts` records at length. FOR FINANCE IT DOES. The nine files under `sessions/`
 * are producer captures of real answers, so this is where "from the real payload" is honoured
 * rather than approximated, and it is the stronger half of the evidence for that reason.
 *
 * "Same shape" is not asserted by inspection here — it is asserted by there being NO
 * per-archetype code to inspect. The export reads `rendered_output.components` and walks whatever
 * it finds, so these tests run the identical builder over six distinct archetypes. If any of
 * them needed special handling, one of these would fail rather than a reviewer needing to notice.
 *
 * ── WHY THIS IS A SEPARATE FILE FROM `cardExport.test.tsx` ─────────────────────────────────
 *
 * That file seals the BUILDER against a fixture it controls. This one seals it against data it
 * does not control and cannot edit: if the producer's captures change shape, this goes red and the
 * fixture-based file stays green, and the difference between those two signals is the whole point
 * of keeping them apart. A payload that arrives with a shape nothing anticipated is exactly the
 * case a fixture cannot report.
 */

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  ABSENT_MARK,
  METHOD_ABSENT_SENTENCE,
  buildCardExportHtml,
  flattenPayload,
  readExportProvenance,
  readMethod,
  type PayloadCell,
} from "./cardExport";

/** The captures, by name. Listed explicitly so a file that disappears fails loudly. */
const CAPTURES = [
  "2026-09-19-payload-finance-burn-rate.json",
  "2026-09-19-payload-finance-eac-comparison.json",
  "2026-09-19-payload-finance-eac-refusal.json",
  "2026-09-19-payload-finance-funding-status.json",
  "2026-09-19-payload-finance-np-meridian-brief.json",
  "2026-09-19-payload-finance-performance-indices.json",
  "2026-09-19-payload-finance-variance-decomposition.json",
  "2026-09-19-payload-finance-variance-drivers.json",
  "2026-09-19-payload-from-32-np-meridian-brief.json",
];

interface Capture {
  prompt?: string;
  asked_as?: { persona?: string };
  fleet_sha?: string;
  routing?: {
    action?: { label?: string };
    handled_by?: { engine_name?: string };
    acting?: { persona?: string | null };
  };
  projected?: { archetype?: string; payload?: unknown }[];
}

function load(name: string): Capture {
  return JSON.parse(readFileSync(`sessions/${name}`, "utf8")) as Capture;
}

/** Read the payload table back out of a built document. */
function readPayloadTable(html: string): PayloadCell[] {
  const doc = new DOMParser().parseFromString(html, "text/html");
  const table = doc.querySelector("table[data-cx-payload-cells]");
  if (!table) return [];
  return Array.from(table.querySelectorAll("tbody tr")).map((tr) => ({
    path: tr.querySelector("td.cx-path")?.textContent ?? "",
    value: tr.querySelector("td.cx-value")?.textContent ?? "",
  }));
}

function build(c: Capture) {
  const projected = c.projected ?? [];
  const payload = projected.length === 1 ? projected[0].payload : projected.map((p) => p.payload);
  return buildCardExportHtml({
    title: c.prompt ?? "capture",
    archetype: projected[0]?.archetype ?? null,
    cardHtml: null,
    css: null,
    payload,
    // Read, not assumed absent — if a capture ever carries a method block this picks it up and
    // the absent-sentence assertion below is what will tell us.
    method: readMethod((projected[0]?.payload as { method?: unknown } | undefined)?.method),
    provenance: readExportProvenance({
      question_text: c.prompt,
      produced_by: { code_hash: c.fleet_sha },
      produced_for: { user_persona: c.asked_as?.persona },
      routing: c.routing,
    }),
    exportedAt: "2026-09-24T02:00:00.000Z",
  });
}

describe("the nine real finance captures export through the same builder", () => {
  it("the census is nine, and each one names its archetype", () => {
    // A control on the loop below: if a rename silently shrank this list, every `it.each` under it
    // would still pass while measuring less. The count is asserted on its own.
    expect(CAPTURES).toHaveLength(9);
    const archetypes = CAPTURES.map((n) => load(n).projected?.[0]?.archetype ?? null);
    // EIGHT ARE CAPTURED ANSWERS. THE NINTH IS NOT, and it is kept deliberately.
    // `from-32-np-meridian-brief.json` matches the `*payload*` glob but is a different document
    // altogether — `{program_id, identity, findings, holes, rows, summary}`, with no `projected`,
    // no `prompt` and no `routing`. Not an empty projection: no projection key at all.
    //
    // It stays in the set because an export that only ever meets the shape it expects has not been
    // shown to survive one it does not, and the file list a future reader globs will hand them this
    // file too. Its export renders one payload cell and six absent provenance lines, which is the
    // correct rendering of a document this surface knows nothing about.
    expect(archetypes.filter(Boolean).length).toBe(8);
    expect(archetypes).toContain(null);
    const odd = load("2026-09-19-payload-from-32-np-meridian-brief.json");
    expect(odd.projected).toBeUndefined();
    expect(odd.prompt).toBeUndefined();
  });

  it.each(CAPTURES)("%s — every payload value renders verbatim, pairwise with a count", (name) => {
    const c = load(name);
    const projected = c.projected ?? [];
    const payload = projected.length === 1 ? projected[0].payload : projected.map((p) => p.payload);
    const html = build(c);

    const expected = flattenPayload(payload);
    const actual = readPayloadTable(html);
    expect(actual).toHaveLength(expected.length);
    expect(actual).toEqual(expected);

    // Not vacuous: a capture whose flattening is empty would pass the two lines above while
    // proving nothing. The empty-`projected` capture is allowed exactly one cell (`[]`), because
    // an empty projection IS one fact.
    expect(expected.length).toBeGreaterThan(0);
  });

  it.each(CAPTURES)("%s — no method on the wire, so the sentence is drawn", (name) => {
    const html = build(load(name));
    // THE STATE OF THE WORLD ON 2026-09-24, asserted rather than assumed: `method` is in no wire
    // type and no capture. The day the worker lands one, THIS is the test that goes red, and its
    // failure is the notification that the present-method path is now live on real data.
    expect(html).toContain(METHOD_ABSENT_SENTENCE);
    expect(html).toContain('data-cx-method="absent"');
  });

  it.each(CAPTURES)("%s — provenance comes off the capture, absences say so", (name) => {
    const c = load(name);
    const doc = new DOMParser().parseFromString(build(c), "text/html");
    const cells = Array.from(doc.querySelectorAll("[data-cx-prov]"));
    expect(cells).toHaveLength(6);

    const get = (k: string) =>
      doc.querySelector(`[data-cx-prov="${k}"]`)?.textContent?.trim() ?? null;
    // The three the captures carry — each written `?? ABSENT_MARK` because ONE OF THE NINE CARRIES
    // NONE OF THEM. `from-32-np-meridian-brief` is not a projected-answer capture at all; see the
    // census test below. This line was first written as `toBe(c.prompt)`, on the assumption that a
    // file matching `*payload*` is a captured answer, and that file is what said otherwise.
    expect(get("question asked")).toBe(c.prompt ?? ABSENT_MARK);
    expect(get("persona")).toBe(c.asked_as?.persona ?? ABSENT_MARK);
    expect(get("roll sha")).toBe(c.fleet_sha ?? ABSENT_MARK);
    // Every line is one or the other — never an empty cell.
    for (const cell of cells) expect(cell.textContent?.trim()).not.toBe("");
  });

  it("covers six distinct archetypes, so 'same shape' is measured and not assumed", () => {
    const seen = new Set(
      CAPTURES.map((n) => load(n).projected?.[0]?.archetype).filter(Boolean) as string[],
    );
    // The set, not the count of files: four captures could all be VARIANCE_TREE and the suite
    // would look broad while testing one shape.
    expect(seen.size).toBeGreaterThanOrEqual(5);
    expect(seen).toContain("VARIANCE_TREE");
    expect(seen).toContain("SHORTFALL_GRID");
    expect(seen).toContain("MULTI_SERIES");
    expect(seen).toContain("ELICITATION");
    expect(seen).toContain("COMPETING_MEASURES");
    expect(seen).toContain("KNOWLEDGE_DOCUMENT");
    // And the one the order asked for first is NOT among them — the finding that sent the fixture
    // question back to the architect, kept as an assertion so it cannot quietly stop being true.
    expect(seen).not.toContain("CONTRIBUTION_RANKING");
  });
});
