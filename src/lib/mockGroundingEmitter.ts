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
  | "chart-multi";

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
  const m = query.match(
    /^@(happy|fail|partial-no-payload|partial-no-grounding|empty|chart-single|chart-multi)\s+(.+)$/i
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
    default:
      return { scenario: "happy", cleanQuery };
  }
}

/**
 * Build a CHART_WIDGET payload for the chart-* scenarios. The
 * `chart_data` field is the JSON-stringified row data — mirrors the
 * real BAML contract shape ChartUI declares. The ChartWidget's
 * shape-detector normalizes both single-dim (1 categorical + 1
 * numeric) and multi-dim (≥2 categorical + 1 numeric) rows.
 */
function buildChartPayload(scenario: "chart-single" | "chart-multi"): DashboardUI {
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

  // Multi-dim: customer breakdown by region AND plan. The exact shape
  // that exposed the `[[multi-dim-chart-normalizer-gap]]` — under the
  // old hardcoded `dataKey="name"`, this would have collapsed to 8
  // bars labeled with region duplicates (APAC, EU-North, EU-North,
  // EU-South, US-East, US-East, US-West, US-West). The shape-
  // detector + pivot in ChartWidget now produces grouped bars: one
  // x-axis tick per unique region, one bar per plan value within
  // each region, distinct colors with a legend.
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
        : scenario === "chart-single" || scenario === "chart-multi"
        ? buildChartPayload(scenario)
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
