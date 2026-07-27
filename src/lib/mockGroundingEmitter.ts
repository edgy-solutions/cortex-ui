import type { StreamEvent, RouteDecision, Source, GraphTraceNode, DashboardUI } from "@/api/types";

/**
 * Mock grounding-event emitter.
 *
 * Synthesizes a realistic sequence of the new Phase 0+ typed events
 * (`pipeline_stage`, `route_decision`, `sources`, `graph_trace`,
 * `final_payload`, `stream_end`, and `pipeline_error` for failure
 * scenarios) so the grounding panel + canvas artifact-collection can
 * be exercised end-to-end during development WITHOUT a running
 * backend. This keeps Phase 2 hardening fully client-side.
 *
 * **2026-06-26 — Phase 2 scenarios added.** Per `[[phase-2-lifecycle-
 * states-to-enumerate]]`, Phase 1 introduced four new render states
 * (pending / failed / finalized-with-partial / multiple-in-collection)
 * that the one-shot UI never had. To exercise them in dev, the
 * emitter now parses a SCENARIO marker from the query prefix:
 *
 *   @happy <query>             — full success path (default)
 *   @fail <query>              — pipeline_error at "retrieving"; no
 *                                final_payload; artifact ends `failed`
 *   @partial-no-payload <query>— all stages + grounding events but NO
 *                                final_payload; artifact `complete`
 *                                with routing/sources but no rendered
 *   @partial-no-grounding <query> — all stages + final_payload but NO
 *                                route_decision/sources/graph_trace;
 *                                artifact has rendered_output, empty HUD
 *   @empty <query>             — full success path but final_payload
 *                                with components: []; artifact
 *                                complete-but-zero
 *   @doc-image <query>         — full success path with KNOWLEDGE_DOCUMENT
 *                                that has embedded markdown image refs;
 *                                exercises the FederatedImage rendering
 *                                chain. Visual UX target for PDF answers
 *                                with diagrams and IADS slide-in figures.
 *
 * Honest-degradation discipline: the failure/partial states are the
 * Phase 2 enumeration's "honest" axis under inspection — does the UI
 * surface what the pipeline did (or didn't), or does it silently look
 * like nothing happened? See `[[verify-subtle-acceptance-by-inspection]]`
 * extended-to-honest-axis: agent self-verifies works; user verifies
 * honest + acceptable by looking.
 *
 * IMPORTANT — what this is NOT:
 *
 *   - It is NOT a fallback for production. When the gateway emits
 *     these events for real, this emitter is unused.
 *   - It does NOT synthesize a narrative for the user. Mock data is
 *     mock data; it's used in dev mode to verify the UI renders the
 *     contract correctly. In production every value comes from a real
 *     /resolve, /classify_predicate, /find_compatible_verbs response —
 *     the architect's "surface what the pipeline did" principle is
 *     non-negotiable.
 *
 * Activation: set `VITE_MOCK_GROUNDING=1` in your dev env, OR call
 * `setMockGroundingEnabled(true)` at runtime (devtools). The
 * `useInterviewAgent` hook calls `runMockGroundingFor(handleStreamEvent)`
 * AFTER it submits a query, and the events fire on a realistic schedule
 * so the panel animates as it would with a real backend.
 */

const KEY = "cortex-mock-grounding";

export function isMockGroundingEnabled(): boolean {
  if (typeof window === "undefined") return false;
  try {
    if (window.localStorage.getItem(KEY) === "1") return true;
  } catch {
    /* ignore */
  }
  // Vite env var — types are provided by vite/client; safe direct access.
  const envVal = (import.meta as unknown as { env?: Record<string, string> }).env
    ?.VITE_MOCK_GROUNDING;
  return envVal === "1" || envVal === "true";
}

export function setMockGroundingEnabled(on: boolean) {
  if (typeof window === "undefined") return;
  try {
    if (on) window.localStorage.setItem(KEY, "1");
    else window.localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}

/** Scenarios the mock can simulate for Phase 2 lifecycle state hardening. */
export type MockScenario =
  | "happy"
  | "fail-at-retrieving"
  | "partial-no-payload"
  | "partial-no-grounding"
  | "empty-components"
  | "chart-single"
  | "chart-multi"
  | "chart-line"
  | "chart-pie"
  | "chart-scatter"
  | "topology"
  | "hazard"
  | "table"
  | "doc"
  // `doc-image` (added 2026-06-29) exercises the SemanticInterpreter's
  // markdown `img` renderer end-to-end via FederatedImage. The mock
  // produces a KNOWLEDGE_DOCUMENT whose markdown_content has
  // `![alt](URL)` references — the renderer routes each through
  // FederatedImage, which passes non-s3:// URIs straight through.
  // Sets the visual target for the real PDF answer path: today
  // `process_document_artifact` uploads images to S3 but
  // `build_knowledge_graph` doesn't inject markdown image refs into
  // chunks, so the LLM never references them in the final answer.
  // Once the architect okays the visual, the real fix is small.
  | "doc-image"
  // INSTANCES_BY_PROPERTY hardening. `instances` renders the PCN parts-by-
  // disposition-state dashboard (the archetype's first instance); `instances-
  // generic` feeds the SAME renderer a NON-PCN payload (datasets by domain) —
  // the generic-by-construction proof (schema doc §Acceptance): if both draw a
  // correct table, the widget is not PCN-shaped in disguise.
  | "instances"
  | "instances-generic";
// `twin` (DIGITAL_TWIN_3D) was REMOVED 2026-06-26 — the archetype's
// dispatch was deferred until a proper visual pass. The widget file
// itself is preserved at `src/components/mesh/DigitalTwinWidget.tsx`
// for the future revisit; re-add `twin` here, in parseScenario, in
// buildArchetypePayload, and re-import the dispatch case when the
// concept is picked back up.

/**
 * Parse a leading `@scenario ` prefix off the query. Defaults to
 * "happy" when no marker is present. Returns the clean query (with
 * the marker stripped) so downstream heuristics still work.
 *
 * Scenario families:
 *
 *   Lifecycle scenarios (happy / fail / partial-no-payload /
 *   partial-no-grounding / empty) — control the EVENT TIMELINE
 *   (which events fire and when). Payload archetype defaults to
 *   KNOWLEDGE_DOCUMENT (rendered by the query keyword heuristic).
 *
 *   Payload scenarios (chart-single / chart-multi) — control which
 *   ARCHETYPE the happy-path final_payload uses. Lifecycle is the
 *   happy path; the rendered_output is a CHART_WIDGET with
 *   single-dim or multi-dim chart_data so the ChartWidget's
 *   shape-detection + pivot path is exerciseable. Closes
 *   `[[multi-dim-chart-normalizer-gap]]` for the rendering layer.
 */
function parseScenario(query: string): {
  scenario: MockScenario;
  cleanQuery: string;
} {
  // doc-image must precede doc in the regex alternation so the longer
  // marker wins (regex would otherwise match "@doc" and leave "-image"
  // in the cleanQuery).
  const m = query.match(
    /^@(happy|fail|partial-no-payload|partial-no-grounding|empty|chart-single|chart-multi|chart-line|chart-pie|chart-scatter|topology|hazard|table|doc-image|doc|instances-generic|instances)\s+(.+)$/i
  );
  if (!m) return { scenario: "happy", cleanQuery: query };
  const marker = m[1].toLowerCase();
  const cleanQuery = m[2];
  switch (marker) {
    case "fail":
      return { scenario: "fail-at-retrieving", cleanQuery };
    case "partial-no-payload":
      return { scenario: "partial-no-payload", cleanQuery };
    case "partial-no-grounding":
      return { scenario: "partial-no-grounding", cleanQuery };
    case "empty":
      return { scenario: "empty-components", cleanQuery };
    case "chart-single":
      return { scenario: "chart-single", cleanQuery };
    case "chart-multi":
      return { scenario: "chart-multi", cleanQuery };
    case "chart-line":
      return { scenario: "chart-line", cleanQuery };
    case "chart-pie":
      return { scenario: "chart-pie", cleanQuery };
    case "chart-scatter":
      return { scenario: "chart-scatter", cleanQuery };
    case "topology":
      return { scenario: "topology", cleanQuery };
    case "hazard":
      return { scenario: "hazard", cleanQuery };
    case "table":
      return { scenario: "table", cleanQuery };
    case "doc":
      return { scenario: "doc", cleanQuery };
    case "doc-image":
      return { scenario: "doc-image", cleanQuery };
    case "instances-generic":
      return { scenario: "instances-generic", cleanQuery };
    case "instances":
      return { scenario: "instances", cleanQuery };
    default:
      return { scenario: "happy", cleanQuery };
  }
}

/**
 * Build an INSTANCES_BY_PROPERTY payload for the `@instances` / `@instances-
 * generic` scenarios. TWO payloads over the SAME renderer:
 *   - `instances`         → PCN parts by disposition_state (the first instance)
 *   - `instances-generic` → datasets by domain (NON-PCN, same shape)
 * If both draw correct tables the widget is generic-by-construction, not PCN-
 * shaped in disguise (schema doc §Acceptance). All identifiers are mock.
 */
function buildInstancesByPropertyPayload(
  scenario: "instances" | "instances-generic"
): DashboardUI {
  if (scenario === "instances-generic") {
    // A completely different domain/class/property — the generic proof. The
    // renderer draws these headers/rows/tabs with zero code changes.
    return {
      components: [
        {
          archetype: "INSTANCES_BY_PROPERTY",
          title: "Datasets by domain",
          target: {
            domain: "DATA_ENGINEERING",
            class: "idp:Dataset",
            filter_property: "idp:domain",
            filter_value: "DATA_ENGINEERING",
          },
          columns: [
            { key: "instance", label: "Dataset", from: "row_identity" },
            { key: "domain", label: "Domain", from: "idp:domain" },
            { key: "owner", label: "Owner", from: "idp:owner" },
            { key: "rows", label: "Row count", from: "idp:rowCount" },
          ],
          row_identity: { key: "instance", iri: true, display_from_local_name: true },
          state_vocabulary: ["DATA_ENGINEERING", "MAINTENANCE", "MANUFACTURING", "SUSTAINMENT"],
          rows: [
            { instance: "urn:li:dataset:mock/customers_gold", domain: "DATA_ENGINEERING", owner: "data-stewards", rows: "1,284,001" },
            { instance: "urn:li:dataset:mock/orders_curated", domain: "DATA_ENGINEERING", owner: "data-stewards", rows: "982,540" },
            { instance: "urn:li:dataset:mock/sessions_raw", domain: "DATA_ENGINEERING", owner: "platform", rows: "44,102,778" },
          ],
        },
      ],
    } as unknown as DashboardUI;
  }
  // PCN parts by disposition_state — mirrors cortex-bff GET /instances_by_property.
  return {
    components: [
      {
        archetype: "INSTANCES_BY_PROPERTY",
        title: "Parts by disposition state",
        target: {
          domain: "SUSTAINMENT",
          class: "pcn:Component",
          filter_property: "pcn:dispositionState",
          filter_value: "dispatchQualification",
        },
        columns: [
          { key: "instance", label: "Part", from: "row_identity" },
          { key: "state", label: "State", from: "pcn:dispositionState" },
          { key: "ref", label: "Resolution", from: "pcn:dispositionRef" },
          { key: "ruleset", label: "Policy", from: "pcn:proposedByRuleset" },
        ],
        row_identity: { key: "instance", iri: true, display_from_local_name: true },
        state_vocabulary: ["dispatchQualification", "dispatchLTB", "dispatchAltSourcing", "archive"],
        rows: [
          { instance: "http://internal/components/NSR01L30NXT5G", state: "dispatchQualification", ref: "IPCN25300X:NSR01L30NXT5G", ruleset: "rules@2915ddb229e4" },
          { instance: "http://internal/components/NSR02F30NXT5G", state: "dispatchQualification", ref: "IPCN25300X:NSR02F30NXT5G", ruleset: "rules@2915ddb229e4" },
          { instance: "http://internal/components/NSR05F20NXT5G", state: "dispatchQualification", ref: "IPCN25300X:NSR05F20NXT5G", ruleset: "rules@2915ddb229e4" },
        ],
      },
    ],
  } as unknown as DashboardUI;
}

/**
 * Build an archetype-specific payload for the @<archetype> mock
 * scenarios. Each scenario exercises ONE SemanticInterpreter
 * dispatch case so the renderer can be hardened visually without
 * needing a real backend to produce that archetype's shape.
 *
 * All payloads use example.com / mock identifiers. Never paste real
 * data here.
 */
function buildArchetypePayload(
  scenario: "topology" | "hazard" | "table" | "doc" | "doc-image"
): DashboardUI {
  switch (scenario) {
    case "topology":
      return {
        components: [
          {
            archetype: "PROCESS_TOPOLOGY",
            subject_concept: "Customer onboarding workflow (mock)",
            nodes: [
              { id: "n1", name: "Receive signup", type: "trigger" },
              { id: "n2", name: "Verify email", type: "validation" },
              { id: "n3", name: "Create account", type: "action" },
              { id: "n4", name: "Send welcome", type: "notification" },
            ],
            edges: [
              { source: "n1", target: "n2", relation: "triggers" },
              { source: "n2", target: "n3", relation: "passes to" },
              { source: "n3", target: "n4", relation: "fires" },
            ],
          },
        ],
      } as unknown as DashboardUI;
    case "hazard":
      return {
        components: [
          {
            archetype: "HAZARD_DECLARATION",
            subject_concept: "M67 grenade assembly station — known hazards",
            severity: "CRITICAL",
            hazards: [
              {
                id: "h1",
                name: "Fuze rotation hazard",
                type: "MECHANICAL",
                description:
                  "Risk of inadvertent activation if fuze torqued beyond 32 in-lb.",
              },
              {
                id: "h2",
                name: "Static discharge",
                type: "ELECTRICAL",
                description:
                  "Always ground the workbench before handling sub-assemblies.",
              },
            ],
          },
        ],
      } as unknown as DashboardUI;
    case "table":
      return {
        components: [
          {
            archetype: "ASSET_STATE_METRIC",
            subject_concept: "Catalog assets (mock)",
            metrics: [
              {
                id: "m1",
                name: "mesh_demo_customers",
                type: "dataset",
                description: "10 rows · last updated 2026-06-26",
              },
              {
                id: "m2",
                name: "publog_lake_index",
                type: "table",
                description: "Tier: bronze · health: nominal",
              },
              {
                id: "m3",
                name: "engine_a_routing",
                type: "view",
                description: "Live · 1.2k rows/min",
              },
            ],
          },
        ],
      } as unknown as DashboardUI;
    case "doc":
      // Enriched 2026-06-26 to exercise the full prose modifier set:
      // h2 (with cyan underline), bold, italic, table, code (inline +
      // block), blockquote, link, list. The mock is the renderer's
      // test fixture; the richer the fixture, the more honest the
      // visual hardening.
      return {
        components: [
          {
            archetype: "KNOWLEDGE_DOCUMENT",
            subject_concept: "Demo Dashboard Alpha — ownership",
            markdown_content: [
              "## Ownership at a glance",
              "",
              "**Owners (3)** — verified via the Superset → DataHub bridge:",
              "",
              "| Email | Role | Joined |",
              "|---|---|---|",
              "| owner-a@example.com | Steward | 2025-Q3 |",
              "| owner-b@example.com | Editor | 2025-Q4 |",
              "| owner-c@example.com | Viewer | 2026-Q1 |",
              "",
              "### Audit query",
              "",
              "```sql",
              "SELECT u.email, u.role, u.joined_at",
              "FROM superset_dashboard_owners u",
              "WHERE u.dashboard_urn = 'urn:li:dashboard:superset:demo_dashboard_alpha'",
              "ORDER BY u.joined_at;",
              "```",
              "",
              "> Ownership changes propagate through the catalog within one",
              "> sync cycle (~5 minutes). Stale views may appear briefly during a",
              "> rollover — the staleness contract is honored by the freshness",
              "> banner on the next read.",
              "",
              "*Source: [Superset → DataHub catalog](https://datahub.example/dashboard/demo_dashboard_alpha) (mock data).*",
              "",
              "**Last verified:** `2026-06-26T22:30:00Z`",
            ].join("\n"),
          },
        ],
      } as unknown as DashboardUI;
    case "doc-image":
      // Exercises the SemanticInterpreter's markdown `img` renderer
      // end-to-end via FederatedImage. The mock uses placeholder
      // image URLs (https://) — FederatedImage's non-s3:// branch
      // passes them straight through to a native <img> tag, so the
      // chain renders WITHOUT a running cortex-bff or S3-backed
      // image.
      //
      // The content shape mirrors what a real PDF-with-diagrams
      // answer should look like once we wire `build_knowledge_graph`
      // to inject image markdown into chunks:
      //   - prose steps that REFERENCE callout numbers in the figure
      //     (1, 2, 3, ...) — same pattern the 40051 helmet XML uses
      //     via `<callout assocfig="..." label="N">`
      //   - the figure immediately under the steps, with an alt-text
      //     caption rendered below it by the img wrapper
      //   - a "Figures" section at the bottom collating all referenced
      //     figures with their captions — so the user can scan all
      //     diagrams in the answer at a glance
      //
      // When you swap any of these `https://placehold.co/...` URLs
      // for a real `s3://processing-artifacts/manufacturing/inbound/
      // generated/<doc>_pdf/images/<file>.png` (and you have
      // cortex-bff + the auth header), the SAME UX renders against
      // the live federated path. That's the integration target —
      // the mock just removes the infra dependency for visual
      // iteration.
      return {
        components: [
          {
            archetype: "KNOWLEDGE_DOCUMENT",
            subject_concept:
              "Microphone Boom Removal — Procedure with diagrams (mock)",
            markdown_content: [
              "## Microphone Boom Removal",
              "",
              "**Module:** TM 1-1680-TNG-13P · **Domain:** Helmet Audio Equipment · **Procedure ID:** m0004-1-1680-TNG",
              "",
              "### Tools required",
              "",
              "- Cross-tip screwdriver",
              "- Soft cloth (lint-free)",
              "",
              "### Removal steps",
              "",
              "1. Using a cross-tip screwdriver, remove the **swivel assembly screw** (1) and **washer** (2).",
              "2. Remove the **flat washer** (3) from the **boom support washer** (9).",
              "3. Remove the **special washer** (5) from the boom support washer.",
              "4. Remove the **boom** (8) and the **grooved washer** (4).",
              "5. Disconnect the **microphone cord** from the clip attached to the boom assembly.",
              "6. Remove the **thumbscrew** from the boom and remove the microphone from the boom.",
              "",
              "![Figure 1 — Boom and Microphone (exploded view, callouts 1–9)](https://placehold.co/720x440/0891b2/ffffff?text=Figure+1+%E2%80%94+Boom+and+Microphone)",
              "",
              "### Re-installation steps",
              "",
              "1. Using a cross-tip screwdriver, attach the **screw** (6) to the **knurled knob** (7).",
              "2. Attach the **flat washer** (3) to the **boom support washer** (9).",
              "3. Using a cross-tip screwdriver, attach the **swivel assembly screw** (1) and **washer** (2).",
              "4. Plug the microphone cord into the communications jack on the rear of the helmet.",
              "",
              "![Figure 2 — Communications jack (rear of helmet)](https://placehold.co/720x300/0e7490/ffffff?text=Figure+2+%E2%80%94+Comm+jack+%28rear%29)",
              "",
              "> **Inspection:** before re-installing, examine the boom and microphone assembly for any loose screws or visible damage. Replace any worn parts in accordance with TM 1-1680-TNG-13P §4.2.",
              "",
              "### Figures referenced",
              "",
              "| Figure | Title | Source |",
              "|---|---|---|",
              "| 1 | Boom and Microphone (exploded view) | TM 1-1680-TNG-13P, Fig. M00016 |",
              "| 2 | Communications jack (rear of helmet) | TM 1-1680-TNG-13P, Fig. M00017 |",
              "",
              "*Mock content — figures rendered via FederatedImage's non-`s3://` passthrough. In production the URLs would be `s3://processing-artifacts/.../images/<figure>.png` produced by the PDF or IADS ingest paths.*",
            ].join("\n"),
          },
        ],
      } as unknown as DashboardUI;
  }
}

/**
 * Build a CHART_WIDGET payload for the chart-* scenarios. The
 * `chart_data` field is the JSON-stringified row data — mirrors the
 * real BAML contract shape ChartUI declares. The ChartWidget's
 * shape-detector normalizes both single-dim (1 categorical + 1
 * numeric) and multi-dim (≥2 categorical + 1 numeric) rows.
 */
function buildChartPayload(
  scenario:
    | "chart-single"
    | "chart-multi"
    | "chart-line"
    | "chart-pie"
    | "chart-scatter"
): DashboardUI {
  if (scenario === "chart-single") {
    // Single-dim: rotor inspection findings (one category column +
    // one numeric column). Mirrors the existing
    // [{name, value}] backend shape — the chart should render as
    // single-series cyan bars (no legend).
    const rows = [
      { name: "Spalling", value: 4 },
      { name: "Cracking", value: 2 },
      { name: "Wear", value: 5 },
      { name: "OK", value: 9 },
    ];
    return {
      components: [
        {
          archetype: "CHART_WIDGET",
          subject_concept: "Rotor inspection findings (mock)",
          chart_type: "BAR",
          chart_data: JSON.stringify(rows),
          sql_query:
            "SELECT category, COUNT(*) FROM rotor_inspection GROUP BY category",
          is_published: false,
        },
      ],
    } as unknown as DashboardUI;
  }

  if (scenario === "chart-multi") {
    // Multi-dim: customer breakdown by region AND plan. The exact
    // shape that exposed the `[[multi-dim-chart-normalizer-gap]]` —
    // under the old hardcoded `dataKey="name"`, this collapsed to 8
    // bars labeled with region duplicates. The shape-detector + pivot
    // in ChartWidget now produces grouped bars.
    const rows = [
      { region: "APAC", plan: "pro", customer_count: 2 },
      { region: "APAC", plan: "enterprise", customer_count: 1 },
      { region: "EU-North", plan: "starter", customer_count: 1 },
      { region: "EU-North", plan: "enterprise", customer_count: 1 },
      { region: "EU-South", plan: "starter", customer_count: 1 },
      { region: "US-East", plan: "pro", customer_count: 3 },
      { region: "US-East", plan: "enterprise", customer_count: 1 },
      { region: "US-West", plan: "pro", customer_count: 1 },
      { region: "US-West", plan: "starter", customer_count: 1 },
    ];
    return {
      components: [
        {
          archetype: "CHART_WIDGET",
          subject_concept: "Customer breakdown by region and plan (mock)",
          chart_type: "BAR",
          chart_data: JSON.stringify(rows),
          sql_query:
            "SELECT region, plan, COUNT(*) AS customer_count FROM mesh_demo_customers GROUP BY region, plan ORDER BY region, plan",
          is_published: false,
        },
      ],
    } as unknown as DashboardUI;
  }

  if (scenario === "chart-line") {
    // Multi-series LINE — engine latency over 7 days, one line per
    // engine. Exercises the existing LINE branch with the multi-
    // series pivot (region of code that worked but had no mock).
    const rows = [
      { day: "Mon", engine: "Engine A", latency_ms: 120 },
      { day: "Mon", engine: "Engine W", latency_ms: 95 },
      { day: "Mon", engine: "Engine E", latency_ms: 210 },
      { day: "Tue", engine: "Engine A", latency_ms: 115 },
      { day: "Tue", engine: "Engine W", latency_ms: 102 },
      { day: "Tue", engine: "Engine E", latency_ms: 198 },
      { day: "Wed", engine: "Engine A", latency_ms: 130 },
      { day: "Wed", engine: "Engine W", latency_ms: 88 },
      { day: "Wed", engine: "Engine E", latency_ms: 220 },
      { day: "Thu", engine: "Engine A", latency_ms: 108 },
      { day: "Thu", engine: "Engine W", latency_ms: 91 },
      { day: "Thu", engine: "Engine E", latency_ms: 205 },
      { day: "Fri", engine: "Engine A", latency_ms: 125 },
      { day: "Fri", engine: "Engine W", latency_ms: 97 },
      { day: "Fri", engine: "Engine E", latency_ms: 215 },
      { day: "Sat", engine: "Engine A", latency_ms: 119 },
      { day: "Sat", engine: "Engine W", latency_ms: 86 },
      { day: "Sat", engine: "Engine E", latency_ms: 190 },
      { day: "Sun", engine: "Engine A", latency_ms: 112 },
      { day: "Sun", engine: "Engine W", latency_ms: 93 },
      { day: "Sun", engine: "Engine E", latency_ms: 200 },
    ];
    return {
      components: [
        {
          archetype: "CHART_WIDGET",
          subject_concept: "Engine latency over 7 days (mock)",
          chart_type: "LINE",
          chart_data: JSON.stringify(rows),
          sql_query:
            "SELECT day, engine, AVG(latency_ms) AS latency_ms FROM engine_telemetry GROUP BY day, engine ORDER BY day, engine",
          is_published: false,
        },
      ],
    } as unknown as DashboardUI;
  }

  if (scenario === "chart-pie") {
    // PIE — single-dim natural fit. Customer count by region as
    // slices. Pie can't multi-series; the shape is intrinsically
    // one categorical + one numeric.
    const rows = [
      { region: "APAC", customer_count: 12 },
      { region: "US-East", customer_count: 24 },
      { region: "US-West", customer_count: 18 },
      { region: "EU-North", customer_count: 9 },
      { region: "EU-South", customer_count: 6 },
    ];
    return {
      components: [
        {
          archetype: "CHART_WIDGET",
          subject_concept: "Customer distribution by region (mock)",
          chart_type: "PIE",
          chart_data: JSON.stringify(rows),
          sql_query:
            "SELECT region, COUNT(*) AS customer_count FROM mesh_demo_customers GROUP BY region",
          is_published: false,
        },
      ],
    } as unknown as DashboardUI;
  }

  // chart-scatter — asset thermal vs uptime, colored by severity.
  // Exercises the scatter-multi shape: two numeric columns (X+Y)
  // plus a categorical series discriminator. Each severity becomes
  // its own colored cluster — visually distinct point clouds make
  // the correlation obvious without needing a second axis chart.
  const rows = [
    { uptime_hours: 50, temp_c: 62, severity: "OK" },
    { uptime_hours: 80, temp_c: 64, severity: "OK" },
    { uptime_hours: 130, temp_c: 67, severity: "OK" },
    { uptime_hours: 170, temp_c: 65, severity: "OK" },
    { uptime_hours: 210, temp_c: 70, severity: "OK" },
    { uptime_hours: 250, temp_c: 78, severity: "DEGRADED" },
    { uptime_hours: 290, temp_c: 82, severity: "DEGRADED" },
    { uptime_hours: 330, temp_c: 80, severity: "DEGRADED" },
    { uptime_hours: 380, temp_c: 88, severity: "DEGRADED" },
    { uptime_hours: 420, temp_c: 96, severity: "CRITICAL" },
    { uptime_hours: 460, temp_c: 102, severity: "CRITICAL" },
    { uptime_hours: 510, temp_c: 99, severity: "CRITICAL" },
  ];
  return {
    components: [
      {
        archetype: "CHART_WIDGET",
        subject_concept: "Asset thermal vs uptime (mock)",
        chart_type: "SCATTER",
        chart_data: JSON.stringify(rows),
        sql_query:
          "SELECT uptime_hours, temp_c, severity FROM asset_telemetry WHERE captured_at > NOW() - INTERVAL '24h'",
        is_published: false,
      },
    ],
  } as unknown as DashboardUI;
}

/**
 * Build a query-flavored mock event sequence. Heuristic — picks
 * different mock data depending on the input string so the panel
 * looks responsive to what the user typed (e.g. "M67 grenade" →
 * Manufacturing Work Instruction; "rotor assembly" → Maintenance
 * Procedure). All values are still mock; the heuristic just makes the
 * dev experience less repetitive.
 */
function buildMockSequenceForQuery(query: string): {
  decision: RouteDecision;
  sources: Source[];
  graphTrace: GraphTraceNode[];
  payload: DashboardUI;
} {
  const q = query.toLowerCase();
  if (
    q.includes("dashboard") ||
    q.includes("superset") ||
    q.includes("own") ||
    q.includes("catalog")
  ) {
    // Mock data ONLY. All placeholder names and emails use example.com
    // / example-org domains and obviously-fake identifiers, so a reader
    // can never confuse mock output with real catalog data. Never paste
    // production query results here — production identifiers and PII
    // must not enter source.
    return {
      decision: {
        about: {
          label: "Catalog Asset",
          uri: "http://invincible-agent/idp#Dataset",
          confidence: 0.94,
          instance_resolved: true,
          instance_identifier: "Demo Dashboard Alpha",
        },
        action: {
          label: "Look up ownership",
          iri: "mesh:lookupOwnership",
          confidence: 0.91,
          classify_called: true,
          candidate_count: 1,
          owner_persona: "DATA_STEWARD",
        },
        handled_by: {
          engine_name: "Engine A",
          provider: "engine_a_lookup_ownership",
          endpoint_url: "http://iagent-engine-a:8081/analyze",
        },
      },
      sources: [
        {
          type: "catalog_asset",
          label: "Demo Dashboard Alpha (Superset)",
          uri: "urn:li:dashboard:superset:demo_dashboard_alpha",
          relevance: 1.0,
          snippet: "owners: owner-a@example.com, owner-b@example.com, owner-c@example.com",
          open_url: "https://datahub.example/dashboard/demo_dashboard_alpha",
        },
      ],
      graphTrace: [
        {
          uri: "http://invincible-agent/idp#Dataset",
          label: "Dataset",
          role: "resolved_subject",
          hops: 0,
        },
        {
          uri: "http://invincible-agent/mesh#OwnershipFact",
          label: "Ownership Fact",
          role: "output_class",
          via_verb: "mesh:lookupOwnership",
        },
      ],
      payload: {
        components: [
          {
            archetype: "KNOWLEDGE_DOCUMENT",
            subject_concept: "Demo Dashboard Alpha ownership",
            markdown_content:
              "**Demo Dashboard Alpha** is owned by:\n\n- owner-a@example.com\n- owner-b@example.com\n- owner-c@example.com\n\n*Source: Superset → DataHub catalog (mock).*",
          },
        ],
      } as unknown as DashboardUI,
    };
  }
  if (q.includes("grenade") || q.includes("assembly") || q.includes("manufactur")) {
    return {
      decision: {
        about: {
          label: "Manufacturing Work Instruction",
          uri: "http://edgy-solutions.com/ontology/mfg#WorkInstruction",
          confidence: 0.98,
        },
        action: {
          label: "Search technical manuals",
          iri: "mesh:retrieveKnowledge",
          confidence: 0.92,
          classify_called: true,
          candidate_count: 1,
          owner_persona: "TECH_WRITER",
        },
        handled_by: {
          engine_name: "Engine W",
          provider: "engine_w_weaviate_expert_work_instruction",
          endpoint_url: "http://iagent-engine-w:8088/query_knowledge",
        },
      },
      sources: [
        {
          type: "document",
          label: "TM-9-1325-203-10 · p.47",
          uri: "s3://docs/manufacturing/work-instructions/M67/grenade-assembly.pdf",
          relevance: 0.89,
          snippet:
            "Assembly procedure for M67 grenade fuze well: position the M213 fuze into the body's threaded receptacle and torque to 25-30 in-lb per…",
          open_url: "#",
        },
        {
          type: "document",
          label: "IPB-9-1325 · p.12",
          uri: "s3://docs/manufacturing/work-instructions/M67/ipb.pdf",
          relevance: 0.71,
        },
      ],
      graphTrace: [
        {
          uri: "http://edgy-solutions.com/ontology/mfg#WorkInstruction",
          label: "Manufacturing Work Instruction",
          role: "resolved_subject",
          hops: 0,
        },
        {
          uri: "http://invincible-agent/mesh#KnowledgeRetrievalResponse",
          label: "Knowledge Retrieval Response",
          role: "output_class",
          via_verb: "mesh:retrieveKnowledge",
        },
      ],
      payload: {
        components: [
          {
            archetype: "KNOWLEDGE_DOCUMENT",
            subject_concept: "M67 grenade assembly excerpt",
            markdown_content:
              "## TM-9-1325-203-10 · p.47\n\nPosition the M213 fuze into the body's threaded receptacle and torque to **25-30 in-lb**.\n\n*Excerpt — mock data.*",
          },
        ],
      } as unknown as DashboardUI,
    };
  }
  // Default: maintenance procedure flavor — lower confidence to
  // demonstrate the honest-low-confidence display.
  return {
    decision: {
      about: {
        label: "Procedure Step",
        uri: "https://spec.industrialontologies.org/ontology/maintenance/MaintenanceReferenceOntology/ProcedureStep",
        confidence: 0.62,
      },
      action: {
        label: "Query knowledge graph",
        iri: "mesh:queryKnowledgeGraph",
        confidence: 0.55,
        classify_called: true,
        candidate_count: 2,
        owner_persona: "AUDITOR",
      },
      handled_by: {
        engine_name: "Engine E",
        provider: "engine_e_neo4j_expert_procedure_step",
        endpoint_url: "http://iagent-engine-e:8086/query_graph",
      },
    },
    sources: [
      {
        type: "graph_node",
        label: "Procedure: rotor assembly checklist",
        uri: "neo4j://proc/rotor-assembly-1234",
        relevance: 0.66,
        snippet:
          "Inspect rotor blade root for spalling; if present, replace per Section 3.4.…",
      },
    ],
    graphTrace: [
      {
        uri: "https://spec.industrialontologies.org/ontology/maintenance/MaintenanceReferenceOntology/ProcedureStep",
        label: "Procedure Step",
        role: "resolved_subject",
        hops: 0,
      },
      {
        uri: "http://invincible-agent/mesh#GraphExpertResponse",
        label: "Graph Expert Response",
        role: "output_class",
        via_verb: "mesh:queryKnowledgeGraph",
      },
    ],
    payload: {
      components: [
        {
          archetype: "KNOWLEDGE_DOCUMENT",
          subject_concept: "Rotor inspection findings (mock)",
          markdown_content:
            "## Rotor inspection summary\n\n| Finding | Count |\n|---|---|\n| Spalling | 4 |\n| Cracking | 2 |\n| Wear | 5 |\n| OK | 9 |\n\n*Mock data — chart_widget hardening is its own Phase 2 task.*",
        },
      ],
    } as unknown as DashboardUI,
  };
}

/**
 * ms after submit — when each stage completes / event fires.
 *
 * Phase 2 inspection feedback: the previous values (compressed into
 * ~6s total) made the pending state pass too quickly to comfortably
 * watch. Doubled to ~12s total so each transition is observable
 * during state-by-state walkthroughs. This is a DEV pacing choice
 * — production timings are whatever the real backend produces; the
 * mock's job is to let a human comfortably see each lifecycle
 * transition during hardening.
 */
const TIMINGS = {
  understanding_complete: 1200,
  locating_start: 400,
  locating_complete: 2600,
  choosing_action_start: 2000,
  choosing_action_complete: 4800,
  retrieving_start: 3800,
  retrieving_complete: 8400,
  composing_start: 7000,
  composing_complete: 10800,
  route_decision: 5000, // after subject+action are known
  sources: 8800, // after retrieval
  graph_trace: 5400,
  final_payload: 11200, // shortly after composing completes
  stream_end: 11800, // terminator
  // Failure-scenario timings
  fail_at_retrieving: 8600, // shortly after retrieving started
};

export interface MockHandle {
  cancel: () => void;
}

/**
 * Fire a sequence of typed grounding events that mimics a real query
 * flowing through the routing substrate. The events are deliberately
 * spaced so the panel animates rather than snapping.
 *
 * Honors the scenario marker parsed off the query prefix (`@fail`,
 * `@partial-no-payload`, `@partial-no-grounding`, `@empty`, or default
 * `@happy`). See module docstring for the protocol.
 */
export function runMockGroundingFor(
  query: string,
  emit: (e: StreamEvent) => void
): MockHandle {
  const timers: number[] = [];
  const { scenario, cleanQuery } = parseScenario(query);
  const seq = buildMockSequenceForQuery(cleanQuery);
  const schedule = (ms: number, fn: () => void) => {
    timers.push(window.setTimeout(fn, ms));
  };

  // Stage progression — common to all scenarios up to the divergence.
  schedule(TIMINGS.understanding_complete, () =>
    emit({ type: "pipeline_stage", kind: "understanding", status: "completed" })
  );
  schedule(TIMINGS.locating_start, () =>
    emit({ type: "pipeline_stage", kind: "locating", status: "started" })
  );
  schedule(TIMINGS.locating_complete, () =>
    emit({
      type: "pipeline_stage",
      kind: "locating",
      status: "completed",
      detail: { subject_uri: seq.decision.about.uri },
    })
  );
  schedule(TIMINGS.choosing_action_start, () =>
    emit({ type: "pipeline_stage", kind: "choosing_action", status: "started" })
  );
  schedule(TIMINGS.choosing_action_complete, () =>
    emit({
      type: "pipeline_stage",
      kind: "choosing_action",
      status: "completed",
      detail: {
        verb_iri: seq.decision.action.iri,
        n_candidates: seq.decision.action.candidate_count,
      },
    })
  );
  schedule(TIMINGS.retrieving_start, () =>
    emit({ type: "pipeline_stage", kind: "retrieving", status: "started" })
  );

  // FAIL scenario: bail at "retrieving" — no completion, no further
  // stages, pipeline_error fires, stream_end follows. The artifact
  // ends `status: "failed"`. Routing/sources DON'T fire after the
  // error to keep the failure visible (no partial-success masking).
  if (scenario === "fail-at-retrieving") {
    schedule(TIMINGS.fail_at_retrieving, () =>
      emit({
        type: "pipeline_error",
        kind: "retrieving",
        message: "Mock failure: simulated engine timeout (Phase 2 honest-failure scenario)",
        retryable: true,
        cause: "engine_timeout_mock",
      })
    );
    schedule(TIMINGS.stream_end, () => emit({ type: "stream_end" }));
    return {
      cancel: () => timers.forEach((t) => window.clearTimeout(t)),
    };
  }

  // Non-fail scenarios: complete retrieving + composing stages.
  schedule(TIMINGS.retrieving_complete, () =>
    emit({ type: "pipeline_stage", kind: "retrieving", status: "completed" })
  );
  schedule(TIMINGS.composing_start, () =>
    emit({ type: "pipeline_stage", kind: "composing", status: "started" })
  );
  schedule(TIMINGS.composing_complete, () =>
    emit({ type: "pipeline_stage", kind: "composing", status: "completed" })
  );

  // Right-HUD payloads — fire ONLY when the scenario provides grounding.
  // `partial-no-grounding` deliberately skips these so the artifact has
  // rendered_output but empty HUD (the inverse of partial-no-payload).
  if (scenario !== "partial-no-grounding") {
    schedule(TIMINGS.route_decision, () =>
      emit({ type: "route_decision", decision: seq.decision })
    );
    schedule(TIMINGS.graph_trace, () =>
      emit({ type: "graph_trace", nodes: seq.graphTrace })
    );
    schedule(TIMINGS.sources, () =>
      emit({ type: "sources", sources: seq.sources })
    );
  }

  // final_payload — fires ONLY when the scenario provides a rendered
  // output. `partial-no-payload` skips this so the artifact finalizes
  // complete with routing/sources but null rendered_output.
  if (scenario !== "partial-no-payload") {
    const payload: DashboardUI =
      scenario === "empty-components"
        ? ({ components: [] } as DashboardUI)
        : scenario === "chart-single" ||
          scenario === "chart-multi" ||
          scenario === "chart-line" ||
          scenario === "chart-pie" ||
          scenario === "chart-scatter"
        ? buildChartPayload(scenario)
        : scenario === "topology" ||
          scenario === "hazard" ||
          scenario === "table" ||
          scenario === "doc" ||
          scenario === "doc-image"
        ? buildArchetypePayload(scenario)
        : scenario === "instances" || scenario === "instances-generic"
        ? buildInstancesByPropertyPayload(scenario)
        : seq.payload;
    schedule(TIMINGS.final_payload, () =>
      emit({ type: "final_payload", payload })
    );
  }

  // stream_end always fires — pending artifacts terminate, honestly
  // (acceptance #2's pending-doesn't-live-forever discipline). See
  // useInterviewAgent's stream_end handler for the artifact lifecycle
  // finalization.
  schedule(TIMINGS.stream_end, () => emit({ type: "stream_end" }));

  return {
    cancel: () => {
      timers.forEach((t) => window.clearTimeout(t));
    },
  };
}
