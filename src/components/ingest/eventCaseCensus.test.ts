/**
 * SOURCE CENSUS — nothing under `src/components/ingest/` imports the workflow-case card.
 *
 * An event's case is drawn through `SemanticInterpreter` (`{archetype: "WORKFLOW_CASE", case}`),
 * because the interpreter's dispatch is where every WORKFLOW_CASE answer is drawn, and where
 * its raw fields are disclosed. A direct import of the card would skip that dispatch.
 */
import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

const DIR = __dirname;
const SOURCES = readdirSync(DIR).filter((f) => /\.(ts|tsx)$/.test(f));

/** Any import/export-from/dynamic-import/require whose specifier names workflow-case's Card. */
const FORBIDDEN =
  /(?:from\s*|import\s*\(\s*|require\s*\(\s*|import\s+)["'][^"']*archetypes\/workflow-case(?:\/Card)?(?:\.tsx?)?["']|["'][^"']*workflow-case\/Card(?:\.tsx?)?["']/;

describe("source census: ingest components never import the workflow-case Card", () => {
  it("the scan is inhabited (control) and includes the status card", () => {
    expect(SOURCES.length).toBeGreaterThan(5);
    expect(SOURCES).toContain("IngestStatusCard.tsx");
  });

  it("the pattern sees the forms it forbids (control)", () => {
    for (const bad of [
      `import { WorkflowCase } from "@/archetypes/workflow-case/Card";`,
      `import { WorkflowCase } from "../../archetypes/workflow-case/Card";`,
      `import pkg from "@/archetypes/workflow-case";`,
      `const m = await import("@/archetypes/workflow-case/Card");`,
    ]) {
      expect(FORBIDDEN.test(bad), bad).toBe(true);
    }
    expect(FORBIDDEN.test(`import { SemanticInterpreter } from "@/components/registry/SemanticInterpreter";`)).toBe(false);
  });

  it("no file under src/components/ingest imports it", () => {
    const offenders = SOURCES.filter((f) => {
      if (f === path.basename(__filename)) return false;
      return FORBIDDEN.test(readFileSync(path.join(DIR, f), "utf8"));
    });
    expect(offenders, `imports the workflow-case card directly: ${offenders.join(", ")}`).toEqual([]);
  });

  it("the status card draws cases through SemanticInterpreter", () => {
    const src = readFileSync(path.join(DIR, "IngestStatusCard.tsx"), "utf8");
    expect(src).toMatch(/from "@\/components\/registry\/SemanticInterpreter"/);
    expect(src).toMatch(/archetype: "WORKFLOW_CASE"/);
  });
});
