import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

/**
 * EVERY SCRIPT THE BUNDLE CAN LOAD IS SERVED AS JAVASCRIPT (P0, 2026-10-18).
 *
 * pdf.js's worker is imported as `pdf.worker.min.mjs?url`, so Vite emits it as `.mjs`. nginx
 * 1.25.5's stock `mime.types` maps only `js`, the conf's `default_type` is octet-stream, and the
 * server sends `nosniff`. A module worker served that way is refused by the browser, pdf.js
 * falls back to a "fake worker" that imports the same URL and is refused again, and every source
 * pane failed on real PDFs. Nothing in the suite could see it: jsdom stubs pdf.js, and `vite dev`
 * types `.mjs` itself. Measured in Chromium against the 1f5482f runtime config.
 *
 * The POPULATION is every extension a `?url` / `?worker` import names in `src/`, which is what
 * Vite emits as a separately fetched script, plus `js`. Each must be stock-typed or mapped by an
 * http-level `types` block. A `types` block inside `server`/`location` REPLACES the inherited map
 * for that scope (`.js` would go out as octet-stream there), so none is allowed below http.
 */

const ROOT = path.resolve(__dirname, "../..");
const JS_MIME = /^(text|application)\/javascript$/;
/** nginx 1.25.5 `conf/mime.types`: `application/javascript js;` and nothing else for scripts. */
const STOCK_SCRIPT_EXTS = ["js"];

type TypesBlock = { scope: string[]; map: Record<string, string> };

/** Every `types { … }` block with the chain of block names enclosing it. Comments are dropped. */
export function typesBlocks(conf: string): TypesBlock[] {
  const src = conf.replace(/#[^\n]*/g, "");
  const out: TypesBlock[] = [];
  const stack: string[] = [];
  const re = /([^{};]*)([{};])/g;
  let m: RegExpExecArray | null;
  let cur: TypesBlock | null = null;
  while ((m = re.exec(src))) {
    const text = m[1].trim();
    if (m[2] === "{") {
      const name = text.split(/\s+/)[0] ?? "";
      if (name === "types") {
        if (cur) throw new Error("nested types block");
        cur = { scope: [...stack], map: {} };
      }
      stack.push(name);
    } else if (m[2] === ";") {
      if (cur && text) {
        const [mime, ...exts] = text.split(/\s+/);
        for (const e of exts) cur.map[e] = mime;
      }
    } else {
      const closed = stack.pop();
      if (closed === undefined) throw new Error("unbalanced }");
      if (closed === "types" && cur) {
        out.push(cur);
        cur = null;
      }
    }
  }
  if (stack.length) throw new Error(`unclosed block: ${stack.join(" > ")}`);
  return out;
}

/** Extensions named by `?url` / `?worker` import specifiers (static or dynamic) in one file. */
export function scriptUrlExts(text: string): string[] {
  const exts: string[] = [];
  for (const m of text.matchAll(/["'`]([^"'`\s]+?)\?(?:url|worker)\b[^"'`]*["'`]/g)) {
    const ext = path.extname(m[1]).slice(1);
    if (["js", "mjs", "cjs", "ts", "mts", "tsx", "jsx"].includes(ext)) exts.push(ext);
  }
  return exts;
}

function walk(dir: string, acc: string[] = []): string[] {
  for (const n of readdirSync(dir)) {
    const p = path.join(dir, n);
    if (statSync(p).isDirectory()) walk(p, acc);
    else if (/\.(ts|tsx)$/.test(n) && !/\.test\.tsx?$/.test(n)) acc.push(p);
  }
  return acc;
}

/** A TS/TSX source compiles to `.js`; only a raw JS-family specifier keeps its own extension. */
const emitted = (ext: string) => (["ts", "mts", "tsx", "jsx"].includes(ext) ? "js" : ext);

describe("the parser, on fixtures", () => {
  it("reads the scope of each types block, ignoring comments", () => {
    const b = typesBlocks(`http { include mime.types; # types { x y; }\n types { text/javascript mjs; } server { location /a/ { types { a/b c; } } } }`);
    expect(b).toEqual([
      { scope: ["http"], map: { mjs: "text/javascript" } },
      { scope: ["http", "server", "location"], map: { c: "a/b" } },
    ]);
  });
  it("throws on unbalanced braces", () => {
    expect(() => typesBlocks("http { server {")).toThrow(/unclosed/);
    expect(() => typesBlocks("http { } }")).toThrow(/unbalanced/);
  });
  it("finds static, dynamic and worker url specifiers, with their extension", () => {
    expect(scriptUrlExts(`import w from "a/b.min.mjs?url"; import("c/d.js?url"); new URL("x.png?url"); import W from "./w.ts?worker&url";`)).toEqual(["mjs", "js", "ts"]);
  });
});

describe("nginx.conf serves every script the bundle loads as JavaScript", () => {
  const conf = readFileSync(path.join(ROOT, "nginx.conf"), "utf8");
  const blocks = typesBlocks(conf);
  const files = walk(path.join(ROOT, "src"));
  const exts = new Set(["js", ...files.flatMap((f) => scriptUrlExts(readFileSync(f, "utf8"))).map(emitted)]);

  it("the census found the pdf.js worker's .mjs at least (a walk that finds nothing passes everything)", () => {
    expect(files.length).toBeGreaterThan(100);
    expect([...exts]).toContain("mjs");
  });

  it("every emitted script extension is stock-typed or mapped to a JavaScript MIME at http level", () => {
    const httpMap = Object.assign({}, ...blocks.filter((b) => b.scope.join(">") === "http").map((b) => b.map));
    const untyped = [...exts].filter((e) => !STOCK_SCRIPT_EXTS.includes(e) && !JS_MIME.test(httpMap[e] ?? ""));
    expect(untyped, "these would be served application/octet-stream + nosniff, which a module script refuses").toEqual([]);
  });

  it("no types block sits below http, where it would replace the stock map (and untype .js)", () => {
    const below = blocks.filter((b) => b.scope.join(">") !== "http").map((b) => b.scope.join(" > "));
    expect(below).toEqual([]);
  });

  it("the stock map is nginx 1.25's: the runtime image is still nginx:1.25", () => {
    const dockerfile = readFileSync(path.join(ROOT, "Dockerfile"), "utf8");
    expect(dockerfile).toMatch(/^FROM nginx:1\.25(\.\d+)?-alpine\s*$/m);
  });
});
