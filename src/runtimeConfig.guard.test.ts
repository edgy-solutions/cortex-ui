import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { config } from "./config";

/**
 * Runtime config guard — item 5, "every VITE_ flag reads from the container config at start."
 *
 * src/lib/featureFlags.test.ts already seals that the entrypoint's written key set equals
 * `Object.keys(config)` from src/config.ts. That seal is DERIVED from config.ts, so a flag
 * read OUTSIDE config.ts (the shape of the mockGroundingEmitter.ts bug this item fixes) escapes
 * it entirely — it never touches config.ts, so the two key sets can agree while a real flag is
 * still fixed at build time. This guard closes that gap from the other side: it scans the
 * SOURCE TEXT of every non-test file under src for the only two ways a build-time read can
 * happen (`import.meta` for anything but `.glob`, or a `VITE_` token), and checks each is
 * accounted for.
 *
 * Reads with node:fs, like dependencyLicense.guard.test.ts — this guards the text of the repo,
 * not a snapshot of it.
 */

const REPO = path.resolve(__dirname, "..");
const SRC = path.join(REPO, "src");
const EXTENSIONS = [".ts", ".tsx"];
const CONFIG_PATH = path.join(SRC, "config.ts");

function isTestFile(name: string): boolean {
  return name.endsWith(".test.ts") || name.endsWith(".test.tsx");
}

function walk(dir: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...walk(full));
    } else if (EXTENSIONS.some((ext) => entry.name.endsWith(ext)) && !isTestFile(entry.name)) {
      files.push(full);
    }
  }
  return files;
}

function rel(p: string): string {
  return path.relative(REPO, p).split(path.sep).join("/");
}

/**
 * Comment stripper — lexer-ish, NOT a full TS parser. Removes `//…` line comments and
 * `/*…*\/` block comments while copying string/template contents through untouched, so a URL
 * like "http://x" inside a string survives: the scanner is inside the string by the time it
 * reaches the `//`, and the string-copy loop below only watches for the matching close quote
 * (or an escape), never for `/`.
 *
 * KNOWN LIMITATION, scoped honestly: this does not understand regex literals. A literal like
 * `/https:\/\//` is indistinguishable, without full tokenising, from a division operator
 * followed by stray text — this scanner would treat its first `/` as neither a comment opener
 * nor a string delimiter and just copy it through, which happens to be harmless for THIS guard
 * (it only ever greps the output for `import.meta` and `VITE_…` tokens, neither of which looks
 * like that) but would mis-scan a regex containing `//` as a line comment if one is ever typed
 * where this stripper's `//`-check runs before a `/` is recognised as starting a regex. No file
 * under src currently has a `//`-bearing regex literal; if one is added, this stripper needs a
 * regex-literal arm.
 */
function stripComments(src: string): string {
  let out = "";
  let i = 0;
  const n = src.length;
  while (i < n) {
    const c = src[i];
    const next = i + 1 < n ? src[i + 1] : "";
    if (c === "/" && next === "/") {
      i += 2;
      while (i < n && src[i] !== "\n") i += 1;
      continue;
    }
    if (c === "/" && next === "*") {
      i += 2;
      while (i < n && !(src[i] === "*" && src[i + 1] === "/")) i += 1;
      i += 2;
      continue;
    }
    if (c === '"' || c === "'" || c === "`") {
      const quote = c;
      out += c;
      i += 1;
      while (i < n && src[i] !== quote) {
        if (src[i] === "\\" && i + 1 < n) {
          out += src[i] + src[i + 1];
          i += 2;
          continue;
        }
        out += src[i];
        i += 1;
      }
      if (i < n) {
        out += src[i];
        i += 1;
      }
      continue;
    }
    out += c;
    i += 1;
  }
  return out;
}

/** Count of `import.meta` occurrences in `stripped` NOT immediately followed by `.glob`. Keyed
 *  on the subject `import.meta`, not the spelling `import.meta.env`, so a cast like
 *  `(import.meta as X).env` is caught too. */
function importMetaViolations(stripped: string): number {
  const NEEDLE = "import.meta";
  let count = 0;
  let idx = stripped.indexOf(NEEDLE);
  while (idx !== -1) {
    const after = stripped.slice(idx + NEEDLE.length, idx + NEEDLE.length + 5);
    if (after !== ".glob") count += 1;
    idx = stripped.indexOf(NEEDLE, idx + NEEDLE.length);
  }
  return count;
}

const ALL_FILES = walk(SRC);
const STRIPPED_BY_FILE = new Map<string, string>();
for (const f of ALL_FILES) {
  STRIPPED_BY_FILE.set(f, stripComments(readFileSync(f, "utf8")));
}

describe("runtime config guard — positive control", () => {
  it("scans more than 100 non-test .ts/.tsx files under src", () => {
    // The instrument: print the count so a walker that silently stopped seeing the tree (wrong
    // root, swallowed exception, renamed src/) reads as a visibly tiny number, not a quiet skip.
    // eslint-disable-next-line no-console
    console.log(`runtimeConfig.guard.test.ts: scanned ${ALL_FILES.length} files`);
    expect(ALL_FILES.length).toBeGreaterThan(100);
  });
});

describe("A. import.meta subject census", () => {
  it("no file except src/config.ts reads import.meta for anything but .glob", () => {
    const offenders: string[] = [];
    for (const [file, stripped] of STRIPPED_BY_FILE) {
      if (file === CONFIG_PATH) continue;
      if (importMetaViolations(stripped) > 0) offenders.push(rel(file));
    }
    expect(offenders, offenders.join("\n")).toEqual([]);
  });
});

describe("B. every VITE_ token is a key of config", () => {
  it("every VITE_[A-Z0-9_]+ token in comment-stripped non-test src is Object.keys(config)", () => {
    const configKeys = new Set(Object.keys(config));
    const found = new Set<string>();
    const unknown = new Set<string>();
    for (const stripped of STRIPPED_BY_FILE.values()) {
      for (const m of stripped.match(/VITE_[A-Z0-9_]+/g) ?? []) {
        found.add(m);
        if (!configKeys.has(m)) unknown.add(m);
      }
    }
    // Not vacuous: the census must actually find real VITE_ tokens to be worth anything.
    expect(found.size).toBeGreaterThan(0);
    expect([...unknown], [...unknown].join("\n")).toEqual([]);
  });
});

describe("C. .env.example key set equals Object.keys(config)", () => {
  it("every config key is listed, and nothing else is", () => {
    const raw = readFileSync(path.join(REPO, ".env.example"), "utf8");
    const keys = raw
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l.length > 0 && !l.startsWith("#"))
      .map((l) => l.split("=")[0]!.trim())
      .sort();
    expect(keys).toEqual(Object.keys(config).sort());
  });
});

describe("D. config.js loads before the bundle", () => {
  it('index.html has <script src="/config.js"> before the first type="module" script', () => {
    const html = readFileSync(path.join(REPO, "index.html"), "utf8");
    const configIdx = html.indexOf('src="/config.js"');
    const moduleIdx = html.indexOf('type="module"');
    expect(configIdx, "config.js script tag not found in index.html").toBeGreaterThan(-1);
    expect(moduleIdx, 'no type="module" script found in index.html').toBeGreaterThan(-1);
    expect(configIdx).toBeLessThan(moduleIdx);
  });
});

describe("E. stripComments — near side and string safety", () => {
  it("a comment mentioning import.meta.env (line or block) is not counted by the subject census", () => {
    const fixture = [
      "// import.meta.env.VITE_FOO is mentioned here, in a comment, not code",
      "/* import.meta.env.VITE_BAR also mentioned here, in a block comment */",
      'const real = "fine";',
    ].join("\n");
    expect(importMetaViolations(stripComments(fixture))).toBe(0);
  });

  it("does not eat a // inside a string", () => {
    const fixture = 'const url = "http://x"; // a real comment, dropped';
    const stripped = stripComments(fixture);
    expect(stripped).toContain('"http://x"');
    expect(stripped).not.toContain("a real comment");
  });
});
