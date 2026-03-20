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
        
        // Ensure liveBpmnGraph is an object before using 'in' operator
        

        // ── UNIFIED ELEMENT EXTRACTION ──
        // Support both legacy BPMN updates (tasks/gateways) and new Archetype payloads (nodes/edges)
        const rawTasks = (liveBpmnGraph as any).tasks || (liveBpmnGraph as any).nodes || [];
        const rawGateways = (liveBpmnGraph as any).gateways || [];
        const rawFlows = (liveBpmnGraph as any).sequence_flows || (liveBpmnGraph as any).edges || [];

        const allElements = [
            ...rawTasks.map((t: any) => ({
                id: t.id,
                name: t.name || t.label || t.id,
                bpmnType: t.type || (t.archetype === 'HAZARD_DECLARATION' ? 'exclusive' : 'service_task'),
                ontologyClass: t.ontology_class || t.subject_concept,
                dataSource: t.data_source,
            })),
            ...rawGateways.map((g: any) => ({
                id: g.id,
                name: g.name || g.id,
                bpmnType: g.type || 'exclusive',
            })),
        ];

        if (allElements.length === 0) return null;

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

        // Map sequence flows/edges to React Flow edges
        const edges: Edge[] = rawFlows.map((sf: any) => ({
            id: sf.id || `e-${sf.source_ref || sf.source}-${sf.target_ref || sf.target}`,
            source: sf.source_ref || sf.source,
            target: sf.target_ref || sf.target,
            type: "animated",
            label: sf.condition_expression || sf.relation || sf.predicate || undefined,
        }));

        return { nodes, edges };
    }, [liveBpmnGraph]);
}
