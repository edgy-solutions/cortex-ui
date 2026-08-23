import { readFileSync } from "node:fs";
import path from "node:path";
/**
 * The registration payload is ASSEMBLED from component contracts, not authored.
 *
 * The property under test is not "the list has N entries" — it is that a derived row
 * cannot disagree with the contract it came from, and that migrating one archetype does
 * not silently delete rows that merely SHARE it.
 */
import { describe, it, expect } from "vitest";
import {
  assembleCapabilities,
  assembleDerivedCapabilities,
  derivedSubjects,
} from "./assembleCapabilities";
import { CORTEX_UI_CAPABILITIES } from "./frontendCapabilities";
import { CHART_WIDGET_CONTRACT } from "../components/mesh/ChartWidget.contract";
import { MARKDOWN_RENDERER_CONTRACT } from "../components/registry/MarkdownRenderer.contract";

describe("assembleCapabilities", () => {
  it("computes expected_fields FROM the contract — never a second list", () => {
    const chart = assembleDerivedCapabilities()
      .find((c) => c.archetype === "CHART_WIDGET")!;
    expect(chart.expected_fields).toEqual(Object.keys(CHART_WIDGET_CONTRACT.fields));
  });

  it("six output types share ONE MarkdownRenderer contract", () => {
    // The shape the hand-authored table obscured: it looked like six independent
    // capabilities and was six bindings to one component.
    const docs = assembleDerivedCapabilities()
      .filter((c) => c.component === "MARKDOWN_PLACEHOLDER" || c.archetype === "KNOWLEDGE_DOCUMENT");
    expect(docs).toHaveLength(6);
    for (const d of docs) {
      expect(d.contract).toBe(MARKDOWN_RENDERER_CONTRACT);
      expect(d.expected_fields).toEqual(Object.keys(MARKDOWN_RENDERER_CONTRACT.fields));
    }
  });

  it("DEDUPES BY subject_uri, not archetype — the bug this re-key fixed", () => {
    // Keying on archetype would drop every not-yet-converted row that happens to render as
    // a document, silently SHRINKING the menu instead of migrating it. Any legacy row whose
    // subject_uri is not yet derived must survive.
    const out = assembleCapabilities(CORTEX_UI_CAPABILITIES);
    const covered = derivedSubjects();
    for (const legacy of CORTEX_UI_CAPABILITIES) {
      if (covered.has(legacy.subject_uri)) continue;
      expect(
        out.some((c) => c.subject_uri === legacy.subject_uri),
        `legacy row ${legacy.subject_uri} was dropped`,
      ).toBe(true);
    }
  });

  it("never emits two entries for one subject_uri", () => {
    const out = assembleCapabilities(CORTEX_UI_CAPABILITIES);
    const seen = out.map((c) => c.subject_uri);
    expect(new Set(seen).size).toBe(seen.length);
  });

  it("every row declares whether it is derived or legacy", () => {
    for (const c of assembleCapabilities(CORTEX_UI_CAPABILITIES)) {
      expect(["derived", "legacy"]).toContain(c.contract_source);
    }
  });

  it("KNOWLEDGE_DOCUMENT publishes an EMPTY refusal vocabulary", () => {
    // Load-bearing: it is why this archetype can be the universal fallback. Populating it
    // would make the fallback refusable and leave slice 4 with nowhere to land.
    expect(MARKDOWN_RENDERER_CONTRACT.refusalReasons).toHaveLength(0);
  });

  it("EVERY capability row is now derived — no legacy rows remain", () => {
    // The migration's terminal state. If this goes red, either a new row landed without a
    // contract (fine, expected, convert it) or a binding was lost (not fine).
    const out = assembleCapabilities(CORTEX_UI_CAPABILITIES);
    const legacy = out.filter((c) => c.contract_source === "legacy");
    expect(legacy.map((c) => c.subject_uri)).toEqual([]);
  });

  it("no derived row advertises a component the interpreter does not dispatch", () => {
    // The stale-advertisement check. The hand-authored table published
    // component: "WorkflowCanvas" for PROCESS_TOPOLOGY two months after the interpreter
    // switched to ProcessTopologyCard. Deriving the name from the component makes that
    // class of drift unrepresentable, and this pins it.
    // DERIVED FROM THE SWITCH, 2026-08-22. The predecessor comment said it plainly: the
    // hand-maintained set was "a second source for what the interpreter dispatches — the same
    // two-masters shape the assembler exists to remove, one layer up", and that "adding a row
    // to it should feel slightly wrong, and that feeling is the signal."
    //
    // Landing INTERVAL_TIMELINE was the next row. Taking the invitation instead of adding it.
    //
    // And the derived form is STRICTLY STRONGER: the old set asserted MEMBERSHIP, so a
    // DERIVED_BINDINGS row naming DeltaSet while the interpreter dispatched PeriodSeries for
    // that archetype would have passed. This asserts the ARCHETYPE -> COMPONENT MAPPING, which
    // is the thing that has to agree.
    const src = readFileSync(
      path.join(__dirname, "../components/registry/SemanticInterpreter.tsx"),
      "utf8",
    );
    const dispatchedBy = new Map<string, string>();
    // `case "ARCHETYPE":` … first JSX tag before the next case. Comments in between are
    // skipped because they contain no `<Capitalized`.
    const caseRe = /case\s+"([A-Z0-9_]+)"\s*:([\s\S]*?)(?=\n\s*case\s+"|\n\s*default\s*:)/g;
    for (const m of src.matchAll(caseRe)) {
      const tag = m[2].match(/<([A-Z]\w+)/);
      if (tag) dispatchedBy.set(m[1], tag[1]);
    }

    // Positive control: a regex that stopped matching would make every assertion below pass
    // over nothing — the guard-gone-quiet shape this file is otherwise full of warnings about.
    expect(dispatchedBy.size).toBeGreaterThanOrEqual(10);

    for (const c of assembleDerivedCapabilities()) {
      expect(
        dispatchedBy.get(c.archetype),
        `${c.archetype} advertises ${c.component}; interpreter dispatches ${dispatchedBy.get(c.archetype) ?? "NOTHING"}`,
      ).toBe(c.component);
    }
  });

  it("every derived row's expected_fields is a projection of its own contract", () => {
    // The union check generalised: not one contract, but ALL of them. Transcription lies,
    // and this is the shape that catches it.
    for (const c of assembleDerivedCapabilities()) {
      const contract = c.contract as { fields: Record<string, unknown> };
      expect(c.expected_fields).toEqual(Object.keys(contract.fields));
    }
  });
});
