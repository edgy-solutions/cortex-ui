/**
 * THE MOCK-PROFILES SEAL. `FIXTURE_PROFILES` / `FIXTURE_COLUMNS` (what `reviewExportMock` serves) mirror what the
 * producer's `GET /ingest/export/profiles` serves, for a viewer granted every profile: the base rows
 * (`policy/exports/*.yaml`) composed with the sample overlay (`policy/overlays/sample/exports/*.yaml`; a row naming a
 * base row REPLACES it, `deleted: true` tombstones one), filled as `src/iagent/export_profiles.py` fills them.
 * The defaults (`_GRAIN_OF`, `DEFAULT_EXPORTABLE_STATES`, the promoted stage) are READ from the producer, never restated;
 * a missing anchor throws. The stage names in the fixture are spelled because the producer serves them.
 *
 * Producer lookup follows `reviewExport154.test.ts`: `CORTEX_PRODUCER_ROOT`, then the sibling `invincible-agent` / `ia-01`.
 * NO checkout means the last test reds by name. Measure from a `git archive` export at the pinned ref
 * (`CORTEX_PRODUCER_REF`). No YAML parser is in deps: flow lists, scalars and `- output:` lines are read by line.
 */
import { describe, it, expect } from "vitest";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { FIXTURE_COLUMNS, FIXTURE_PROFILES } from "./reviewExport";
import { INGEST_STAGES } from "./ingestWire";

/** Spelled this way so `scripts/check-cross-repo-seals.mjs` censuses this file (it keys on the name). */
const CANDIDATE_ROOTS = ["invincible-agent", "ia-01"];

function findRoot(): string | null {
  const rel = "policy/exports";
  const env = (process.env.CORTEX_PRODUCER_ROOT || "").trim();
  if (env && existsSync(path.join(env, rel))) return env;
  for (const name of CANDIDATE_ROOTS) {
    const p = path.join(__dirname, "../../..", name);
    if (existsSync(path.join(p, rel))) return p;
  }
  return null;
}
const ROOT = findRoot();
const REF = (process.env.CORTEX_PRODUCER_REF || "").trim();
const AT = REF ? `producer at ${REF.slice(0, 7)}` : "producer (CORTEX_PRODUCER_REF unset)";

type Row = {
  name: string;
  label: string;
  format: string;
  granularity: string;
  grain: string;
  version: number;
  accepts: string[] | null;
  dedupe: string[];
  exportable_states: string[];
};
type Raw = { name: string; deleted: boolean; scalars: Record<string, string>; lists: Record<string, string[]>; columns: string[] };

const text = (p: string): string => readFileSync(p, "utf8").replace(/\r\n/g, "\n");

/** A flow list `[a, "b"]`: bare and quoted items. */
function flowList(v: string): string[] {
  const m = /^\[(.*)\]$/.exec(v.trim());
  if (!m) throw new Error(`not a flow list: ${v}`);
  return m[1]!
    .split(",")
    .map((s) => s.trim().replace(/^"(.*)"$/, "$1").replace(/^'(.*)'$/, "$1"))
    .filter((s) => s !== "");
}

function parseRaw(src: string): Raw {
  const scalars: Record<string, string> = {};
  const lists: Record<string, string[]> = {};
  for (const m of src.matchAll(/^([a-z_]+):[ \t]*(.*?)[ \t]*$/gm)) {
    const v = m[2]!;
    if (v.startsWith("[")) lists[m[1]!] = flowList(v);
    else scalars[m[1]!] = v.replace(/^"(.*)"$/, "$1");
  }
  const columns = [...src.matchAll(/^ {2}- output:[ \t]*"([^"\n]*)"[ \t]*$/gm)].map((m) => m[1]!);
  if (!scalars.name) throw new Error("yaml: no top-level name:");
  return { name: scalars.name, deleted: scalars.deleted === "true", scalars, lists, columns };
}

function grainMap(py: string): Record<string, string> {
  const m = /^_GRAIN_OF = \{(.*)\}[ \t]*$/m.exec(py);
  if (!m) throw new Error("export_profiles.py: no `_GRAIN_OF = {...}` line");
  const out: Record<string, string> = {};
  for (const p of m[1]!.matchAll(/"([^"]+)":\s*"([^"]+)"/g)) out[p[1]!] = p[2]!;
  if (Object.keys(out).length === 0) throw new Error("export_profiles.py: _GRAIN_OF parsed empty");
  return out;
}

/** The default `exportable_states`: the producer's `DEFAULT_EXPORTABLE_STATES = (ingest_status.PROMOTED,)`, resolved through
 *  ingest_status.py's stage unpack (`A, B, PROMOTED = ("a", "b", "p")`, where the name is paired with its value). */
function defaultStates(py: string, status: string): string[] {
  if (!/^DEFAULT_EXPORTABLE_STATES = \(ingest_status\.PROMOTED,\)[ \t]*$/m.test(py))
    throw new Error("export_profiles.py: no `DEFAULT_EXPORTABLE_STATES = (ingest_status.PROMOTED,)` line");
  const m = /^([A-Z_, ]+) = \(\s*((?:"[^"\n]*",?\s*)+)\)/m.exec(status);
  if (!m) throw new Error("ingest_status.py: no stage-vocabulary unpack");
  const names = m[1]!.split(",").map((s) => s.trim());
  const values = [...m[2]!.matchAll(/"([^"\n]*)"/g)].map((x) => x[1]!);
  const i = names.indexOf("PROMOTED");
  if (i < 0 || names.length !== values.length || values[i] === undefined) throw new Error("ingest_status.py: PROMOTED not found in the unpack");
  return [values[i]!];
}

function derive(raw: Raw, grainOf: Record<string, string>, states: string[]): Row {
  const s = raw.scalars;
  const granularity = s.granularity ?? Object.entries(grainOf).find(([, g]) => g === s.grain)?.[0];
  const grain = s.grain ?? (granularity ? grainOf[granularity] : undefined);
  if (!granularity || !grain) throw new Error(`profile ${raw.name}: no granularity or grain`);
  return {
    name: raw.name,
    label: s.label!,
    format: s.format!,
    granularity,
    grain,
    version: Number(s.version),
    accepts: raw.lists.accepts ?? null,
    dedupe: raw.lists.dedupe ?? [],
    exportable_states: raw.lists.exportable_states ?? states,
  };
}

const yamls = (rel: string): Raw[] =>
  existsSync(path.join(ROOT!, rel))
    ? readdirSync(path.join(ROOT!, rel))
        .filter((f) => f.endsWith(".yaml"))
        .sort()
        .map((f) => parseRaw(text(path.join(ROOT!, rel, f))))
    : [];

function composed(): Raw[] {
  const by = new Map<string, Raw>();
  for (const r of yamls("policy/exports")) by.set(r.name, r);
  for (const r of yamls("policy/overlays/sample/exports")) {
    if (r.deleted) by.delete(r.name);
    else by.set(r.name, r);
  }
  return [...by.values()].sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
}

const PY = ROOT ? text(path.join(ROOT, "src/iagent/export_profiles.py")) : "";
const STATUS = ROOT ? text(path.join(ROOT, "src/iagent/ingest_status.py")) : "";
const SERVED = ROOT ? composed() : [];

describe("the parser", () => {
  it("reads bare and quoted flow items, and throws on a missing anchor", () => {
    expect(flowList('[review, "promoted"]')).toEqual(["review", "promoted"]);
    expect(flowList('["Part"]')).toEqual(["Part"]);
    expect(() => grainMap("x = 1")).toThrow(/_GRAIN_OF/);
    expect(() => defaultStates("x = 1", 'A, B = (\n "a", "b")')).toThrow(/DEFAULT_EXPORTABLE_STATES/);
    expect(() => defaultStates("DEFAULT_EXPORTABLE_STATES = (ingest_status.PROMOTED,)", "x = 1")).toThrow(/unpack/);
    expect(defaultStates("DEFAULT_EXPORTABLE_STATES = (ingest_status.PROMOTED,)", 'A, PROMOTED, B = (\n "a", "p",\n "b")')).toEqual(["p"]);
  });
});

describe(`the mock profiles mirror the served listing (${AT})`, () => {
  it("the composed base + sample overlay rows number exactly FIXTURE_PROFILES.length", () => {
    if (!ROOT) return;
    expect(SERVED.length, "base + overlay rows").toBe(FIXTURE_PROFILES.length);
  });

  it("each fixture row equals the derived served row, in name order", () => {
    if (!ROOT) return;
    const grainOf = grainMap(PY);
    const states = defaultStates(PY, STATUS);
    expect(FIXTURE_PROFILES).toEqual(SERVED.map((r) => derive(r, grainOf, states)));
  });

  it("FIXTURE_COLUMNS[name] equals each row's ordered `- output:` values", () => {
    if (!ROOT) return;
    for (const r of SERVED) expect(FIXTURE_COLUMNS[r.name], r.name).toEqual(r.columns);
  });

  it("every fixture state is one cortex knows", () => {
    for (const p of FIXTURE_PROFILES)
      for (const s of p.exportable_states ?? []) expect((INGEST_STAGES as readonly string[]).includes(s), `${p.name}: ${s}`).toBe(true);
  });

  it(`${AT} is present (no producer = the seal verified nothing)`, () => {
    expect(ROOT, "no producer found: set CORTEX_PRODUCER_ROOT to a `git archive` export of invincible-agent").not.toBeNull();
  });
});
