import React from "react";
import { AlertCircle, FileText, Share2, Activity } from "lucide-react";

// Lazy-loaded or imported directly for interpretation
import { WorkflowCanvas } from "../Blueprint/WorkflowCanvas";
import { WarningCard } from "../NeuralStream/WarningCard";

// Mock/Placeholder components for missing types
const SupplyTable = ({ data }: { data: any[] }) => (
  <div className="glass-panel p-4 border-neon-blue/20">
    <div className="flex items-center gap-2 mb-3 border-b border-white/10 pb-2">
      <Activity className="w-4 h-4 text-neon-blue" />
      <span className="font-mono text-[10px] text-slate-400 tracking-wider">ASSET_STATE_METRICS</span>
    </div>
    <table className="w-full text-left font-mono text-[11px]">
      <thead>
        <tr className="text-slate-500">
          <th className="pb-2">ENTITY</th>
          <th className="pb-2">METRIC</th>
          <th className="pb-2 text-right">VALUE</th>
        </tr>
      </thead>
      <tbody>
        {data.map((row, i) => (
          <tr key={i} className="text-slate-300 border-t border-white/5">
            <td className="py-2">{row.entity || row.name}</td>
            <td className="py-2 text-slate-500">{row.metric || "STATE"}</td>
            <td className="py-2 text-right text-neon-blue">{row.value || "OK"}</td>
          </tr>
        ))}
      </tbody>
    </table>
  </div>
);

const MarkdownRenderer = ({ content }: { content: string }) => (
  <div className="prose prose-invert prose-slate max-w-none font-sans text-sm leading-relaxed text-slate-300">
    <div className="flex items-center gap-2 mb-4">
      <FileText className="w-4 h-4 text-neon-purple" />
      <span className="font-mono text-[10px] text-slate-500 tracking-widest uppercase">Knowledge_Doc</span>
    </div>
    {content}
  </div>
);

// 1. Define the strictly typed union matching BAML
type TopologyUI = { archetype: "PROCESS_TOPOLOGY"; subject_concept: string; nodes: any[]; edges: any[] };
type HazardUI = { archetype: "HAZARD_DECLARATION"; subject_concept: string; severity: string; hazards: any[] };
type MetricUI = { archetype: "ASSET_STATE_METRIC"; subject_concept: string; metrics: any[] };
type DocumentUI = { archetype: "KNOWLEDGE_DOCUMENT"; subject_concept: string; markdown_content: string };

export type SemanticUIContainer = TopologyUI | HazardUI | MetricUI | DocumentUI;

interface SemanticInterpreterProps {
  payload: SemanticUIContainer;
}

export const SemanticInterpreter: React.FC<SemanticInterpreterProps> = ({ payload }) => {
  // 2. No more try/catch parsing block needed! BAML guarantees structure.
  switch (payload.archetype) {
    case "PROCESS_TOPOLOGY": {
      // 1. Map abstract semantic nodes into visual UI nodes (Auto-layout vertically)
      const visualNodes = payload.nodes.map((node: any, index: number) => ({
        id: node.id,
        position: { x: 250, y: index * 120 + 50 }, // Vertical spacing
        data: { 
          label: (
            <div className="flex flex-col text-center">
              <span className="font-bold text-xs text-neon-blue">{node.name || node.id}</span>
              {node.type && <span className="text-[9px] text-slate-400 mt-1">{node.type}</span>}
            </div>
          ) 
        },
        type: 'default' 
      }));

      // 2. Map abstract semantic edges into visual UI edges
      const visualEdges = payload.edges.map((edge: any, index: number) => ({
        id: `e-${edge.source}-${edge.target}-${index}`,
        source: edge.source,
        target: edge.target,
        label: edge.relation || edge.predicate || "",
        animated: true, 
        style: { stroke: '#00f0ff' }
      }));

      return (
        <div className="w-full h-[500px] relative rounded-xl overflow-hidden border border-white/5 bg-slate-950/50">
           <div className="absolute top-4 left-4 z-10 flex items-center gap-2 px-3 py-1.5 glass-panel-sm border-neon-green/30">
              <Share2 className="w-3 h-3 text-neon-green" />
              <span className="font-mono text-[9px] text-neon-green uppercase tracking-tighter">
                {payload.subject_concept}
              </span>
           </div>
           
           {/* Pass the newly mapped visual arrays to the canvas */}
           <WorkflowCanvas nodes={visualNodes} edges={visualEdges} />
        </div>
      );
    }

    case "HAZARD_DECLARATION": {
      return (
        <WarningCard 
          error={payload.subject_concept}
          hazards={payload.hazards}
          isCritical={payload.severity === "CRITICAL"}
        />
      );
    }

    case "ASSET_STATE_METRIC": {
      return <SupplyTable data={payload.metrics} />;
    }

    case "KNOWLEDGE_DOCUMENT": {
      return <MarkdownRenderer content={payload.markdown_content} />;
    }

    default:
      return (
        <div className="p-4 glass-panel border-red-500/30 flex items-start gap-3">
          <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />
          <div className="space-y-1">
            <p className="font-mono text-xs text-red-500 font-bold">UNKNOWN_ARCHETYPE</p>
            <p className="font-mono text-[10px] text-slate-500">
              The mesh returned an unrecognized UI component.
            </p>
          </div>
        </div>
      );
  }
};
