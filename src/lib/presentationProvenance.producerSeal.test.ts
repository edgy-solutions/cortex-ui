/**
 * THE PRODUCER SEAL for the declared render: the bases `capability_registry.py` can stamp, the
 * fall-through fields `render_ui` copies, and the declared measure rows whose `series`, `target`
 * and `value_label` become the card's `series`, `reference` and `value_label`.
 *
 * A basis the producer adds that cortex has not classified as declared or not-declared must red
 * here, not draw a plausible amber card. Producer lookup follows `rowEditsWireParity.test.ts`:
 * `CORTEX_PRODUCER_ROOT` when set (a dir holding `agent_fleet/` and `policy/`), else a sibling
 * `invincible-agent` / `ia-01` checkout; measure from a `git archive` export at the pinned ref
 * (`CORTEX_PRODUCER_REF`, echoed in every message).
 * RUN WITH `npm run test`, never bare `npx vitest run`.
 */
import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { DECLARED_BASIS, DECLARED_RENDER_BASIS } from "./presentationProvenance";
import { DECLARED_TCPI_COMPONENT, DECLARED_VAC_COMPONENT } from "@/archetypes/multi-series/fixtures/declaredRender";
import { PROJECTED_ARCHETYPES } from "@/archetypes/projectedPopulation.testkit";

/** The widening basis: a cortex-side classification (not declared), pinned here by name. */
const WIDENED = "payload-only (output_uri matched no capability)";

const REGISTRY = "agent_fleet/presentation_agent/capability_registry.py";
const VERBS = "agent_fleet/finance_agent/measure_verbs.py";
const PRESENTATION = "agent_fleet/presentation_agent/main.py";
const FINANCE_MAIN = "agent_fleet/finance_agent/main.py";
const ROW_DIR = "policy/overlays/sample/measure_verbs";

/** Spelled this way so `scripts/check-cross-repo-seals.mjs` censuses this file (it keys on the name). */
const CANDIDATE_ROOTS = ["invincible-agent", "ia-01"];

function findRoot(): string | null {
  const env = (process.env.CORTEX_PRODUCER_ROOT || "").trim();
  if (env && existsSync(path.join(env, REGISTRY))) return env;
  for (const name of CANDIDATE_ROOTS) {
    const p = path.join(__dirname, "../../..", name);
    if (existsSync(path.join(p, REGISTRY))) return p;
  }
  return null;
}
const ROOT = findRoot();
const REF = (process.env.CORTEX_PRODUCER_REF || "").trim();
const AT = REF ? `producer at ${REF.slice(0, 7)}` : "producer (CORTEX_PRODUCER_REF unset)";

const read = (rel: string) => readFileSync(path.join(ROOT!, rel), "utf8");

/** Every literal in `"selection_basis": "<x>"` and `basis = "<x>"`, in source order. */
function basisLiterals(src: string): string[] {
  return [...src.matchAll(/"selection_basis":\s*"([^"]+)"|\bbasis = "([^"]+)"/g)].map((m) => m[1] ?? m[2]);
}

/** The rest of a yaml line after `<key>:` at two-space indent, comment stripped. */
function yamlLine(src: string, key: string): string {
  const m = new RegExp(`^ {2}${key}:\\s*(.+?)\\s*(?:#.*)?$`, "m").exec(src);
  if (!m) throw new Error(`${key} line not found`);
  return m[1].trim();
}

/** A flow mapping `{k: v, k2: v2}` to an object; numbers become numbers, the rest stay strings. */
function flowMap(s: string): Record<string, string | number> {
  const inner = /^\{(.*)\}$/.exec(s.trim());
  if (!inner) throw new Error(`not a flow mapping: ${s}`);
  const out: Record<string, string | number> = {};
  for (const part of inner[1].split(/,\s*(?=[a-z_]+:)/)) {
    const m = /^([a-z_]+):\s*(.*)$/.exec(part.trim());
    if (!m) throw new Error(`bad flow entry: ${part}`);
    out[m[1]] = /^-?\d+(\.\d+)?$/.test(m[2]) ? Number(m[2]) : m[2];
  }
  return out;
}

describe("the parsers, unit-tested on fixtures", () => {
  it("basisLiterals reads both spellings and nothing else", () => {
    const src = 'basis = "a b"\n    x = {"selection_basis": "c", "other": "d"}\nnot_basis = "e"\n';
    expect(basisLiterals(src)).toEqual(["a b", "c"]);
  });
  it("yamlLine and flowMap read a flow-mapping row, and throw when the key is absent", () => {
    const y = "render:\n  series: [{key: tcpi, label: TCPI}]  # note\n  target: {value: 1.0, label: at budgeted efficiency}\n";
    expect(flowMap(yamlLine(y, "target"))).toEqual({ value: 1, label: "at budgeted efficiency" });
    expect(yamlLine(y, "series")).toBe("[{key: tcpi, label: TCPI}]");
    expect(() => yamlLine(y, "value_label")).toThrow(/not found/);
  });
});

describe.skipIf(ROOT === null)("cortex classifies every basis the producer can stamp", () => {
  it("the producer's basis literals are exactly the two declared constants plus the widening", () => {
    const found = basisLiterals(read(REGISTRY));
    expect(
      found.length,
      `${AT}: fewer than 3 basis literals found, the extraction is broken: ${JSON.stringify(found)}`,
    ).toBeGreaterThanOrEqual(3);
    expect(
      [...new Set(found)].sort(),
      `${AT}: a new selection_basis must be classified as declared or not (presentationProvenance.ts). Found: ${JSON.stringify(found)}`,
    ).toEqual([DECLARED_BASIS, DECLARED_RENDER_BASIS, WIDENED].sort());
  });

  it("the fall-through carries declared_shape and declared_unfit, which readPresentation reads", () => {
    const src = read(REGISTRY);
    expect(src, AT).toContain('"declared_shape"');
    expect(src, AT).toContain('"declared_unfit"');
  });
});

describe.skipIf(ROOT === null)("a declared measure's wire, from the producer's own source", () => {
  it("the projector builds the component with subject_concept and no render key", () => {
    const src = read(PRESENTATION);
    const at = src.indexOf("def _project_planning_archetype(");
    expect(at, `${AT}: the projector anchor moved`).toBeGreaterThan(0);
    const start = src.indexOf("component: Dict[str, Any] = {", at);
    const end = src.indexOf("payload_key: rows,", start);
    expect(start, AT).toBeGreaterThan(at);
    expect(end, AT).toBeGreaterThan(start);
    const body = src.slice(start, end);
    // Ruled 2026-11-03: the projector omits this key when null, and cortex excuses nothing. These
    // two lines red at the re-pin that crosses that change, which is the expected way for them to
    // go. The line form and the count are both needed: a conditional spread still contains the
    // plain text, and a pop after the literal leaves the literal as it was.
    const omitted = `${AT}: if the projector now omits a null subject_concept (ruled 2026-11-03), drop it from the declaredRender fixtures, make that test's raw list [], and replace this assertion`;
    expect(body, omitted).toMatch(/^\s*"subject_concept": subject_concept,\s*$/m);
    const nextDef = src.slice(at + 1).search(/\n(async )?def /);
    expect(nextDef, AT).toBeGreaterThan(0);
    expect(src.slice(at, at + 1 + nextDef).match(/"subject_concept"/g)?.length, omitted).toBe(1);
    expect(body, `${AT}: render now reaches a component; declaredRender.test.tsx prints it raw`).not.toContain('"render"');
  });

  it("the projected archetypes are the ones subjectConceptOmitted.test.tsx walks", () => {
    const src = read(PRESENTATION);
    const start = src.indexOf("_PROJECTED_ARCHETYPES: Dict[str, tuple] = {");
    expect(start, `${AT}: the _PROJECTED_ARCHETYPES anchor moved`).toBeGreaterThan(0);
    const end = src.indexOf("\n}\n", start);
    expect(end, AT).toBeGreaterThan(start);
    const keys = [...src.slice(start, end).matchAll(/^ {4}"([A-Z_]+)":/gm)].map((m) => m[1]);
    expect(keys.sort(), `${AT}: an archetype changed; walk it in subjectConceptOmitted.test.tsx`).toEqual([...PROJECTED_ARCHETYPES].sort());
  });

  it("the row's target reaches the flat `reference` key through measure_verbs only", () => {
    expect(read(VERBS), AT).toContain('reference=dict(rnd["target"])');
  });

  it("the declared envelope carries value_label, series and reference beside render and rows", () => {
    const src = read(FINANCE_MAIN);
    const at = src.indexOf('"render": copy.deepcopy(row.render)');
    expect(at, `${AT}: the declared envelope anchor moved`).toBeGreaterThan(0);
    const start = src.lastIndexOf("envelope = {", at);
    const end = src.indexOf('"rows": rows', at);
    expect(start, AT).toBeGreaterThan(0);
    expect(end, AT).toBeGreaterThan(at);
    const body = src.slice(start, end);
    for (const k of ['"value_label":', '"series":', '"reference":']) expect(body, `${AT}: ${k}`).toContain(k);
  });

  it.each([
    ["fin_tcpi.yaml", DECLARED_TCPI_COMPONENT],
    ["fin_vac.yaml", DECLARED_VAC_COMPONENT],
  ] as const)("%s declares exactly the series, target and value_label of the fixture", (file, fx) => {
    const y = read(`${ROW_DIR}/${file}`);
    expect(flowMap(yamlLine(y, "target")), AT).toEqual(fx.reference);
    expect(yamlLine(y, "value_label"), AT).toBe(fx.value_label);
    const series = yamlLine(y, "series");
    const inner = /^\[(\{.*\})\]$/.exec(series);
    expect(inner, `${AT}: series is no longer a one-entry flow list: ${series}`).not.toBeNull();
    expect([flowMap(inner![1])], AT).toEqual(fx.series);
  });
});

describe("the seal RAN, or says so", () => {
  it("resolved a producer checkout", () => {
    expect(
      ROOT,
      "no invincible-agent checkout found (set CORTEX_PRODUCER_ROOT): this seal SKIPPED ENTIRELY and verified nothing.",
    ).not.toBeNull();
  });
});
