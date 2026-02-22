import { useMemo, useRef } from "react";
import type { Node, Edge } from "@xyflow/react";
import { useInterviewStore } from "@/store/useInterviewStore";

/**
 * Maps the live BPMN graph from the Zustand store into React Flow
 * nodes and edges. Falls back to null when no graph is available.
 *
 * Node type mapping (BAML → React Flow):
 *   ServiceTask / UserTask  → "action"
 *   ExclusiveGateway        → "logic"
 *   TimerEvent              → "trigger"
 *
 * Uses a simple left-to-right column layout with staggered animation delays.
 */

const COL_SPACING = 320;
const ROW_SPACING = 180;
const STEP_DELAY = 0.25;

/** Map BPMN node_type to our React Flow custom node type */
function mapNodeType(bpmnType: string): string {
    switch (bpmnType) {
        case "service_task":
        case "ServiceTask":
        case "user_task":
        case "UserTask":
            return "action";
        case "exclusive":
        case "ExclusiveGateway":
            return "logic";
        case "timer_event":
        case "TimerEvent":
            return "trigger";
        default:
            return "action";
    }
}

/** Derive a subtitle from the BPMN task type */
function mapSubtitle(bpmnType: string): string {
    switch (bpmnType) {
        case "service_task":
        case "ServiceTask":
            return "Service Task";
        case "user_task":
        case "UserTask":
            return "User Task";
        case "exclusive":
        case "ExclusiveGateway":
            return "Gateway";
        case "timer_event":
        case "TimerEvent":
            return "Timer";
        default:
            return bpmnType;
    }
}

export function useLiveBpmnGraph(): { nodes: Node[]; edges: Edge[] } | null {
    const liveBpmnGraph = useInterviewStore((s) => s.liveBpmnGraph);
    const prevNodeCount = useRef(0);

    return useMemo(() => {
        if (!liveBpmnGraph) return null;

        const { tasks = [], gateways = [], sequence_flows = [] } = liveBpmnGraph;

        // Collect all BPMN elements for layout
        const allElements = [
            ...tasks.map((t) => ({
                id: t.id,
                name: t.name,
                bpmnType: t.type,
                ontologyClass: t.ontology_class,
                dataSource: t.data_source,
            })),
            ...gateways.map((g) => ({
                id: g.id,
                name: g.name,
                bpmnType: g.type,
                ontologyClass: undefined as string | undefined,
                dataSource: undefined as string | undefined,
            })),
        ];

        if (allElements.length === 0) return null;

        // Group elements by type for column layout
        const triggers = allElements.filter(
            (e) => e.bpmnType === "timer_event"
        );
        const gatewayCols = allElements.filter(
            (e) => e.bpmnType === "exclusive"
        );
        const actions = allElements.filter(
            (e) =>
                e.bpmnType !== "timer_event" &&
                e.bpmnType !== "exclusive"
        );

        // Build columns: triggers → gateways → actions
        const columns = [triggers, gatewayCols, actions].filter(
            (col) => col.length > 0
        );

        // Track which nodes are new for stagger animation
        const currentCount = allElements.length;
        const newNodesStart = prevNodeCount.current;
        prevNodeCount.current = currentCount;

        const nodes: Node[] = [];
        let globalIdx = 0;

        columns.forEach((col, colIdx) => {
            const startY = -((col.length - 1) * ROW_SPACING) / 2;
            col.forEach((elem, rowIdx) => {
                const isNew = globalIdx >= newNodesStart;
                nodes.push({
                    id: elem.id,
                    type: mapNodeType(elem.bpmnType),
                    position: { x: colIdx * COL_SPACING, y: startY + rowIdx * ROW_SPACING },
                    data: {
                        label: elem.name,
                        subtitle: mapSubtitle(elem.bpmnType),
                        delay: isNew ? (globalIdx - newNodesStart) * STEP_DELAY : 0,
                        // Semantic grounding (for action node tooltip)
                        ontologyClass: elem.ontologyClass,
                        dataSource: elem.dataSource,
                    },
                });
                globalIdx++;
            });
        });

        // Map sequence flows to edges
        const edges: Edge[] = sequence_flows.map((sf) => ({
            id: sf.id || `e-${sf.source_ref}-${sf.target_ref}`,
            source: sf.source_ref,
            target: sf.target_ref,
            type: "animated",
            label: sf.condition_expression || undefined,
        }));

        return { nodes, edges };
    }, [liveBpmnGraph]);
}
