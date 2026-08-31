/**
 * Assemble the registration payload FROM component contract exports.
 *
 * ADR-0017 amendment, 2026-08-20: "the registration payload is ASSEMBLED FROM THOSE
 * EXPORTS at build or startup. The component that renders and the contract that is
 * registered share one source, mechanically — never by discipline."
 *
 * WHY AN ASSEMBLER AND NOT A HAND-EDITED LIST. `frontendCapabilities.ts` currently
 * hand-authors ten entries whose `expected_fields` are byte-identical to ten lists in
 * `agent_fleet/presentation_agent/capabilities.py`, with no test pinning them equal.
 * Moving those hand-written entries into a registration call would carry the same
 * two-masters defect onto the wire. Entries produced HERE are derived: change the
 * component's contract and the registration changes with it, or the build fails.
 *
 * MIGRATION IS ROW-BY-ROW, DELIBERATELY. Only archetypes whose component exports a
 * contract are assembled; the rest remain legacy hand-authored entries and are marked
 * as such. Each export that lands moves one row from `legacy` to `derived`, and the
 * backend's copy dissolves by the same row. Big-bang conversion would leave the tree in
 * a half-state for days; this leaves it shippable at every step.
 *
 * WHAT THE COMPONENT OWNS vs WHAT THE REGISTRY OWNS. The component owns the CONTRACT —
 * field encodings, types, cardinality, row requirements, refusal vocabulary. The registry
 * owns the MESH VOCABULARY MAPPING — which `subject_uri` (an engine output type) routes
 * to which archetype, and the persona/domain affinities used for ranking. Those are
 * backend-vocabulary facts, not facts about a React component, and they do not belong in
 * a widget's directory.
 */
import type { FrontendCapability } from "./frontendCapabilities";
import { CHART_WIDGET_CONTRACT } from "../components/mesh/ChartWidget.contract";
import { MARKDOWN_RENDERER_CONTRACT } from "../components/registry/MarkdownRenderer.contract";
import { PROCESS_TOPOLOGY_CONTRACT } from "../components/registry/ProcessTopologyCard.contract";
import { SUPPLY_TABLE_CONTRACT } from "../components/registry/SupplyTable.contract";
import { WARNING_CARD_CONTRACT } from "../components/registry/WarningCard.contract";
import { GROUPED_REVIEW_CONTRACT } from "../components/GroupedReview/GroupedReviewTable.contract";
import { PERIOD_SERIES_CONTRACT } from "../components/planning/PeriodSeries.contract";
import { THRESHOLD_GRID_CONTRACT } from "../components/planning/ThresholdGrid.contract";
import { MATRIX_GRID_CONTRACT } from "../components/planning/MatrixGrid.contract";
import { DELTA_SET_CONTRACT } from "../components/planning/DeltaSet.contract";
import { INTERVAL_TIMELINE_CONTRACT } from "../components/planning/IntervalTimeline.contract";
import { SHORTFALL_GRID_CONTRACT } from "../components/planning/ShortfallGrid.contract";
import { DECISION_RECORD_CONTRACT } from "../components/planning/DecisionRecord.contract";
import { CANVAS_SEED_CONTRACT } from "../components/registry/CanvasSeed.contract";
import { FORECAST_MEASURE_CONTRACT } from "../components/planning/ForecastMeasure.contract";
import { CONTRIBUTION_RANKING_CONTRACT } from "../components/planning/ContributionRanking.contract";
import {
  APPROVAL_TASK_CONTRACT,
  WORKFLOW_OBSERVATION_CONTRACT,
  INSTANCES_BY_PROPERTY_CONTRACT,
} from "../components/registry/TaskAndObservation.contracts";

/** A capability entry plus the provenance of how it was produced. */
export type AssembledCapability = FrontendCapability & {
  /** The component-exported typed contract. Absent on legacy hand-authored rows. */
  contract?: unknown;
  /** derived = assembled from a component export; legacy = still hand-authored. */
  contract_source: "derived" | "legacy";
};

/**
 * Mesh-vocabulary bindings for archetypes whose contract is component-derived.
 * Only the URIs and affinities live here — never the field shapes.
 */
const DERIVED_BINDINGS = [
  {
    subject_uri: "mesh:DatasetAnalysisReport",
    object_uri: "mesh:ChartWidget",
    persona_fit: ["DATA_STEWARD"],
    domain_fit: ["DATA_ENGINEERING"],
    contract: CHART_WIDGET_CONTRACT,
  },
  // SIX ROWS, ONE CONTRACT. Every one of these output types renders through
  // MarkdownRenderer, so they share its contract rather than each restating it. That is
  // the shape the hand-authored table obscured: it looked like six independent
  // capabilities and was six bindings to one component.
  {
    subject_uri: "mesh:OwnershipFact",
    object_uri: "mesh:KnowledgeDocument",
    persona_fit: ["DATA_STEWARD", "OPS_OPERATOR"],
    domain_fit: ["DATA_ENGINEERING"],
    contract: MARKDOWN_RENDERER_CONTRACT,
  },
  {
    subject_uri: "mesh:ImpactSet",
    object_uri: "mesh:KnowledgeDocument",
    persona_fit: ["DATA_STEWARD"],
    domain_fit: ["DATA_ENGINEERING"],
    contract: MARKDOWN_RENDERER_CONTRACT,
  },
  {
    subject_uri: "mesh:SchemaDescription",
    object_uri: "mesh:KnowledgeDocument",
    persona_fit: ["DATA_ENGINEER"],
    domain_fit: ["DATA_ENGINEERING"],
    contract: MARKDOWN_RENDERER_CONTRACT,
  },
  {
    subject_uri: "mesh:AssetProfile",
    object_uri: "mesh:KnowledgeDocument",
    persona_fit: ["DATA_STEWARD"],
    domain_fit: ["DATA_ENGINEERING"],
    contract: MARKDOWN_RENDERER_CONTRACT,
  },
  {
    subject_uri: "mesh:CatalogListing",
    object_uri: "mesh:KnowledgeDocument",
    persona_fit: ["DATA_STEWARD"],
    domain_fit: ["DATA_ENGINEERING"],
    contract: MARKDOWN_RENDERER_CONTRACT,
  },
  {
    subject_uri: "mesh:KnowledgeRetrievalResponse",
    object_uri: "mesh:KnowledgeDocument",
    persona_fit: ["MECHANIC"],
    domain_fit: ["MAINTENANCE", "MANUFACTURING"],
    contract: MARKDOWN_RENDERER_CONTRACT,
  },
  // The last four. Every capability row is now derived from a component export; the legacy
  // branch below survives only so a future row can land before its contract does.
  {
    subject_uri: "mesh:LineageTopology",
    object_uri: "mesh:ProcessTopology",
    persona_fit: ["DATA_STEWARD", "DATA_ENGINEER"],
    domain_fit: ["DATA_ENGINEERING"],
    contract: PROCESS_TOPOLOGY_CONTRACT,
  },
  {
    subject_uri: "mesh:FreshnessReport",
    object_uri: "mesh:AssetStateMetric",
    persona_fit: ["OPS_OPERATOR", "DATA_STEWARD"],
    domain_fit: ["DATA_ENGINEERING"],
    contract: SUPPLY_TABLE_CONTRACT,
  },
  {
    subject_uri: "mesh:TagFilterResult",
    object_uri: "mesh:HazardDeclaration",
    persona_fit: ["DATA_STEWARD"],
    domain_fit: ["DATA_ENGINEERING"],
    contract: WARNING_CARD_CONTRACT,
  },
  {
    subject_uri: "mesh:PartObsolescenceReviewBatch",
    object_uri: "mesh:GroupedReview",
    persona_fit: ["DATA_STEWARD"],
    domain_fit: ["SUSTAINMENT"],
    contract: GROUPED_REVIEW_CONTRACT,
  },
  {
    subject_uri: "mesh:HumanApprovalTask",
    object_uri: "mesh:ApprovalTask",
    persona_fit: ["DATA_STEWARD"],
    domain_fit: ["SUSTAINMENT"],
    contract: APPROVAL_TASK_CONTRACT,
  },
  {
    subject_uri: "mesh:WorkflowObservation",
    object_uri: "mesh:WorkflowObservation",
    persona_fit: ["DATA_STEWARD"],
    domain_fit: ["SUSTAINMENT"],
    contract: WORKFLOW_OBSERVATION_CONTRACT,
  },
  {
    subject_uri: "mesh:InstancesByProperty",
    object_uri: "mesh:InstancesByProperty",
    persona_fit: ["DATA_STEWARD"],
    domain_fit: ["DATA_ENGINEERING"],
    contract: INSTANCES_BY_PROPERTY_CONTRACT,
  },
  // THE FIRST LIVE-VIEW BINDING (ADR-0042). Engine P's `mesh:planCostCurve` declares
  // `mesh:PeriodCostSeries` as its fixed output type; this row is what makes that type
  // ADDRESSABLE on this frontend's menu.
  //
  // WITHOUT THIS ROW the payload is not refused — it is ABSORBED. Probed against the live
  // selector 2026-08-21: `mesh:PeriodCostSeries` matched no capability, `select_presentation`
  // widened the search (output_uri is a HINT, and a miss widens rather than ends), and a
  // `[{period, total}]` series satisfied CHART_WIDGET's contract. Result:
  // `presentation_source: "registered"`, archetype CHART_WIDGET, a plausible-looking bar
  // chart, and the wrong renderer. `selection_basis` was the only field that said so.
  //
  // Note the compact form here folds to the same canonical token as the engine's full IRI
  // (`http://invincible-agent/mesh#PeriodCostSeries`) via `capability_registry._canonical`,
  // which is why the two sides can spell it differently and still meet.
  {
    subject_uri: "mesh:PeriodCostSeries",
    object_uri: "mesh:PeriodSeries",
    persona_fit: ["PORTFOLIO_LEAD"],
    domain_fit: ["PORTFOLIO_PLANNING"],
    contract: PERIOD_SERIES_CONTRACT,
  },
  // Engine P's `mesh:planSiteLoad` declares `mesh:LoadThresholdGrid`. Same reasoning as the
  // row above: without this binding the payload is not refused, it is absorbed by whatever
  // else its shape satisfies.
  {
    subject_uri: "mesh:LoadThresholdGrid",
    object_uri: "mesh:ThresholdGrid",
    persona_fit: ["PORTFOLIO_LEAD"],
    domain_fit: ["PORTFOLIO_PLANNING"],
    contract: THRESHOLD_GRID_CONTRACT,
  },
  // Engine P's `mesh:planMaturityGrid` declares `mesh:MaturityMatrix`.
  {
    subject_uri: "mesh:MaturityMatrix",
    object_uri: "mesh:MatrixGrid",
    persona_fit: ["PORTFOLIO_LEAD"],
    domain_fit: ["PORTFOLIO_PLANNING"],
    contract: MATRIX_GRID_CONTRACT,
  },
  // Engine P's `mesh:planDiff` declares `mesh:EffectSet`. INV-3's card.
  {
    subject_uri: "mesh:EffectSet",
    object_uri: "mesh:DeltaSet",
    persona_fit: ["PORTFOLIO_LEAD"],
    domain_fit: ["PORTFOLIO_PLANNING"],
    contract: DELTA_SET_CONTRACT,
  },
  // Engine P's `mesh:planSchedule` declares `mesh:IntervalSchedule` — Phase 1's anchor
  // timeline. Same absorption reasoning as the rows above, with a sharper edge: a schedule row
  // carries `planned_start`/`planned_end`, and an unregistered payload of that shape is a
  // plausible candidate for anything that draws intervals. Registered, it is addressable.
  {
    subject_uri: "mesh:IntervalSchedule",
    object_uri: "mesh:IntervalTimeline",
    persona_fit: ["PORTFOLIO_LEAD"],
    domain_fit: ["PORTFOLIO_PLANNING"],
    contract: INTERVAL_TIMELINE_CONTRACT,
  },
  // Engine P's `mesh:planCommitScenario` declares `mesh:DecisionArtifact` — Beat 6.
  //
  // REGISTERED NOW, AND NOT BEFORE. This contract has existed since 2026-08-22 and was
  // deliberately unbound while no verb emitted a DecisionArtifact: Contract D refuses a triple
  // whose subject class does not exist, so registering early would have earned a refusal and
  // taught nobody anything. The verb landed, so the binding lands with it — arrives-with-its-
  // first-real-consumer, applied to a registration.
  {
    subject_uri: "mesh:DecisionArtifact",
    object_uri: "mesh:DecisionRecord",
    persona_fit: ["PORTFOLIO_LEAD"],
    domain_fit: ["PORTFOLIO_PLANNING"],
    contract: DECISION_RECORD_CONTRACT,
  },
  // Same sequencing as DECISION_RECORD above: the contract, ontology class and admission
  // vocabulary landed server-side, and the binding lands with the COMPONENT rather than ahead
  // of it. The dispatch seal refuses to advertise an archetype whose renderer does not exist,
  // so registering early would have earned a refusal and taught nobody anything.
  {
    subject_uri: "mesh:FundingGapSet",
    object_uri: "mesh:ShortfallGrid",
    persona_fit: ["PORTFOLIO_LEAD"],
    domain_fit: ["PORTFOLIO_PLANNING"],
    contract: SHORTFALL_GRID_CONTRACT,
  },
  // A SECOND subject binding onto the SAME contract. INTERVAL_TIMELINE already serves the
  // schedule pivot; a contribution sequence is the same STRUCTURE — nested intervals whose top
  // level meaning the payload states — asked of a different subject. Binding it here rather
  // than minting a second archetype is the point of the structural naming: two questions, one
  // renderer, no new component.
  //
  // THE OBJECT END IS THE ARCHETYPE, NOT THE OTHER PAYLOAD. This row shipped as
  // an object end of mesh-colon-IntervalSchedule — the SUBJECT of the row directly above,
  // copied into the object slot. (Written out longhand deliberately: quoting the wrong value
  // verbatim put a live-looking `object_uri:` string in this file, and a sibling test derives
  // the archetype list by regex over this source. The prose explaining the bug kept the bug's
  // signature alive for anything reading the file rather than executing it.) The triple then read "a ContributionSequence renders as an
  // IntervalSchedule": one payload rendering as another payload, which is not a claim the
  // model can mean.
  //
  // IT PASSED EVERY GATE, and the comment that used to sit here says why in its own words:
  // "both endpoints pre-exist and Contract D is satisfied." Both were true. CONTRACT D CHECKS
  // EXISTENCE, NOT CLASSIFICATION — `mesh:IntervalSchedule` is a declared class, so a triple
  // pointing at it is well-formed and meaningless at the same time. Sealed on the other side
  // by tests/planning/test_bindings_point_at_archetypes.py, which reads the TTL's own
  // subClassOf edges rather than trusting a name to look right.
  {
    subject_uri: "mesh:ContributionSequence",
    object_uri: "mesh:IntervalTimeline",
    persona_fit: ["PORTFOLIO_LEAD"],
    domain_fit: ["PORTFOLIO_PLANNING"],
    contract: INTERVAL_TIMELINE_CONTRACT,
  },
  // ── ENGINE F, PROGRAM FINANCE (ADR-0045) ───────────────────────────────────────────────
  //
  // THREE ROWS FROM SIX VERBS, and the gap is the finding rather than an oversight. Engine F's
  // binding table read the payloads off the running verbs instead of asserting a fit, and only
  // three of the six land on an archetype that has a projection arm. The other three are
  // component builds filed back against ADR-0045 — a variance TREE nothing in the arm accepts,
  // an EAC whose METHOD is half the answer and which no archetype carries, and a RANKING whose
  // assigned archetype turned out to be a filtered instance table fed by a hand-set BFF feeder.
  //
  // Advertising rows for those three would be the failure this registry is built to refuse: an
  // archetype named in a table is not an archetype that draws.
  //
  // `persona_fit` and `domain_fit` are READ from the finance agent's own declarations
  // (`OWNER_PERSONA` / `DOMAINS` in agent_fleet/finance_agent/main.py), not inferred from the
  // subject matter. A guessed persona advertises to the wrong audience and nothing here fails.
  // THE FOURTH FINANCE ROW, and the first that needed a component built for it.
  //
  // `fin_eac_calculation` was assigned "period series or single measure" by ADR-0045 and fits
  // neither: it is ONE forecast whose METHOD is half the answer, and no existing archetype
  // carries a method. The nearest candidate, ASSET_STATE_METRIC, is outside the projection arm
  // and dispatches to an LLM renderer whose fallback chain begins at an external provider —
  // the wrong path for a program cost forecast, and it has no method slot to drop anyway.
  // THE FIFTH FINANCE ROW. ADR-0045 assigned INSTANCES_BY_PROPERTY and it does not fit — that
  // archetype is a filtered instance table fed by a hand-set BFF feeder, absent from the
  // projection arm, requiring target/columns/row_identity/state_vocabulary a ranking has none
  // of. DELTA_SET was tested by mapping the real fields and fails on four: no slot for
  // `share_of_total`, a permanently-empty `affected[]`, `metric` carrying an entity name, and
  // no ordering at all. See ContributionRanking.contract.ts.
  {
    subject_uri: "fin:VarianceDriverRanking",
    object_uri: "mesh:ContributionRanking",
    persona_fit: ["PROGRAM_FINANCE_ANALYST"],
    domain_fit: ["PROGRAM_FINANCE"],
    contract: CONTRIBUTION_RANKING_CONTRACT,
  },
  {
    subject_uri: "fin:EstimateAtCompletion",
    object_uri: "mesh:ForecastMeasure",
    persona_fit: ["PROGRAM_FINANCE_ANALYST"],
    domain_fit: ["PROGRAM_FINANCE"],
    contract: FORECAST_MEASURE_CONTRACT,
  },
  {
    subject_uri: "fin:BurnRateSeries",
    object_uri: "mesh:PeriodSeries",
    persona_fit: ["PROGRAM_FINANCE_ANALYST"],
    domain_fit: ["PROGRAM_FINANCE"],
    contract: PERIOD_SERIES_CONTRACT,
  },
  {
    subject_uri: "fin:FundingStatusGrid",
    object_uri: "mesh:ShortfallGrid",
    persona_fit: ["PROGRAM_FINANCE_ANALYST"],
    domain_fit: ["PROGRAM_FINANCE"],
    contract: SHORTFALL_GRID_CONTRACT,
  },
  // A SECOND subject onto PERIOD_SERIES, and this one arrives with a cost stated by its
  // producer: CPI/SPI are dimensionless ratios, so the verb deliberately emits NO
  // `value_unit`, and its row field is named `amount_unit` SPECIFICALLY to defeat the
  // projector's `rows[0]` lift — which would otherwise promote a currency onto a ratio chart.
  // That rename looks like a naming inconsistency and "tidying" it puts a dollar sign on CPI.
  //
  // The cortex-side question the table could not answer — does PERIOD_SERIES tolerate an
  // absent `value_unit`? — is YES, and for a reason worth knowing rather than the reason
  // assumed: this component never reads the field at all. See PERIOD_SERIES_CONTRACT's
  // `value_unit`, which is advertised and unconsumed.
  {
    subject_uri: "fin:PerformanceIndexSeries",
    object_uri: "mesh:PeriodSeries",
    persona_fit: ["PROGRAM_FINANCE_ANALYST"],
    domain_fit: ["PROGRAM_FINANCE"],
    contract: PERIOD_SERIES_CONTRACT,
  },
  // THE FIRST BINDING WHOSE ANSWER IS ACTED ON RATHER THAN DRAWN.
  //
  // `mesh:CanvasSeedResult` is what the seeding orchestration PRODUCES — slot-ordered artifact
  // ids — and `mesh:CanvasSeed` is the treatment it receives. Both ends pre-exist in
  // mesh_system.ttl, and the parents are the load-bearing part: the subject is a Response and
  // the object is an Archetype. Filing the result under mesh:Archetype was proposed and
  // refused, because Contract D would have accepted it — it checks that a class EXISTS and
  // never what KIND it is.
  //
  // This row declares no component. `CANVAS_SEED_CONTRACT` names a `consumer` instead, and the
  // dispatch seal checks whichever was declared. Nothing renders a seed answer: the five cards
  // it places are the visible result.
  {
    subject_uri: "mesh:CanvasSeedResult",
    object_uri: "mesh:CanvasSeed",
    persona_fit: ["PORTFOLIO_LEAD"],
    domain_fit: ["PORTFOLIO_PLANNING"],
    contract: CANVAS_SEED_CONTRACT,
  },
] as const;

/**
 * Build the derived rows. `expected_fields` is COMPUTED from the contract's own field
 * map rather than restated, so the legacy field-name list and the typed contract cannot
 * disagree — the names are a projection of the contract, not a second source.
 */
export function assembleDerivedCapabilities(): AssembledCapability[] {
  return DERIVED_BINDINGS.map((b) => ({
    subject_uri: b.subject_uri,
    object_uri: b.object_uri,
    archetype: b.contract.archetype,
    // A contract declares a component (drawn) or a consumer (acted on), never both. The
    // empty string is deliberate rather than a default: it pairs with a named consumer to
    // say "nothing renders this", which is a claim, not a missing value.
    component: (b.contract as { component?: string }).component ?? "",
    consumer: (b.contract as { consumer?: string }).consumer,
    layout: b.contract.layout as FrontendCapability["layout"],
    expected_fields: Object.keys(b.contract.fields),
    persona_fit: [...b.persona_fit],
    domain_fit: [...b.domain_fit],
    contract: b.contract,
    contract_source: "derived" as const,
  }));
}

/** Archetypes already covered by a component export — used to drop legacy duplicates. */
export function derivedSubjects(): Set<string> {
  // KEYED ON subject_uri, NOT archetype. Six bindings now share KNOWLEDGE_DOCUMENT, so
  // dropping legacy rows by ARCHETYPE would delete every not-yet-converted row that happens
  // to render as a document — silently shrinking the menu instead of migrating it.
  return new Set(DERIVED_BINDINGS.map((b) => b.subject_uri));
}

/**
 * The full registration payload: derived rows first, then any legacy row whose archetype
 * has NOT yet been converted. A legacy row for an already-derived archetype is DROPPED,
 * not merged — two entries for one archetype is the ambiguity this whole change removes.
 */
export function assembleCapabilities(
  legacy: FrontendCapability[],
): AssembledCapability[] {
  const derived = assembleDerivedCapabilities();
  const covered = derivedSubjects();
  const remaining = legacy
    .filter((c) => !covered.has(c.subject_uri))
    .map((c) => ({ ...c, contract_source: "legacy" as const }));
  return [...derived, ...remaining];
}
