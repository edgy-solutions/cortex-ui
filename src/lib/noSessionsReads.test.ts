/**
 * No tracked code reads `sessions/`. Since 2026-11-14 `sessions/` is gitignored and never
 * committed, so in CI's checkout it does not exist. A test that reads a producer capture reads it
 * from `fixtures/captures/`, where it is tracked; a capture a seal must see is extracted there.
 *
 * The rule is on CODE-ONLY text (comments stripped): `sessions` as a path segment inside a string
 * or template literal. A comment citation resolves in git history and never trips it.
 *
 * This file's own snippets are built by concatenation (`S + "…"`), so the file needs no exemption.
 */
import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

const ROOT = path.join(__dirname, "../..");
const S = "ses" + "sions";

/** Strip `// …` line comments and block comments, keeping newlines so line numbers survive.
 *  Not string-aware: a `//` counts as a comment only at line start or after whitespace/`;,(){}`,
 *  so the `//` of a URL (`http://`, preceded by `:`) survives. A regex or quote containing `//`
 *  after whitespace would hide the rest of its line; the guard accepts that over a lexer. */
function stripComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ""))
    .replace(/(^|[\s;,(){}])\/\/.*$/gm, "$1");
}

const SEGMENT = new RegExp(`["'\`/]${S}(?=["'\`/])`);

/** 1-based line numbers of code-only lines that name `sessions` as a path segment. */
function offendingLines(src: string): number[] {
  const hits: number[] = [];
  stripComments(src).split("\n").forEach((line, idx) => { if (SEGMENT.test(line)) hits.push(idx + 1); });
  return hits;
}

/**
 * The population is a filesystem walk, not `git ls-files`: the suite also runs where there is no
 * `.git` (a `git archive` export, which is how a gate sees exactly what CI checks out), and a
 * guard that cannot list its population there crashes at collection with "0 test".
 * SKIP names directories that are never tracked. A name missing from it can only over-scan (a
 * stray untracked file trips the guard loudly), never hide a tracked one.
 */
const SKIP = new Set([".git", "node_modules", "dist", "dist-ssr", "coverage", S, ".claude", ".venv",
  "test-results", "playwright-report", "walk-out"]);
function walk(dir: string, rel: string, out: string[]): string[] {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const r = rel ? rel + "/" + e.name : e.name;
    if (e.isDirectory()) { if (!SKIP.has(e.name)) walk(path.join(dir, e.name), r, out); }
    else if (e.isFile() && /.(ts|tsx|mts|cts|js|mjs|cjs)$/.test(e.name)) out.push(r);
  }
  return out;
}
const files = walk(ROOT, "", []);

describe("no tracked code reads sessions/", () => {
  it("the instrument: enough files scanned, and this one among them", () => {
    expect(files.length, `scanned ${files.length} files; expected at least 500`).toBeGreaterThanOrEqual(500);
    expect(files, "this guard is not in its own population").toContain("src/lib/noSessionsReads.test.ts");
  });

  describe("positive controls: flagged", () => {
    const flagged: [string, string][] = [
      ["path.join with ../..", `readFileSync(path.join(__dirname, "../../${S}", f))`],
      ["template literal", "readFileSync(`" + S + "/${name}`)"],
      ["process.cwd join", `join(process.cwd(), "${S}")`],
      ["new URL", `new URL("../../${S}/x.json", import.meta.url)`],
    ];
    for (const [name, snippet] of flagged) {
      it(name, () => expect(offendingLines(snippet), snippet).toEqual([1]));
    }
  });

  describe("negative controls: not flagged", () => {
    const clean: [string, string][] = [
      ["line comment", `// see ${S}/2026-10-12-packet.md`],
      ["block comment", `/*\n * ${S}/foo.md\n */\nconst a = 1;`],
      ["the new directory", `const fixturesDir = "fixtures/captures"`],
    ];
    for (const [name, snippet] of clean) {
      it(name, () => expect(offendingLines(snippet), snippet).toEqual([]));
    }
  });

  it("the real arm: zero offenders over the tracked code", () => {
    const offenders: string[] = [];
    for (const f of files) {
      for (const line of offendingLines(readFileSync(path.join(ROOT, f), "utf8"))) {
        offenders.push(`${f}:${line} names ${S}/ as a path segment; read fixtures/captures/ instead`);
      }
    }
    expect(offenders, offenders.join("\n")).toEqual([]);
  });
});
