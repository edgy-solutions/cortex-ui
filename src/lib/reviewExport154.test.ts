/**
 * THE #154 PROFILE SEAL. `FIXTURE_154_PROFILES` / `FIXTURE_154_COLUMNS` (what `reviewExportMock` serves) must
 * equal what the producer's `policy/exports/*.yaml` declare, field for field: name, format, granularity,
 * label and the ordered `columns[].output`. The loader globs `policy/exports/*.yaml` NON-recursively and
 * sorts by name, so the fixture is the sorted list and the producer's file COUNT must equal its length (a
 * third profile landing on the producer reds this file).
 *
 * Producer lookup follows `rowEditsWireParity.test.ts`: `CORTEX_PRODUCER_ROOT`, then the sibling
 * `invincible-agent` / `ia-01`. NO checkout means the last test reds by name (the seal verified nothing).
 * Measure from a `git archive` export at the pinned ref (`CORTEX_PRODUCER_REF`): the dev checkout may be
 * on another branch. No YAML parser is in deps: the four scalar keys and `- output:` lines are read by line.
 */
import { describe, it, expect } from "vitest";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { FIXTURE_154_COLUMNS, FIXTURE_154_PROFILES } from "./reviewExport";

function findExportsDir(): string | null {
  const rel = "policy/exports";
  const env = (process.env.CORTEX_PRODUCER_ROOT || "").trim();
  if (env && existsSync(path.join(env, rel))) return path.join(env, rel);
  for (const name of ["invincible-agent", "ia-01"]) {
    const p = path.join(__dirname, "../../..", name, rel);
    if (existsSync(p)) return p;
  }
  return null;
}
const DIR = findExportsDir();
const REF = (process.env.CORTEX_PRODUCER_REF || "").trim();
const AT = REF ? `producer at ${REF.slice(0, 7)}` : "producer (CORTEX_PRODUCER_REF unset)";

type Parsed = { name: string; format: string; granularity: string; label: string; columns: string[] };

function scalar(src: string, key: string): string {
  const m = new RegExp(`^${key}:[ \t]*(.*?)[ \t]*$`, "m").exec(src);
  if (!m) throw new Error(`policy/exports yaml: no top-level "${key}:" line`);
  return m[1]!.replace(/^"(.*)"$/, "$1");
}

/** Top-level scalars by line regex (column 0 only, so a nested key cannot match) and `columns[].output` in order. */
function parseProfile(src: string): Parsed {
  const text = src.replace(/\r\n/g, "\n");
  const columns = [...text.matchAll(/^ {2}- output:[ \t]*"([^"\n]*)"[ \t]*$/gm)].map((m) => m[1]!);
  if (columns.length === 0) throw new Error("policy/exports yaml: no `- output:` column lines");
  return { name: scalar(text, "name"), format: scalar(text, "format"), granularity: scalar(text, "granularity"), label: scalar(text, "label"), columns };
}

const FILES = DIR ? readdirSync(DIR).filter((f) => f.endsWith(".yaml")).sort() : [];
const PRODUCER = FILES.map((f) => parseProfile(readFileSync(path.join(DIR!, f), "utf8"))).sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));

describe("the parser", () => {
  const Y = 'name: x\nlabel: "L, with comma"\nformat: csv\ngranularity: notice_part\ncolumns:\n  - output: "A"\n    source: {field: a}\n  - output: "B"\n';
  it("reads the four scalars and the ordered outputs", () => {
    expect(parseProfile(Y)).toEqual({ name: "x", label: "L, with comma", format: "csv", granularity: "notice_part", columns: ["A", "B"] });
  });
  it("throws on a missing key rather than comparing nothing", () => {
    expect(() => parseProfile(Y.replace("granularity: notice_part\n", ""))).toThrow(/granularity/);
    expect(() => parseProfile("name: x\n")).toThrow();
  });
});

describe.skipIf(DIR === null)("FIXTURE_154_PROFILES equals the producer's policy/exports", () => {
  it("the producer's yaml count equals the fixture's length (cardinality)", () => {
    expect(FILES.length, AT).toBe(FIXTURE_154_PROFILES.length);
  });
  it("every profile equals the producer's, field for field, in name order", () => {
    expect(
      FIXTURE_154_PROFILES.map((p) => ({ name: p.name, format: p.format, granularity: p.granularity, label: p.label })),
      AT,
    ).toEqual(PRODUCER.map((p) => ({ name: p.name, format: p.format, granularity: p.granularity, label: p.label })));
  });
  it("the fixture's columns equal each profile's columns[].output, in order", () => {
    expect(Object.keys(FIXTURE_154_COLUMNS).sort(), AT).toEqual(PRODUCER.map((p) => p.name));
    for (const p of PRODUCER) expect(FIXTURE_154_COLUMNS[p.name], `${p.name} ${AT}`).toEqual(p.columns);
  });
});

describe("the seal RAN, or says so", () => {
  it("resolved a producer policy/exports directory", () => {
    expect(DIR, "no invincible-agent checkout found (set CORTEX_PRODUCER_ROOT): this seal SKIPPED ENTIRELY and verified nothing.").not.toBeNull();
  });
});
