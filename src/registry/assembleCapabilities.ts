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
    component: b.contract.component,
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
