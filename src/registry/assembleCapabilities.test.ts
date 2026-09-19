import { readFileSync, readdirSync } from "node:fs";
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

  it("EVERY output type that renders as prose shares ONE MarkdownRenderer contract", () => {
    // The shape the hand-authored table obscured: it looked like N independent capabilities and
    // was N bindings to one component.
    //
    // ⛔ THE COUNT WAS SIX AND IS NOW A FLOOR, DELIBERATELY. This asserted `toHaveLength(6)`,
    // and six was a HISTORICAL OBSERVATION rather than a constraint — adding a legitimate prose
    // binding broke it, which makes the seal a thing you edit to land work rather than a thing
    // that catches work. The CLAIM is the sharing, and it lives in the loop below.
    //
    // The floor stays because the loop is VACUOUS over an empty filter: a selector that matched
    // nothing would satisfy every assertion in it. Six is the number that existed when the
    // property was established, so falling below it means a binding was removed rather than
    // that the filter broke — two different things this keeps apart.
    const docs = assembleDerivedCapabilities()
      .filter((c) => c.component === "MARKDOWN_PLACEHOLDER" || c.archetype === "KNOWLEDGE_DOCUMENT");
    expect(docs.length, "fewer prose bindings than when this property was established").toBeGreaterThanOrEqual(6);
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

    // DRAWN rows only. A row whose answer is ACTED ON declares a consumer instead and is
    // checked by the next test — inventing a placeholder component so it would pass here
    // would assert that a renderable thing exists when nothing draws it.
    const drawn = assembleDerivedCapabilities().filter((c) => !c.consumer);
    expect(drawn.length).toBeGreaterThanOrEqual(10);

    for (const c of drawn) {
      expect(
        dispatchedBy.get(c.archetype),
        `${c.archetype} advertises ${c.component}; interpreter dispatches ${dispatchedBy.get(c.archetype) ?? "NOTHING"}`,
      ).toBe(c.component);
    }
  });

  it("every ACTED-ON row names a consumer that is really exported", () => {
    // The consumer half of the same guard. A component name that goes stale is caught above;
    // a consumer name that goes stale would otherwise be caught by nothing at all, because no
    // interpreter case mentions it and no card fails to render — the seed would simply stop
    // seeding, silently, which is the failure this whole model exists to make impossible.
    const acted = assembleDerivedCapabilities().filter((c) => c.consumer);

    // Positive control: if the category ever empties, say so rather than passing over nothing.
    expect(acted.length).toBeGreaterThanOrEqual(1);

    const libDir = path.join(__dirname, "../lib");
    const exported = new Set<string>();
    for (const f of readdirSync(libDir)) {
      if (!f.endsWith(".ts") || f.endsWith(".test.ts")) continue;
      const src = readFileSync(path.join(libDir, f), "utf8");
      for (const m of src.matchAll(/export\s+function\s+(\w+)/g)) exported.add(m[1]);
    }
    expect(exported.size).toBeGreaterThanOrEqual(5);

    for (const c of acted) {
      expect(
        exported.has(c.consumer as string),
        `${c.archetype} names consumer ${c.consumer}, which src/lib exports nowhere`,
      ).toBe(true);
      expect(
        c.component,
        `${c.archetype} declares BOTH a component and a consumer — one row, one treatment`,
      ).toBe("");
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

/**
 * ENGINE S'S THREE SUBJECTS, AND THE IRI AUTHORITY THAT MAKES THEM EASY TO GET WRONG.
 *
 * The producer advertised these and this side had none of them, so every safety answer fell
 * through to KNOWLEDGE_DOCUMENT: registered, routable, drawable by nothing.
 *
 * ⛔ THE FAILURE MODE IS THE QUIET ONE. Safety lives at `internal/sustainment/safety#`, NOT at
 * `invincible-agent/safety#` — a different authority AND path from its neighbours, because
 * Engine S extends the SUSTAINMENT plane. A row written by pattern from the `cost#` rows above
 * registers, reports accepted, never matches a payload, and the card falls through to
 * KNOWLEDGE_DOCUMENT with "No content available" — INDISTINGUISHABLE FROM HAVING NO BINDING AT
 * ALL, which is the state the safety walk already spent an afternoon inside.
 *
 * So the authority is asserted rather than trusted to the eye. A test that only checked the
 * local name would pass the wrong IRI.
 */
describe("the safety bindings carry the right authority", () => {
  const SAFETY = "http://internal/sustainment/safety#";
  const SUBJECTS = ["OrphanedHazardSet", "DeferralRiskCard", "RiskAssessmentDraft"];

  it("binds all three, at the SUSTAINMENT authority and not the agent one", () => {
    const rows = assembleDerivedCapabilities();
    for (const name of SUBJECTS) {
      const found = rows.find((c) => c.subject_uri === `${SAFETY}${name}`);
      expect(found, `${name} is not bound at ${SAFETY}`).toBeDefined();
    }
  });

  it("⛔ NO safety subject is bound at the agent authority — the trap, asserted", () => {
    // The control that matters: without it, a row written as
    // `http://invincible-agent/safety#OrphanedHazardSet` would satisfy nothing above and fail
    // nothing here, which is exactly how the quiet version of this defect survives.
    const wrong = assembleDerivedCapabilities().filter((c) =>
      c.subject_uri.includes("invincible-agent/safety"),
    );
    expect(wrong.map((c) => c.subject_uri), "a safety subject at the WRONG authority").toEqual([]);
  });

  it("the hazard ranking renders as a ranking; the two drafts render as prose", () => {
    // By RULING, not by fit: no declared archetype carries a severity/probability pair with its
    // citation, and prose beats a mis-binding because a mis-bound card renders something
    // plausible and wrong — harder to notice than something plain and right.
    const rows = assembleDerivedCapabilities();
    const by = (n: string) => rows.find((c) => c.subject_uri === `${SAFETY}${n}`)!;
    expect(by("OrphanedHazardSet").archetype).toBe("CONTRIBUTION_RANKING");
    expect(by("DeferralRiskCard").archetype).toBe("KNOWLEDGE_DOCUMENT");
    expect(by("RiskAssessmentDraft").archetype).toBe("KNOWLEDGE_DOCUMENT");
  });

  it("claims SUSTAINMENT and SAFETY_ENGINEER — both DERIVED from the engine", () => {
    // Both come from safety_agent/main.py:108-109 — OWNER_PERSONA and DOMAINS — and are passed
    // at the engine own registration sites. An earlier version asserted an EMPTY persona on the
    // grounds that none was declared; that was reached by a grep ending in head -5 which never
    // printed line 108. An empty persona_fit is NOT neutral: the selector reads it as fitting no
    // persona, so the mistake would have shipped as a considered refusal.
    for (const name of SUBJECTS) {
      const row = assembleDerivedCapabilities().find((c) => c.subject_uri === `${SAFETY}${name}`)!;
      expect(row.domain_fit, name).toEqual(["SUSTAINMENT"]);
      expect(row.persona_fit, name).toEqual(["SAFETY_ENGINEER"]);
    }
  });
});
