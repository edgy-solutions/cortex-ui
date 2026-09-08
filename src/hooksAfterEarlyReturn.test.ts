/**
 * NO HOOK MAY BE CALLED AFTER AN EARLY RETURN — asserted across EVERY component, not one.
 *
 * ── THE DEFECT THIS CLOSES, AND WHY IT REACHED PRODUCTION ─────────────────────────────────
 *
 * `useAskedBy` sat below `if (!routing) return null` in `DecisionPathDiagram`. A page with
 * nothing routed ran five hooks; the first route decision arrived, the guard stopped firing,
 * and six ran. React throws on that transition — #310, "rendered more hooks than during the
 * previous render" — so every session's FIRST QUESTION crashed. Not a degraded render: a throw.
 *
 * NO TEST CAUGHT IT BECAUSE EVERY TEST MOUNTED ONE STATE AND ASSERTED ABOUT THAT STATE. The
 * defect exists in NEITHER state; it exists in the move between them. `cortex-ui-ba` fixed the
 * instance, added the transition test that reproduces the production error, and added a
 * source-level guard for that one file.
 *
 * THIS IS THE POPULATION. The per-file guard is right and it protects one file, and the next
 * hook anyone adds will want that same natural spot in some other component. This repo has the
 * precedent written down: `seedPortfolioCanvas.reachability.test.ts` turned a one-off into a
 * LAW — "every module installing a `__cortex*` global must be reachable from the entry point" —
 * rather than a path, and the reason given was that a fix applied to the instances someone
 * could recall is not a fix applied to the population that shares the cause.
 *
 * ── WHY AN AST WALK AND NOT A REGEX ───────────────────────────────────────────────────────
 *
 * The honest version needs to know where a function BODY ends, which line-matching cannot do —
 * an early return in one component and a hook in the next component down the same file is not
 * a defect, and a regex that flagged it would be turned off within a week. `typescript` is
 * already a dependency because `tsc` runs in the build, so the compiler's own parser is free.
 *
 * ── WHAT IS DELIBERATELY NOT ASSERTED ─────────────────────────────────────────────────────
 *
 * Hooks inside conditionals, loops or callbacks are also violations and are NOT checked here.
 * `react-hooks/rules-of-hooks` catches all of it and this repo has no ESLint at all — no
 * config, no plugin, no script. That is the real gap and it is filed rather than papered over:
 * this closes the one shape that has actually shipped a crash, and does not pretend to be the
 * lint rule.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import os from "node:os";
import ts from "typescript";
import { parseSourceOrThrow } from "@/lib/parseSource";

const SRC = path.join(__dirname);

function tsxFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) {
      if (entry === "node_modules" || entry === "__spike__") continue;
      tsxFiles(full, out);
    } else if (entry.endsWith(".tsx") && !entry.includes(".test.")) {
      out.push(full);
    }
  }
  return out;
}

const isHookName = (name: string) => /^use[A-Z]/.test(name);

/**
 * Every `use*()` call that appears AFTER an early return in the same function body.
 *
 * "Early return" means a return statement at the top level of the body that is not the last
 * statement — i.e. one guarded by an `if` above it, or a bare one. React only cares that the
 * number of hooks executed can differ between renders, and that is exactly what a return before
 * a hook produces.
 */
function violations(file: string): string[] {
  const src = readFileSync(file, "utf8");
  const sf = parseSourceOrThrow(file, src);
  const found: string[] = [];

  const checkBody = (body: ts.Node, fnName: string) => {
    if (!ts.isBlock(body)) return;
    const statements = body.statements;
    let earlyReturnAt = -1;
    statements.forEach((stmt, i) => {
      if (i === statements.length - 1) return; // the final return is not early
      // A guarded return: `if (x) return null;` or an if-block containing a return.
      const guarded =
        ts.isIfStatement(stmt) &&
        (ts.isReturnStatement(stmt.thenStatement) ||
          (ts.isBlock(stmt.thenStatement) &&
            stmt.thenStatement.statements.some((s) => ts.isReturnStatement(s))));
      if ((guarded || ts.isReturnStatement(stmt)) && earlyReturnAt === -1) earlyReturnAt = i;
    });
    if (earlyReturnAt === -1) return;

    for (let i = earlyReturnAt + 1; i < statements.length; i++) {
      const stmt = statements[i];
      ts.forEachChild(stmt, function walk(node): void {
        // Do NOT descend into nested functions: a hook inside a callback is a different
        // violation, and one this check does not claim to make.
        if (
          ts.isFunctionDeclaration(node) ||
          ts.isFunctionExpression(node) ||
          ts.isArrowFunction(node)
        ) {
          return;
        }
        if (ts.isCallExpression(node) && ts.isIdentifier(node.expression)) {
          const name = node.expression.text;
          if (isHookName(name)) {
            const { line } = sf.getLineAndCharacterOfPosition(node.getStart(sf));
            found.push(
              `${path.relative(SRC, file).replace(/\\/g, "/")}:${line + 1} — ${fnName}() ` +
                `calls ${name}() after an early return`,
            );
          }
        }
        ts.forEachChild(node, walk);
      });
    }
  };

  const visit = (node: ts.Node): void => {
    if (ts.isFunctionDeclaration(node) && node.body && node.name) {
      checkBody(node.body, node.name.text);
    }
    if (ts.isVariableStatement(node)) {
      for (const decl of node.declarationList.declarations) {
        const init = decl.initializer;
        if (
          init &&
          (ts.isArrowFunction(init) || ts.isFunctionExpression(init)) &&
          init.body &&
          ts.isIdentifier(decl.name)
        ) {
          checkBody(init.body, decl.name.text);
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  ts.forEachChild(sf, visit);
  return found;
}

describe("hook order cannot differ between renders", () => {
  const files = tsxFiles(SRC);

  it("the scanner reads a real population — positive control", () => {
    // A walk that found no files would report zero violations and look like a clean bill of
    // health. This is the same control the LangGraph lane's `helm template` grep needed: an
    // absence assertion is only worth its positive control.
    expect(files.length).toBeGreaterThan(30);
  });

  it("the scanner DETECTS the production defect — the control that matters", () => {
    // Reconstructed from `DecisionPathDiagram` as it shipped: the hook below the guard. Without
    // this, a scanner with a broken matcher would report zero and read as green forever.
    const broken = `
      export function Card() {
        const routing = useCurrentRouting();
        if (!routing) return null;
        const asked = useAskedBy(routing);
        return <div>{asked}</div>;
      }
    `;
    // WRITTEN TO THE OS TEMP DIR, NOT INTO `src`. Three AST scans in this suite walk
    // `src` and vitest runs files in PARALLEL, so a probe living there is a fixture that can
    // appear inside another test's population mid-walk. A test that alters the tree it and
    // its neighbours are asserting over is a flake with a plausible failure message.
    const tmp = path.join(os.tmpdir(), "__hookscan_probe__.tsx");
    const fs = require("node:fs") as typeof import("node:fs");
    fs.writeFileSync(tmp, broken);
    try {
      const hits = violations(tmp);
      expect(hits).toHaveLength(1);
      expect(hits[0]).toContain("useAskedBy");
    } finally {
      fs.unlinkSync(tmp);
    }
  });

  it("REFUSES source that did not parse, instead of reporting no violations", () => {
    // The hole under every absence assertion in this file. `ts.createSourceFile` is
    // error-tolerant by design: it does not throw on a syntax error, it returns a degraded tree
    // and files the problem on `parseDiagnostics`, which nothing was reading. A probe fixture
    // with a typo therefore parsed to garbage, the walk found nothing because it could no
    // longer see the constructs it looks for, and the test went green FOR THE OPPOSITE REASON
    // to the one in its comment.
    //
    // The LangGraph lane hit this from the other side the same day — an `ast.parse` check that
    // accepted a file which could not be imported, because `return` outside a function is a
    // compile-time error and not a parse-time one. Same rule in two languages: a parser is not
    // a validator, and a checker weaker than its subject reports green on a broken subject.
    const broken = `
      export function Card() {
        const routing = useCurrentRouting();
        if (!routing) return null
        const asked = useAskedBy(
      }
    `;
    const tmp = path.join(os.tmpdir(), "__hookscan_unparseable__.tsx");
    const fs = require("node:fs") as typeof import("node:fs");
    fs.writeFileSync(tmp, broken);
    try {
      // Before the guard this returned [] and read as a clean bill of health.
      expect(() => violations(tmp)).toThrow(/did not parse/);
    } finally {
      fs.unlinkSync(tmp);
    }
  });

  it("does NOT flag a hook that merely sits below an unrelated nested return", () => {
    // The false positive that would get this test deleted: a return inside a callback, or a
    // second component further down the same file, is not a violation.
    const fine = `
      export function Card() {
        const a = useOne();
        const cb = () => { if (!a) return null; return 1; };
        const b = useTwo();
        return <div>{b}{cb()}</div>;
      }
      export function Other() {
        if (!globalThis) return null;
        return <div />;
      }
    `;
    // WRITTEN TO THE OS TEMP DIR, NOT INTO `src`. Three AST scans in this suite walk
    // `src` and vitest runs files in PARALLEL, so a probe living there is a fixture that can
    // appear inside another test's population mid-walk. A test that alters the tree it and
    // its neighbours are asserting over is a flake with a plausible failure message.
    const tmp = path.join(os.tmpdir(), "__hookscan_probe2__.tsx");
    const fs = require("node:fs") as typeof import("node:fs");
    fs.writeFileSync(tmp, fine);
    try {
      expect(violations(tmp)).toEqual([]);
    } finally {
      fs.unlinkSync(tmp);
    }
  });

  it("no component in this tree calls a hook after an early return", () => {
    const all = files.flatMap(violations);
    expect(all, all.join("\n")).toEqual([]);
  });
});
