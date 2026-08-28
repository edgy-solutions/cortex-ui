import { readFileSync, existsSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
/**
 * A MODULE NO ONE IMPORTS DOES NOT EXIST.
 *
 * `seedPortfolioCanvas.ts` installs `window.__cortexSeedPortfolioCanvas` as a side effect and
 * says so in its own comment. That comment was false for two days. Nothing on the entry path
 * imported the module, so the bundler dropped it whole, so the side effect never ran and the
 * global was absent from every build — while its six unit tests passed, because a test imports
 * the function directly and thereby creates the very edge the application was missing.
 *
 * That is the failure this file exists for, and the shape is not specific to seeding: a guard
 * that exercises a mechanism proves the mechanism, and proves NOTHING about whether the running
 * program can get to it. Reachability is a separate claim and needs a separate assertion.
 *
 * ── WHY THE IMPORT GRAPH AND NOT THE BUILT BUNDLE ─────────────────────────────────────────
 *
 * The bundle is the truth, and grepping `dist/` would be the truest check — but it holds only
 * as long as someone has built, so it goes green on a stale artifact and red on a clean
 * checkout. Both are lies about the source. Walking the graph from the real entry point is a
 * static claim about what the bundler WILL be handed, and it is honest on a fresh clone.
 *
 * ── WHY IT IS A LAW AND NOT A PATH ────────────────────────────────────────────────────────
 *
 * The last assertion does not name `seedPortfolioCanvas`. It finds every module that installs a
 * `__cortex*` global and requires each to be reachable. Pinning the one path we already fixed
 * would guard the bug we already found; the next scaffolding global is the one that will be
 * unreachable, and it is caught the day it is written.
 */
import { describe, it, expect } from "vitest";

const SRC = path.join(__dirname, "..");
const ENTRY = path.join(SRC, "main.tsx");

/** Resolve a specifier to a file on disk, or null for packages and unresolvable paths. */
function resolve(spec: string, importer: string): string | null {
  let base: string;
  if (spec.startsWith("@/")) base = path.join(SRC, spec.slice(2));
  else if (spec.startsWith(".")) base = path.resolve(path.dirname(importer), spec);
  else return null; // a bare package specifier — node_modules, not ours
  const candidates = [
    base,
    base + ".ts",
    base + ".tsx",
    path.join(base, "index.ts"),
    path.join(base, "index.tsx"),
  ];
  for (const c of candidates) {
    if (existsSync(c) && statSync(c).isFile()) return c;
  }
  return null;
}

/**
 * Runtime import edges out of one file.
 *
 * `import type` is deliberately excluded: it is erased at compile time and creates no edge, so
 * counting it would report a module as reachable that the bundler never loads — the exact class
 * of false green this file exists to prevent.
 */
function edges(file: string): string[] {
  const src = readFileSync(file, "utf8");
  const out: string[] = [];
  const re = /(?:^|\n)\s*import\s+(type\s+)?([^;'"]*?)?["']([^"']+)["']/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src))) {
    if (m[1]) continue; // import type { ... } from "..."
    const clause = m[2] ?? "";
    if (/\btype\b\s*\{/.test(clause)) continue; // import { type X } is still an edge; this is not
    out.push(m[3]);
  }
  // Dynamic imports are real edges too.
  const dyn = /import\(\s*["']([^"']+)["']\s*\)/g;
  while ((m = dyn.exec(src))) out.push(m[1]);
  return out;
}

/** Every source file the bundler reaches starting from the real entry point. */
function reachableFromEntry(): Set<string> {
  const seen = new Set<string>();
  const queue = [ENTRY];
  while (queue.length) {
    const file = queue.pop()!;
    if (seen.has(file)) continue;
    seen.add(file);
    for (const spec of edges(file)) {
      const target = resolve(spec, file);
      if (target && !seen.has(target)) queue.push(target);
    }
  }
  return seen;
}

/** Every non-test source file under src/. */
function allSources(dir = SRC, acc: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) allSources(full, acc);
    else if (/\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name)) acc.push(full);
  }
  return acc;
}

const REACHABLE = reachableFromEntry();
const rel = (f: string) => path.relative(SRC, f).replace(/\\/g, "/");

describe("the bring-up trigger is reachable from the entry point", () => {
  it("the walk resolves real edges — positive control", () => {
    // Not merely non-empty: it must cross several hops and both specifier styles. main.tsx
    // reaches App.tsx, which reaches the store via "@/", which reaches stageConstants via "./".
    expect(REACHABLE.has(ENTRY)).toBe(true);
    const names = [...REACHABLE].map(rel);
    expect(names).toContain("App.tsx");
    expect(names).toContain("store/useStageStore.ts");
    expect(names).toContain("lib/stageConstants.ts");
  });

  it("the walk can report a module UNREACHABLE — negative control", () => {
    // Without this the suite would pass if `reachableFromEntry` returned every file on disk,
    // which is the shape of false green that would make the real assertion meaningless.
    const orphans = allSources().filter((f) => !REACHABLE.has(f));
    expect(orphans.length).toBeGreaterThan(0);
  });

  it("seedPortfolioCanvas.ts is on the entry path", () => {
    // The defect, stated directly. Red the moment App.tsx stops importing it and nothing else
    // picks it up.
    expect([...REACHABLE].map(rel)).toContain("lib/seedPortfolioCanvas.ts");
  });

  it("App.tsx imports it for its SIDE EFFECT, with no binding to drop", () => {
    // Reachability is necessary and not sufficient. An unused named binding is a thing a
    // bundler may eliminate; a bare import is a statement that the module must be evaluated.
    const app = readFileSync(path.join(SRC, "App.tsx"), "utf8");
    expect(app).toMatch(/^import "@\/lib\/seedPortfolioCanvas";$/m);
  });

  it("package.json does not declare sideEffects: false", () => {
    // That single field would re-authorise dropping the bare import above, silently undoing
    // this whole fix while every assertion in this file stayed green.
    const pkg = readFileSync(path.join(SRC, "..", "package.json"), "utf8");
    expect(pkg).not.toMatch(/"sideEffects"\s*:\s*false/);
  });
});

describe("the law, not the path", () => {
  it("EVERY module that installs a __cortex* global is reachable from the entry", () => {
    const installers = allSources().filter((f) => /__cortex\w*\s*\]?\s*=/.test(readFileSync(f, "utf8")));
    // Positive control: if the detector matches nothing, the assertion below is vacuous and
    // would pass forever after someone renamed the convention.
    expect(installers.length).toBeGreaterThan(0);
    const unreachable = installers.filter((f) => !REACHABLE.has(f)).map(rel);
    expect(unreachable).toEqual([]);
  });
});
