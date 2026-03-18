import React from "react";
import type { SemanticUIContainer } from "@/api/types";
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

interface SemanticInterpreterProps {
  payload: SemanticUIContainer;
}

export const SemanticInterpreter: React.FC<SemanticInterpreterProps> = ({ payload }) => {
  try {
    switch (payload.archetype) {
      case "PROCESS_TOPOLOGY": {
        // Expected format: entities = nodes array, relationships = edges array
        const nodes = JSON.parse(payload.entities);
        const edges = payload.relationships ? JSON.parse(payload.relationships) : [];
        
        // TODO: Pass actual nodes/edges to WorkflowCanvas or sync to store
        console.debug("SemanticInterpreter: PROCESS_TOPOLOGY", { nodes, edges });
        
        return (
          <div className="w-full h-[500px] relative rounded-xl overflow-hidden border border-white/5 bg-slate-950/50">
             <div className="absolute top-4 left-4 z-10 flex items-center gap-2 px-3 py-1.5 glass-panel-sm border-neon-green/30">
                <Share2 className="w-3 h-3 text-neon-green" />
                <span className="font-mono text-[9px] text-neon-green uppercase tracking-tighter">
                  {payload.subject_concept}
                </span>
             </div>
             {/* Orchestrated BPMN Rendering */}
             <WorkflowCanvas nodes={nodes} edges={edges} />
          </div>
        );
      }

      case "HAZARD_DECLARATION": {
        const hazards = JSON.parse(payload.entities);
        return (
          <WarningCard 
            error={payload.subject_concept}
            hazards={hazards}
            isCritical={payload.severity === "CRITICAL"}
          />
        );
      }

      case "ASSET_STATE_METRIC": {
        const metrics = JSON.parse(payload.entities);
        return <SupplyTable data={metrics} />;
      }

      case "KNOWLEDGE_DOCUMENT": {
        return <MarkdownRenderer content={payload.entities} />;
      }

      default:
        return (
          <div className="p-4 glass-panel border-amber-500/20 text-amber-500 font-mono text-xs italic">
            UNKNOWN_ARCHETYPE: {payload.archetype}
          </div>
        );
    }
  } catch (error) {
    console.error("SemanticInterpreter Parsing Error:", error);
    return (
      <div className="p-4 glass-panel border-red-500/30 flex items-start gap-3">
        <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />
        <div className="space-y-1">
          <p className="font-mono text-xs text-red-500 font-bold">INTERPRETER_PAYLOAD_CORRUPT</p>
          <p className="font-mono text-[10px] text-slate-500">
            Fatal error during semantic decoding. The agent telemetry may be malformed.
          </p>
        </div>
      </div>
    );
  }
};
