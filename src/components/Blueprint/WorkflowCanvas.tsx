import { useMemo } from "react";
import {
  ReactFlow,
  Background,
  BackgroundVariant,
  Controls,
  type NodeTypes,
  type EdgeTypes,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { motion } from "framer-motion";
import { GitBranch } from "lucide-react";

import { TriggerNode } from "./nodes/TriggerNode";
import { LogicNode } from "./nodes/LogicNode";
import { ActionNode } from "./nodes/ActionNode";
import { AnimatedEdge } from "./edges/AnimatedEdge";
import { useMockWorkflowBuilder } from "@/hooks/useMockWorkflowBuilder";

// Register custom types (stable references)
const nodeTypes: NodeTypes = {
  trigger: TriggerNode as unknown as NodeTypes["trigger"],
  logic: LogicNode as unknown as NodeTypes["logic"],
  action: ActionNode as unknown as NodeTypes["action"],
};

const edgeTypes: EdgeTypes = {
  animated: AnimatedEdge as unknown as EdgeTypes["animated"],
};

export function WorkflowCanvas() {
  const { nodes, edges } = useMockWorkflowBuilder();

  // Default viewport centers the graph
  const defaultViewport = useMemo(
    () => ({ x: 200, y: 350, zoom: 0.85 }),
    []
  );

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.6 }}
      className="h-full w-full relative"
    >
      {/* Header badge */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3, duration: 0.4 }}
        className="absolute top-4 left-4 z-10 flex items-center gap-2"
      >
        <GitBranch className="w-4 h-4 text-neon-blue" />
        <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-neon-blue/70">
          Holographic Blueprint
        </span>
      </motion.div>

      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        defaultViewport={defaultViewport}
        nodesDraggable={true}
        nodesConnectable={false}
        elementsSelectable={false}
        panOnScroll
        zoomOnScroll
        fitView={false}
        proOptions={{ hideAttribution: true }}
      >
        <Background
          variant={BackgroundVariant.Dots}
          gap={20}
          size={1}
          color="rgba(0, 212, 255, 0.06)"
        />
        <Controls
          className="!bg-glass-bg !border-glass-border !rounded-lg [&_button]:!bg-surface-panel [&_button]:!border-glass-border [&_button]:!text-slate-400 [&_button:hover]:!bg-neon-blue/10 [&_button:hover]:!text-neon-blue"
          showInteractive={false}
        />
      </ReactFlow>
    </motion.div>
  );
}
