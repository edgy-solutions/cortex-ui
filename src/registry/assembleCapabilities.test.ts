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
    // NOTE (2026-08-21): this set is HAND-MAINTAINED, which makes it a second source for
    // "what does the interpreter dispatch" — the same two-masters shape the assembler exists
    // to remove, one layer up. It is correct today and it goes stale the same way the
    // component list did. Deriving it from SemanticInterpreter's switch is the fix; not done
    // here because it is a test-design change and this commit is landing a renderer. Adding
    // a row to it should feel slightly wrong, and that feeling is the signal.
    const dispatched = new Set([
      "ChartWidget", "MarkdownRenderer", "ProcessTopologyCard",
      "SupplyTable", "WarningCard", "GroupedReviewTable",
      "ApprovalTaskCard", "WorkflowObservationView", "InstancesByPropertyView",
      "PeriodSeries",
    ]);
    for (const c of assembleDerivedCapabilities()) {
      expect(dispatched, `${c.archetype} advertises ${c.component}`).toContain(c.component);
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
