/**
 * ProcessTopologyCard's own contract (PROCESS_TOPOLOGY).
 *
 * RETIRES A STALE ADVERTISEMENT. The hand-authored registry published
 * `component: "WorkflowCanvas"` for this archetype — a component replaced on 2026-06-26
 * when SemanticInterpreter switched to ProcessTopologyCard. The field is diagnostic so
 * nothing broke, but the capability list advertised a renderer that had not drawn this
 * archetype in two months. Deriving the contract from the component fixes it structurally:
 * the name now comes FROM the component rather than from a list someone maintained.
 */

export const TOPOLOGY_ROW_REQUIREMENTS = {
  /** `nodes` and `edges` both default to [] at the call site, so an empty graph renders. */
  minNodes: 0,
  minEdges: 0,
} as const;

/** Empty: the card draws whatever graph it is given, including an empty one. */
export const TOPOLOGY_REFUSAL_REASONS = [] as const;

export const PROCESS_TOPOLOGY_CONTRACT = {
  archetype: "PROCESS_TOPOLOGY",
  component: "ProcessTopologyCard",
  layout: "full-width",
  fields: {
    /** ProcessNode[]: `id` REQUIRED; name/type/description optional. */
    nodes: { encoding: "array", required: false, elementRequiredKeys: ["id"] },
    /** ProcessEdge[]: `source` and `target` REQUIRED; relation/predicate optional. */
    edges: { encoding: "array", required: false, elementRequiredKeys: ["source", "target"] },
    subject_concept: { encoding: "string", required: false },
  },
  rowRequirements: TOPOLOGY_ROW_REQUIREMENTS,
  refusalReasons: TOPOLOGY_REFUSAL_REASONS,
} as const;
