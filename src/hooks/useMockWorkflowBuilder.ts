import { useMemo } from "react";
import type { Node, Edge } from "@xyflow/react";
import { useInterviewStore } from "@/store/useInterviewStore";

/**
 * Delay between sequential node appearances (seconds).
 * Edges inherit the delay of their target node.
 */
const STEP_DELAY = 0.5;

/**
 * Takes the accumulated interview context (ontology terms + data bindings)
 * and constructs a React Flow graph representing the generated workflow.
 */
export function useMockWorkflowBuilder() {
  const ontologyTerms = useInterviewStore((s) => s.ontologyTerms);
  const dataBindings = useInterviewStore((s) => s.dataBindings);

  return useMemo(() => {
    const nodes: Node[] = [];
    const edges: Edge[] = [];
    let step = 0;

    // ── Row 1: Trigger nodes (one per data binding) ──────
    const triggerIds: string[] = [];
    const triggerSpacing = 180;
    const triggerStartY =
      -(((dataBindings.length || 1) - 1) * triggerSpacing) / 2;

    if (dataBindings.length === 0) {
      // Fallback single trigger
      const id = "trigger-default";
      triggerIds.push(id);
      nodes.push({
        id,
        type: "trigger",
        position: { x: 0, y: 0 },
        data: {
          label: "dbt Update",
          subtitle: "webhook",
          delay: step * STEP_DELAY,
        },
      });
      step++;
    } else {
      dataBindings.forEach((binding, i) => {
        const id = `trigger-${binding.model}`;
        triggerIds.push(id);
        nodes.push({
          id,
          type: "trigger",
          position: { x: 0, y: triggerStartY + i * triggerSpacing },
          data: {
            label: binding.model,
            subtitle: binding.schema,
            delay: step * STEP_DELAY,
          },
        });
        step++;
      });
    }

    // ── Row 2: Logic nodes (one per ontology concept) ────
    const logicIds: string[] = [];
    const logicX = 320;
    const conceptTerms = ontologyTerms.filter(
      (t) => t.category === "Concept" || t.category === "Process"
    );
    const logicSpacing = 200;
    const logicStartY =
      -(((conceptTerms.length || 1) - 1) * logicSpacing) / 2;

    if (conceptTerms.length === 0) {
      const id = "logic-default";
      logicIds.push(id);
      nodes.push({
        id,
        type: "logic",
        position: { x: logicX, y: 0 },
        data: {
          label: "IF Concept",
          subtitle: "Ontology Check",
          delay: step * STEP_DELAY,
        },
      });
      step++;
    } else {
      conceptTerms.forEach((term, i) => {
        const id = `logic-${term.label}`;
        logicIds.push(id);
        nodes.push({
          id,
          type: "logic",
          position: { x: logicX, y: logicStartY + i * logicSpacing },
          data: {
            label: `IF ${term.label}`,
            subtitle: "DETECTED",
            delay: step * STEP_DELAY,
          },
        });
        step++;
      });
    }

    // ── Row 3: Action nodes ──────────────────────────────
    const actionX = 660;
    const actions = [
      {
        label: "Trigger Audit Agent",
        subtitle: "Restate Service",
      },
      {
        label: "Generate Dagster Asset",
        subtitle: "Pipeline Builder",
      },
      {
        label: "Notify Stakeholders",
        subtitle: "Slack / Email",
      },
    ];
    const actionSpacing = 160;
    const actionStartY = -((actions.length - 1) * actionSpacing) / 2;
    const actionIds: string[] = [];

    actions.forEach((action, i) => {
      const id = `action-${i}`;
      actionIds.push(id);
      nodes.push({
        id,
        type: "action",
        position: { x: actionX, y: actionStartY + i * actionSpacing },
        data: {
          ...action,
          delay: step * STEP_DELAY,
        },
      });
      step++;
    });

    // ── Edges: Trigger → Logic ───────────────────────────
    triggerIds.forEach((tId) => {
      logicIds.forEach((lId) => {
        edges.push({
          id: `e-${tId}-${lId}`,
          source: tId,
          target: lId,
          type: "animated",
        });
      });
    });

    // ── Edges: Logic → Action ────────────────────────────
    logicIds.forEach((lId, li) => {
      // Connect each logic node to the action at its index (or wrap)
      const aId = actionIds[li % actionIds.length];
      edges.push({
        id: `e-${lId}-${aId}`,
        source: lId,
        target: aId,
        type: "animated",
      });
    });

    // Also connect last logic to all remaining actions if fewer logic nodes
    if (logicIds.length < actionIds.length) {
      const lastLogic = logicIds[logicIds.length - 1];
      actionIds.forEach((aId, ai) => {
        if (ai >= logicIds.length) {
          edges.push({
            id: `e-${lastLogic}-${aId}`,
            source: lastLogic,
            target: aId,
            type: "animated",
          });
        }
      });
    }

    return { nodes, edges };
  }, [ontologyTerms, dataBindings]);
}
