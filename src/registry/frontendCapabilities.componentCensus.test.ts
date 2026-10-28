/**
 * CENSUS: every `component` string the hand table `CORTEX_UI_CAPABILITIES` declares names a component that
 * EXISTS -- a non-test source file under src/ that exports a symbol of that name.
 *
 * Why: the table declared `component: "WorkflowCanvas"` for PROCESS_TOPOLOGY after that component was deleted
 * (replaced by ProcessTopologyCard); nothing noticed, because the name is only ever a string.
 *
 * The population is the table's own rows (imported, not listed here). The match is on an EXPORTED SYMBOL, not
 * on the file basename: `MarkdownRenderer` is a real, working component exported from
 * archetypes/knowledge-document/Card.tsx, and a basename rule would call it missing.
 */
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, it, expect } from "vitest";
import { CORTEX_UI_CAPABILITIES } from "./frontendCapabilities";

const SRC = path.join(__dirname, "..");

function* walk(dir: string): Generator<string> {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) yield* walk(p);
    else if (/\.(tsx?|jsx?)$/.test(e.name) && !/\.(test|spec)\.|\.d\.ts$/.test(e.name)) yield p;
  }
}

const EXPORTED = new Map<string, string[]>();
for (const f of walk(SRC)) {
  const text = readFileSync(f, "utf8");
  for (const m of text.matchAll(/^export\s+(?:default\s+)?(?:async\s+)?(?:const|function|class)\s+([A-Za-z_$][\w$]*)/gm)) {
    EXPORTED.set(m[1], [...(EXPORTED.get(m[1]) ?? []), path.relative(SRC, f)]);
  }
}

/** The census proper; exported to the test body below so a mutant can be run over a renamed row. */
function missingComponents(names: readonly string[]): string[] {
  return [...new Set(names)].filter((n) => !EXPORTED.has(n)).sort();
}

describe("frontendCapabilities: every declared component exists", () => {
  const names = CORTEX_UI_CAPABILITIES.map((c) => c.component).filter((c) => c !== "");

  it("positive control: the census sees the table and the exports", () => {
    expect(names.length).toBeGreaterThanOrEqual(10);
    expect(EXPORTED.size).toBeGreaterThan(100);
    expect(EXPORTED.get("ProcessTopologyCard")).toBeDefined();
  });

  it("every `component` names an exported symbol under src/", () => {
    expect(missingComponents(names), "declared but no such component").toEqual([]);
  });

  it("negative control: a deleted component name is caught", () => {
    expect(missingComponents([...names, "WorkflowCanvasGoneForever"])).toEqual(["WorkflowCanvasGoneForever"]);
  });

  it("PROCESS_TOPOLOGY declares the component that renders it", () => {
    const row = CORTEX_UI_CAPABILITIES.find((c) => c.archetype === "PROCESS_TOPOLOGY");
    expect(row?.component).toBe("ProcessTopologyCard");
  });
});
