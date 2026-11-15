/**
 * Q2: the direct task read is gone. No code under `src/` (comments stripped) imports the Electric reader,
 * names the task-table shape, or REQUESTS `GET /me/human_tasks`. The population is a filesystem walk; the
 * instrument arm proves the walk sees files, and each pattern has a control that must match a code line and
 * must ignore a comment.
 *
 * The third rule keys on the CALL (a `request(` / `.get(` whose first argument is the path), not on the
 * string: the generated contract, the producer captures and the seal's NO_READER map legitimately NAME the
 * path, none of them requests it. Everything here is spelled by concatenation so this file is not an offender.
 */
import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

const SRC = path.join(__dirname, "..");
function stripComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ""))
    .replace(/(^|[\s;,(){}])\/\/.*$/gm, "$1");
}
function walk(dir: string, rel: string, out: string[]): string[] {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const r = rel ? rel + "/" + e.name : e.name;
    if (e.isDirectory()) walk(path.join(dir, e.name), r, out);
    else if (e.isFile() && /\.(ts|tsx|mts|cts|js|mjs|cjs)$/.test(e.name)) out.push(r);
  }
  return out;
}
const files = walk(SRC, "", []);
const texts = files.map((f): [string, string] => [f, readFileSync(path.join(SRC, f), "utf8")]);

const ELECTRIC = "electric" + "HumanTasks";
const SHAPE = "human_task_" + "projection";
const PATH = "/me/human_" + "tasks";

interface Rule { name: string; pat: RegExp; code: string }
const RULES: Rule[] = [
  { name: "imports the Electric task reader", pat: new RegExp(ELECTRIC), code: `import { x } from "@/lib/${ELECTRIC}";` },
  { name: "names the task-table shape", pat: new RegExp(SHAPE), code: `const t = "${SHAPE}";` },
  {
    name: "requests the direct task listing",
    pat: new RegExp("(?:request|\\.get)\\(\\s*[\"'`][^\"'`]*" + PATH),
    code: `await request("GET ${PATH}", {});`,
  },
];
const offenders = (pat: RegExp, ts: Array<[string, string]>) =>
  ts.filter(([, t]) => pat.test(stripComments(t))).map(([f]) => f);

describe("Q2: no code under src/ reads the task table directly", () => {
  it("the instrument: enough files scanned, and this one among them", () => {
    expect(files.length).toBeGreaterThanOrEqual(400);
    expect(files).toContain("lib/queueReadCensus.test.ts");
  });
  for (const { name, pat, code } of RULES) {
    it(`control: "${name}" matches a code line and ignores the same text in a comment`, () => {
      expect(offenders(pat, [["x", code]])).toEqual(["x"]);
      expect(offenders(pat, [["x", `// ${code}\n/* ${code} */`]])).toEqual([]);
    });
    it(`no file ${name}`, () => {
      expect(offenders(pat, texts)).toEqual([]);
    });
  }
});
