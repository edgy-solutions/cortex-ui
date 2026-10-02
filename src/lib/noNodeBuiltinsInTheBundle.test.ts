/**
 * Nothing that ships may import a Node builtin. `tsc` and vitest both run under Node and resolve
 * `node:fs` happily; only `vite build` refuses it, and in CI that runs inside the Docker image
 * step, after every check has passed. A fixture importing `readFileSync` (never even called)
 * broke the bundle for every push from 2915e36 to 77506a1 with all checks green. This puts the
 * contradicting check in the suite, where it runs before the image step.
 *
 * Population: every .ts/.tsx under src/ that is not a test file. Test files run only under
 * vitest and may use Node freely.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { builtinModules } from "node:module";

const SRC = join(__dirname, "..");
const isTest = (f: string) => /\.test\.(ts|tsx)$/.test(f);

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(ts|tsx)$/.test(name) && !isTest(name)) out.push(p);
  }
  return out;
}

const BUILTINS = new Set(builtinModules.flatMap((m) => [m, `node:${m}`]));
const SPECIFIER = /(?:\bfrom\s*|\bimport\s*\(?\s*|\brequire\s*\(\s*)["']([^"']+)["']/g;

export function nodeBuiltinImports(text: string): string[] {
  return [...text.matchAll(SPECIFIER)].map((m) => m[1]).filter((s) => BUILTINS.has(s));
}

describe("no Node builtin reaches the browser bundle", () => {
  it("the detector sees the forms it must (positive control)", () => {
    expect(nodeBuiltinImports(`import { readFileSync } from "node:fs";`)).toEqual(["node:fs"]);
    expect(nodeBuiltinImports(`import path from 'path';`)).toEqual(["path"]);
    expect(nodeBuiltinImports(`const m = await import("node:module");`)).toEqual(["node:module"]);
    expect(nodeBuiltinImports(`import x from "@/lib/fs"; import y from "react";`)).toEqual([]);
  });

  it("no shipped src file imports one", () => {
    const files = walk(SRC);
    expect(files.length, "the walk found the src population").toBeGreaterThan(200);
    const offenders = files
      .map((f) => ({ f: relative(SRC, f).split(sep).join("/"), hits: nodeBuiltinImports(readFileSync(f, "utf8")) }))
      .filter((o) => o.hits.length > 0)
      .map((o) => `${o.f}: ${o.hits.join(", ")}`);
    expect(offenders, "these ship to the browser and vite build cannot resolve Node builtins").toEqual([]);
  });
});
