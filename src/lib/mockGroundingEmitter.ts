import type { StreamEvent, RouteDecision, Source, GraphTraceNode } from "@/api/types";

/**
 * Mock grounding-event emitter.
 *
 * Synthesizes a realistic sequence of the new Phase 0+ typed events
 * (`pipeline_stage`, `route_decision`, `sources`, `graph_trace`) so the
 * grounding panel can be exercised end-to-end during development WITHOUT
 * changes to the gateway or engines. This keeps tonight's facelift
 * fully client-side per architect's caution.
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
  };
}

const TIMINGS = {
  // ms after submit — when each stage completes / event fires
  understanding_complete: 600,
  locating_start: 200,
  locating_complete: 1300,
  choosing_action_start: 1000,
  choosing_action_complete: 2400,
  retrieving_start: 1900,
  retrieving_complete: 4200,
  composing_start: 3500,
  composing_complete: 5400,
  route_decision: 2500, // after subject+action are known
  sources: 4400, // after retrieval
  graph_trace: 2700,
};

export interface MockHandle {
  cancel: () => void;
}

/**
 * Fire a sequence of typed grounding events that mimics a real query
 * flowing through the routing substrate. The events are deliberately
 * spaced so the panel animates rather than snapping.
 */
export function runMockGroundingFor(
  query: string,
  emit: (e: StreamEvent) => void
): MockHandle {
  const timers: number[] = [];
  const seq = buildMockSequenceForQuery(query);
  const schedule = (ms: number, fn: () => void) => {
    timers.push(window.setTimeout(fn, ms));
  };

  // Stage progression
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
  schedule(TIMINGS.retrieving_complete, () =>
    emit({ type: "pipeline_stage", kind: "retrieving", status: "completed" })
  );
  schedule(TIMINGS.composing_start, () =>
    emit({ type: "pipeline_stage", kind: "composing", status: "started" })
  );
  schedule(TIMINGS.composing_complete, () =>
    emit({ type: "pipeline_stage", kind: "composing", status: "completed" })
  );

  // Right-HUD payloads
  schedule(TIMINGS.route_decision, () =>
    emit({ type: "route_decision", decision: seq.decision })
  );
  schedule(TIMINGS.graph_trace, () =>
    emit({ type: "graph_trace", nodes: seq.graphTrace })
  );
  schedule(TIMINGS.sources, () =>
    emit({ type: "sources", sources: seq.sources })
  );

  return {
    cancel: () => {
      timers.forEach((t) => window.clearTimeout(t));
    },
  };
}
