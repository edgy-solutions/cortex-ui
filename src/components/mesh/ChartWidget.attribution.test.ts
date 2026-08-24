import { readFileSync } from "node:fs";
import path from "node:path";
/**
 * A provenance product must not mislabel its own provenance.
 *
 * This component used to caption every chart "Headless Analyst Preview" and print
 * "ENGINE: ANALYST_A" in its footer. Neither was read from anything: `SemanticInterpreter`
 * passes only the contract's fields (chart_data / chart_type / subject_concept / sql_query),
 * so no provenance reaches this component at all. The engine name was a literal — a
 * template's assumption about where answers come from, baked in when the only producer WAS
 * the analyst path. Every plan-state answer since has been captioned with the name of an
 * engine that did not produce it, on the surface whose entire thesis is that it can tell you
 * who produced an answer.
 *
 * These are source-level assertions rather than render assertions, deliberately: the defect
 * is the PRESENCE OF A LITERAL, and a literal is a fact about the source. Rendering the
 * component would prove this instance is clean; reading the source proves the constant is
 * gone. Both derivations carry positive controls, because a guard whose extraction silently
 * matches nothing passes forever while reading as coverage.
 */
import { describe, it, expect } from "vitest";
import { CHART_WIDGET_CONTRACT } from "./ChartWidget.contract";

const SRC = readFileSync(path.join(__dirname, "ChartWidget.tsx"), "utf8");
const INTERPRETER = readFileSync(
  path.join(__dirname, "../registry/SemanticInterpreter.tsx"),
  "utf8",
);

describe("ChartWidget attribution", () => {
  it("the source really is being read — positive control", () => {
    // Without this, a moved/renamed file turns every assertion below into a pass over "".
    expect(SRC).toContain("export const ChartWidget");
    expect(INTERPRETER).toContain("<ChartWidget");
  });

  it("names NO engine — the widget cannot know which one produced this answer", () => {
    // The exact literals removed. If a future payload really does carry an engine, render it
    // from that field and replace this test; do not re-add a constant.
    expect(SRC).not.toContain("ANALYST_A");
    expect(SRC).not.toMatch(/Headless Analyst/i);
  });

  it("receives no provenance at all — which is WHY it may not print any", () => {
    // The structural reason the rule holds, pinned so it is re-checked rather than
    // remembered. If this ever fails because a provenance prop was added, that is the moment
    // the footer may legitimately show attribution again.
    const call = INTERPRETER.slice(
      INTERPRETER.indexOf("<ChartWidget"),
      INTERPRETER.indexOf("/>", INTERPRETER.indexOf("<ChartWidget")),
    );
    expect(call.length).toBeGreaterThan(20); // positive control on the slice
    for (const forbidden of ["produced_by", "handled_by", "routing", "engine"]) {
      expect(call).not.toContain(forbidden);
    }
    // And the contract itself declares no provenance field for it to have read.
    const fields = Object.keys(CHART_WIDGET_CONTRACT.fields);
    expect(fields).not.toContain("engine");
    expect(fields).not.toContain("produced_by");
  });

  it("shows the SQL footer only when a query exists — an empty label is a claim with nothing behind it", () => {
    // `sql_query` is optional in the contract and absent for a computed answer, which used to
    // render a bare "SQL:" caption followed by nothing.
    expect(CHART_WIDGET_CONTRACT.fields.sql_query.required).toBe(false);
    expect(SRC).toMatch(/\{sql \?/);
  });
});
