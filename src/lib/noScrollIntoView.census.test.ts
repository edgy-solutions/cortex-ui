/**
 * No code under src/ calls scrollIntoView: it scrolls every scrollable ancestor, including the stage's
 * overflow:hidden boxes (2026-11-16). Use scrollWithinPane. Comments are stripped, so prose may mention it.
 */
import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

const SRC = path.join(__dirname, "..");
const PAT = /scrollIntoView\s*(\?\.)?\s*\(/;
function stripComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ""))
    .replace(/(^|[\s;,(){}])\/\/.*$/gm, "$1");
}
function walk(dir: string, rel: string, out: string[]): string[] {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const r = rel ? rel + "/" + e.name : e.name;
    if (e.isDirectory()) walk(path.join(dir, e.name), r, out);
    else if (e.isFile() && /\.(ts|tsx)$/.test(e.name) && !/\.test\./.test(e.name)) out.push(r);
  }
  return out;
}
const files = walk(SRC, "", []);

describe(`no scrollIntoView call in src/ (${files.length} non-test files scanned)`, () => {
  it("the instrument: the census scanned more than 100 files", () => {
    expect(files.length, `scanned ${files.length}`).toBeGreaterThan(100);
  });
  it("control: the pattern matches a call and ignores a comment", () => {
    expect(PAT.test(stripComments("a?.scrollIntoView?.({});"))).toBe(true);
    expect(PAT.test(stripComments("// el.scrollIntoView({})\n/* x.scrollIntoView() */"))).toBe(false);
  });
  // NO EXEMPTION. scrollWithinPane moves scrollTop/scrollLeft itself; it never calls scrollIntoView,
  // so an allowance for it would only excuse a call added there later.
  it("no file calls it", () => {
    const offenders: string[] = [];
    for (const f of files) {
      const lines = stripComments(readFileSync(path.join(SRC, f), "utf8")).split("\n");
      lines.forEach((l, i) => {
        if (PAT.test(l)) offenders.push(`src/${f}:${i + 1}`);
      });
    }
    expect(offenders, `offenders (of ${files.length} files):\n${offenders.join("\n")}`).toEqual([]);
  });
});
