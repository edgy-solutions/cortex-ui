/**
 * ADR-0017 frontend self-registration of presentation capabilities.
 *
 * cortex-ui advertises this list at login. Engine F's startup register
 * (in invincible-agent's presentation_agent) currently speaks for the
 * frontend with an in-memory table of 9 capability triples; this file
 * is what we'd register if cortex-ui were registering ITSELF rather
 * than being assumed.
 *
 * The contents mirror SemanticInterpreter.tsx's switch(comp.archetype)
 * cases verbatim. Each entry's `subject_uri` is the agent-side
 * `output_uri` it can render; `object_uri` and `archetype` are the
 * cortex-ui-side renderer that handles it.
 *
 * Stage 2 (follow-up): cortex-bff's /register_frontend_capabilities
 * endpoint plumbs this list into the SPO predicate graph; Engine F's
 * /render_ui flips from in-memory _lookup_capability to a
 * /search_predicates call. Until then, the registration is observable
 * in cortex-bff logs as proof of the pattern.
 */

export interface FrontendCapability {
  /** Agent-side output_uri this frontend can render. */
  subject_uri: string;
  /** mesh: IRI of the chosen archetype. */
  object_uri: string;
  /** BAML archetype name passed to the renderer. */
  archetype: string;
  /**
   * React component name that handles this archetype. Diagnostic.
   *
   * EMPTY WHEN THE ANSWER IS ACTED ON RATHER THAN DRAWN — see `consumer`. It stays a required
   * string rather than becoming optional so every existing reader keeps working; an empty
   * component paired with a named consumer is the honest encoding of "nothing renders this".
   */
  component: string;
  /**
   * The module-level reader that CONSUMES this archetype, for answers that are acted on
   * instead of rendered. Exactly one of `component` / `consumer` is meaningful per row, and
   * the dispatch seal checks whichever was declared.
   *
   * CANVAS_SEED is the first: its answer carries slot-ordered artifact ids and
   * `canvasSeedFromArtifact` arranges them onto a canvas. Inventing a placeholder component so
   * the component-shaped seal would pass is `classification-is-not-existence` on purpose.
   */
  consumer?: string;
  /**
   * Layout hint — "full-width" for diagrams/topology, "grid-col-1" for cards, and "none" for
   * an answer that is ACTED ON rather than drawn. "none" is honest rather than a default: a
   * consumed answer occupies no space because it produces no card, and borrowing a card's
   * layout would describe a placement that never happens.
   */
  layout: "full-width" | "grid-col-1" | "none";
  /** Field names this archetype expects to find in structured_data. */
  expected_fields: string[];
  /** Persona affinities — used for ranking when multiple frontends compete. */
  persona_fit: string[];
  /** Domain affinities — used for ranking when multiple frontends compete. */
  domain_fit: string[];
}

export const CORTEX_UI_FRONTEND_ID = "cortex-ui-desktop";

// NOTE: frontend_version is read at runtime from package.json so this
// file doesn't have to be edited every release; see registerCapabilities.

export const CORTEX_UI_CAPABILITIES: FrontendCapability[] = [
  // Engine A's six post-ADR-0017 catalog verbs.
  {
    subject_uri: "mesh:OwnershipFact",
    object_uri: "mesh:KnowledgeDocument",
    archetype: "KNOWLEDGE_DOCUMENT",
    component: "MarkdownRenderer",
    layout: "full-width",
    expected_fields: ["asset_name", "owner_identity", "owner_team", "owner_since"],
    persona_fit: ["DATA_STEWARD", "OPS_OPERATOR"],
    domain_fit: ["DATA_ENGINEERING"],
  },
  {
    subject_uri: "mesh:LineageTopology",
    object_uri: "mesh:ProcessTopology",
    archetype: "PROCESS_TOPOLOGY",
    component: "WorkflowCanvas",
    layout: "full-width",
    expected_fields: ["root_asset", "upstream_chain", "downstream_chain", "topology_depth"],
    persona_fit: ["DATA_STEWARD"],
    domain_fit: ["DATA_ENGINEERING"],
  },
  {
    subject_uri: "mesh:ImpactSet",
    object_uri: "mesh:KnowledgeDocument",
    archetype: "KNOWLEDGE_DOCUMENT",
    component: "MarkdownRenderer",
    layout: "full-width",
    expected_fields: ["root_asset", "impacted_assets", "impact_count"],
    persona_fit: ["DATA_STEWARD"],
    domain_fit: ["DATA_ENGINEERING"],
  },
  {
    subject_uri: "mesh:SchemaDescription",
    object_uri: "mesh:KnowledgeDocument",
    archetype: "KNOWLEDGE_DOCUMENT",
    component: "MarkdownRenderer",
    layout: "full-width",
    expected_fields: ["asset_name", "columns"],
    persona_fit: ["DATA_STEWARD"],
    domain_fit: ["DATA_ENGINEERING"],
  },
  {
    subject_uri: "mesh:FreshnessReport",
    object_uri: "mesh:AssetStateMetric",
    archetype: "ASSET_STATE_METRIC",
    component: "SupplyTable",
    layout: "grid-col-1",
    expected_fields: ["asset_name", "last_updated", "sla_status", "staleness_hours"],
    persona_fit: ["DATA_STEWARD", "OPS_OPERATOR"],
    domain_fit: ["DATA_ENGINEERING"],
  },
  {
    subject_uri: "mesh:TagFilterResult",
    object_uri: "mesh:HazardDeclaration",
    archetype: "HAZARD_DECLARATION",
    component: "WarningCard",
    layout: "grid-col-1",
    expected_fields: ["tag", "matched_assets", "secondary_condition"],
    persona_fit: ["DATA_STEWARD", "COMPLIANCE_OFFICER"],
    domain_fit: ["DATA_ENGINEERING"],
  },
  // Engine A's mesh:describeAsset verb.
  {
    subject_uri: "mesh:AssetProfile",
    object_uri: "mesh:KnowledgeDocument",
    archetype: "KNOWLEDGE_DOCUMENT",
    component: "MarkdownRenderer",
    layout: "full-width",
    expected_fields: ["asset_name", "owner", "tags", "domain", "description", "last_updated"],
    persona_fit: ["DATA_STEWARD"],
    domain_fit: ["DATA_ENGINEERING"],
  },
  // Engine A's mesh:enumerateCatalog verb (flat catalog listing).
  // Renders as KNOWLEDGE_DOCUMENT/MarkdownRenderer, NOT WorkflowCanvas
  // — see ADR-0017 §1 and the run 5fee663d post-mortem for why a
  // catalog enumeration must not route through the topology canvas.
  {
    subject_uri: "mesh:CatalogListing",
    object_uri: "mesh:KnowledgeDocument",
    archetype: "KNOWLEDGE_DOCUMENT",
    component: "MarkdownRenderer",
    layout: "full-width",
    expected_fields: ["scope", "tables", "asset_count"],
    persona_fit: ["DATA_STEWARD"],
    domain_fit: ["DATA_ENGINEERING"],
  },
  // Engine DA — DatasetAnalysisReport renders as chart.
  {
    subject_uri: "mesh:DatasetAnalysisReport",
    object_uri: "mesh:ChartWidget",
    archetype: "CHART_WIDGET",
    component: "ChartWidget",
    layout: "full-width",
    expected_fields: ["dataset_id", "metrics", "viz_type"],
    persona_fit: ["DATA_STEWARD"],
    domain_fit: ["DATA_ENGINEERING"],
  },
  // Engine W — KnowledgeRetrievalResponse renders as document.
  {
    subject_uri: "mesh:KnowledgeRetrievalResponse",
    object_uri: "mesh:KnowledgeDocument",
    archetype: "KNOWLEDGE_DOCUMENT",
    component: "MarkdownRenderer",
    layout: "full-width",
    expected_fields: ["query", "documents", "scores"],
    persona_fit: ["TECH_WRITER", "MECHANIC"],
    domain_fit: ["MAINTENANCE", "MANUFACTURING"],
  },
  // PCN/PDN grouped review — one approver resolves N affected parts in a single
  // accept-all-with-exceptions action. Mirrors SemanticInterpreter's GROUPED_REVIEW
  // case. The batch is per-approver-filtered server-side; each override captures a
  // reason (capture-why structural); needs_review parts are shown, never hidden.
  {
    subject_uri: "mesh:PartObsolescenceReviewBatch",
    object_uri: "mesh:GroupedReview",
    archetype: "GROUPED_REVIEW",
    component: "GroupedReviewTable",
    layout: "full-width",
    expected_fields: ["batch_id", "notice_id", "notice_type", "notice_fingerprint", "items"],
    persona_fit: ["OPS_OPERATOR"],
    domain_fit: ["SUSTAINMENT"],
  },
  // A non-grouped HITL task (qualification / workflow_ack / access_request) as a
  // canvas card — accept/reject through the sealed /act bridge. Mirrors
  // SemanticInterpreter's APPROVAL_TASK case. Was UNREGISTERED, so at overview it
  // inherited a grid col-1 corner cell (presentation by accident, not decision);
  // now declared full-width + the "compact" overview tier (centered in the minimum
  // frame). Domain-agnostic — a generic approval affordance, no domain terms.
  {
    subject_uri: "mesh:HumanApprovalTask",
    object_uri: "mesh:ApprovalTask",
    archetype: "APPROVAL_TASK",
    component: "ApprovalTaskCard",
    layout: "full-width",
    expected_fields: ["task"],
    persona_fit: [],
    domain_fit: [],
  },
  // "Watch my workflow" — read-only, gated domain view of a running workflow.
  // Mirrors SemanticInterpreter's WORKFLOW_OBSERVATION case. The projection is the
  // observer-facing view (no redactions — audit-only, stripped server-side).
  {
    subject_uri: "mesh:WorkflowObservation",
    object_uri: "mesh:WorkflowObservation",
    archetype: "WORKFLOW_OBSERVATION",
    component: "WorkflowObservationView",
    layout: "full-width",
    expected_fields: ["workflow_id", "visible", "domain_stages", "current_stage", "steps", "participants"],
    persona_fit: ["OPS_OPERATOR", "DATA_STEWARD"],
    domain_fit: ["DATA_ENGINEERING", "SUSTAINMENT", "MAINTENANCE"],
  },
  // GENERIC "instances of a class, filtered by one property" table. Mirrors
  // SemanticInterpreter's INSTANCES_BY_PROPERTY case. Domain-agnostic by
  // construction — the payload carries columns/rows/vocabulary; the renderer
  // knows no domain. First consumer is the PCN parts-by-disposition-state
  // dashboard (fed by cortex-bff GET /instances_by_property); domain_fit lists the
  // wired domains, not a limit of the renderer.
  {
    subject_uri: "mesh:InstancesByProperty",
    object_uri: "mesh:InstancesByProperty",
    archetype: "INSTANCES_BY_PROPERTY",
    component: "InstancesByPropertyView",
    layout: "full-width",
    expected_fields: ["title", "target", "columns", "row_identity", "state_vocabulary", "rows"],
    persona_fit: ["SUSTAINMENT_ENGINEER", "DATA_STEWARD"],
    domain_fit: ["SUSTAINMENT", "DATA_ENGINEERING"],
  },
];
