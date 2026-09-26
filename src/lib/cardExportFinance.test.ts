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

/**
 * ── ONE SEAL PER ARCHETYPE, AND IT ROUND-TRIPS ──────────────────────────────────────────────
 *
 * The block above seals the export PER FILE. That is not the same coverage, and the difference is
 * measurable: nine files, eight projections, SIX distinct archetypes — VARIANCE_TREE and
 * ELICITATION each arrive twice. So a per-file suite can lose an archetype entirely (rename the one
 * SHORTFALL_GRID capture and nothing says SHORTFALL_GRID stopped being exercised) while its file
 * count still looks healthy. These tests are keyed on the ARCHETYPE, derived at runtime, so a new
 * capture for a new archetype gets a seal without anyone remembering to add one.
 *
 * ── WHY ROUND-TRIP AND NOT THE PAIRWISE COMPARE ABOVE ──────────────────────────────────────
 *
 * ⛔ The pairwise-with-a-count seal above compares the document to `flattenPayload(payload)` —
 * BOTH SIDES RUN THE SAME WALKER. A defect inside the walker moves both sides together and stays
 * green; that was measured with a mutant that made the walker skip boolean leaves, and it went red
 * on one test that was not that one. The hand-written oracle in `cardExport.test.tsx` fixed it for
 * ONE fixture, by being a different witness.
 *
 * This block generalises that. `unflatten` below is the walker's INVERSE, written from the path
 * grammar rather than from the walker, and it is compared against `normalise(the capture read off
 * disk)`. Neither side of that comparison calls `flattenPayload`. So the walker losing a leaf shows
 * up as a missing key, on all eight real captures, instead of on 25 hand-written lines.
 *
 * The inverse has ONE ambiguity — a leaf whose value is literally "[]" is indistinguishable from an
 * empty array — so that precondition is asserted rather than assumed, below, across every leaf.
 */

/** Split `rows[0].entity_id` into ["rows", 0, "entity_id"]. Numbers are indices, strings are keys. */
function tokenize(path: string): (string | number)[] {
  const out: (string | number)[] = [];
  let i = 0;
  while (i < path.length) {
    if (path[i] === ".") {
      i++;
      continue;
    }
    if (path[i] === "[") {
      const j = path.indexOf("]", i);
      out.push(Number(path.slice(i + 1, j)));
      i = j + 1;
      continue;
    }
    let j = i;
    while (j < path.length && path[j] !== "." && path[j] !== "[") j++;
    out.push(path.slice(i, j));
    i = j;
  }
  return out;
}

/** The walker's inverse: path/value rows back into the nesting they came from. */
function unflatten(cells: PayloadCell[]): unknown {
  const decode = (v: string): unknown => (v === "[]" ? [] : v === "{}" ? {} : v);
  if (cells.length === 1 && cells[0].path === "(root)") return decode(cells[0].value);
  const first = tokenize(cells[0].path)[0];
  const root: Record<string | number, unknown> = typeof first === "number" ? ([] as never) : {};
  for (const { path, value } of cells) {
    const toks = tokenize(path);
    let cur = root;
    for (let k = 0; k < toks.length - 1; k++) {
      const t = toks[k];
      if (cur[t] === undefined) cur[t] = typeof toks[k + 1] === "number" ? [] : {};
      cur = cur[t] as Record<string | number, unknown>;
    }
    cur[toks[toks.length - 1]] = decode(value);
  }
  return root;
}

/**
 * The capture with every leaf stringified — the shape the export can possibly return.
 *
 * Deliberately NOT `formatLeaf`: if this called the production formatter, a defect in it would move
 * both sides of the comparison together, which is the exact failure this block exists to rule out.
 */
function normalise(v: unknown): unknown {
  if (Array.isArray(v)) return v.length === 0 ? [] : v.map(normalise);
  if (v !== null && typeof v === "object") {
    const keys = Object.keys(v as object);
    if (keys.length === 0) return {};
    const out: Record<string, unknown> = {};
    for (const k of keys) out[k] = normalise((v as Record<string, unknown>)[k]);
    return out;
  }
  if (v === null) return "null";
  return String(v);
}

function payloadOf(c: Capture): unknown {
  const projected = c.projected ?? [];
  return projected.length === 1 ? projected[0].payload : projected.map((p) => p.payload);
}

/** archetype → the captures that projected to it. Derived, never listed. */
const BY_ARCHETYPE: Record<string, string[]> = (() => {
  const m: Record<string, string[]> = {};
  for (const name of CAPTURES) {
    const a = load(name).projected?.[0]?.archetype;
    if (!a) continue;
    (m[a] ??= []).push(name);
  }
  return m;
})();

describe("the exported table round-trips the real capture, one seal per archetype", () => {
  it("the archetype set is derived from the captures, and it is the six", () => {
    // The control on `it.each` below: an empty or shrunken map would make every seal under it pass
    // by not existing. Both the SET and the file total are asserted, because they can drift apart.
    expect(Object.keys(BY_ARCHETYPE).sort()).toEqual([
      "COMPETING_MEASURES",
      "ELICITATION",
      "KNOWLEDGE_DOCUMENT",
      "MULTI_SERIES",
      "SHORTFALL_GRID",
      "VARIANCE_TREE",
    ]);
    // Six archetypes, eight files — the two that arrive twice are why this block is keyed on the
    // archetype and not on the file.
    expect(Object.values(BY_ARCHETYPE).flat()).toHaveLength(8);
    expect(BY_ARCHETYPE.VARIANCE_TREE).toHaveLength(2);
    expect(BY_ARCHETYPE.ELICITATION).toHaveLength(2);
    // The ninth file is absent BY MEASUREMENT, not by omission: it carries no projection, so there
    // is no archetype to key a seal on. Its export is sealed per-file in the block above.
    expect(Object.values(BY_ARCHETYPE).flat()).not.toContain(
      "2026-09-19-payload-from-32-np-meridian-brief.json",
    );
  });

  it("the inverse is unambiguous on this corpus — asserted, not assumed", () => {
    // `unflatten` cannot tell a leaf whose value is the STRING "[]" from an empty array, and cannot
    // tokenize a key containing `.` or `[`. Neither occurs here. If a future capture introduces
    // one, THIS fails rather than the round-trip failing in a way that reads as a builder bug.
    let leaves = 0;
    const scan = (v: unknown): void => {
      if (Array.isArray(v)) {
        if (v.length) v.forEach(scan);
        return;
      }
      if (v !== null && typeof v === "object") {
        const ks = Object.keys(v as object);
        if (!ks.length) return;
        for (const k of ks) {
          expect(k, `key ${k} would break the path grammar`).not.toMatch(/[.[\]]/);
          scan((v as Record<string, unknown>)[k]);
        }
        return;
      }
      leaves++;
      expect(v, "a leaf equal to [] or {} would be ambiguous to the inverse").not.toBe("[]");
      expect(v).not.toBe("{}");
    };
    for (const files of Object.values(BY_ARCHETYPE)) {
      for (const f of files) scan(payloadOf(load(f)));
    }
    // Not vacuous, and the number is the corpus: 1116 leaves as measured 2026-09-25.
    expect(leaves).toBeGreaterThan(1000);
  });

  it.each(Object.keys(BY_ARCHETYPE))(
    "%s — the table parses back into the capture, through the walker's INVERSE",
    (archetype) => {
      for (const file of BY_ARCHETYPE[archetype]) {
        const capture = load(file);
        const payload = payloadOf(capture);
        const table = readPayloadTable(build(capture));

        // NEITHER SIDE OF THIS CALLS `flattenPayload`. That is the whole point: the document is
        // read back through the inverse and compared to the capture read off disk. A leaf the
        // walker drops is a key that is missing here, which no same-walker comparison can see.
        expect(unflatten(table), `${archetype} via ${file}`).toEqual(normalise(payload));

        // And it is not a comparison of two empty things.
        expect(table.length).toBeGreaterThan(0);
      }
    },
  );

  it("the builder names no archetype — 'same builder' is structural, not reviewed", () => {
    // The order says finance panels stay same-builder. That is a claim about the CODE, so it is
    // asserted against the code rather than left to a reviewer noticing a new `case`.
    //
    // Comments are stripped before scanning, because a seal that searches for a name finds the
    // prose ABOUT the name — including the builder's own header, and this file's.
    const src = readFileSync("src/lib/cardExport.ts", "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/^\s*\/\/.*$/gm, "");
    for (const a of Object.keys(BY_ARCHETYPE).concat("CONTRIBUTION_RANKING")) {
      expect(src, `${a} appears in the builder — it is no longer one builder`).not.toContain(a);
    }
    // The control: the strip did not simply empty the file out.
    expect(src).toContain("flattenPayload");
  });
});

/**
 * ── ONE SEAL PER ARCHETYPE IS NOT ONE SEAL PER LEAF TYPE ───────────────────────────────────
 *
 * ⛔ Measured while redproofing the block above, and it is the kind of gap that a per-archetype
 * count hides. A mutant that made the walker skip BOOLEAN leaves went red on three of the six
 * round-trip seals — not six — because only three archetypes' captures contain a boolean at all:
 *
 *     MULTI_SERIES         boolean, null, number, string
 *     COMPETING_MEASURES   boolean, null, number, string
 *     VARIANCE_TREE        boolean, null, number, string   (×2 captures)
 *     SHORTFALL_GRID                null, number, string
 *     ELICITATION                   null, number, string   / one capture: string only
 *     KNOWLEDGE_DOCUMENT                            string
 *
 * So "every archetype has a seal" and "a walker defect in any leaf type has a seal" are DIFFERENT
 * claims, and only the first was true by construction. KNOWLEDGE_DOCUMENT carries strings and
 * nothing else — a defect in number, boolean or null handling is invisible through it, and a suite
 * that only ever exported that one archetype would have looked fully covered.
 *
 * What has to hold is the union: every leaf type the walker branches on must appear SOMEWHERE in the
 * corpus, or the mutation that breaks it has no witness. That is what this asserts. It is a claim
 * about the CORPUS, not about the builder, which is why it is worth stating separately — the day the
 * captures are pruned to a tidier set, this is the test that says what the pruning cost.
 */
describe("the corpus covers every leaf type the walker branches on", () => {
  it("string, number, boolean and null all appear — so every branch has a witness", () => {
    const seen = new Set<string>();
    const walk = (v: unknown): void => {
      if (Array.isArray(v)) {
        v.forEach(walk);
        return;
      }
      if (v !== null && typeof v === "object") {
        Object.values(v as Record<string, unknown>).forEach(walk);
        return;
      }
      seen.add(v === null ? "null" : typeof v);
    };
    for (const name of CAPTURES) walk(payloadOf(load(name)));

    // `formatLeaf` has a distinct branch for each of these, and the walker decides container vs
    // leaf before any of them. A type missing from the corpus is a branch nothing can indict.
    expect([...seen].sort()).toEqual(["boolean", "null", "number", "string"]);
  });

  it("names which archetypes carry a boolean, because only those can catch a boolean defect", () => {
    // Not decoration: this is the list a future reader needs when a walker mutant kills fewer seals
    // than they expected. Three of six, measured 2026-09-25 — if that set changes, the expectation
    // about how many seals a leaf-type mutation should kill changes with it.
    const withBoolean = Object.keys(BY_ARCHETYPE).filter((a) =>
      BY_ARCHETYPE[a].some((f) => {
        let found = false;
        const walk = (v: unknown): void => {
          if (found) return;
          if (Array.isArray(v)) return void v.forEach(walk);
          if (v !== null && typeof v === "object")
            return void Object.values(v as Record<string, unknown>).forEach(walk);
          if (typeof v === "boolean") found = true;
        };
        walk(payloadOf(load(f)));
        return found;
      }),
    );
    expect(withBoolean.sort()).toEqual(["COMPETING_MEASURES", "MULTI_SERIES", "VARIANCE_TREE"]);
  });
});
