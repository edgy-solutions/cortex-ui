import React from "react";
import { AlertCircle, FileText, Share2, Activity } from "lucide-react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";

// Lazy-loaded or imported directly for interpretation
import { WorkflowCanvas } from "../Blueprint/WorkflowCanvas";
import { WarningCard } from "../NeuralStream/WarningCard";
import { RadarReveal } from "../NeuralStream/RadarReveal";
import { PersonaConfig } from "../NeuralStream/AgentTeamLoader";

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
          <th className="pb-2">TYPE</th>
          <th className="pb-2 text-right">DETAIL</th>
        </tr>
      </thead>
      <tbody>
        {data.map((row, i) => (
          <tr key={i} className="text-slate-300 border-t border-white/5">
            <td className="py-2">{row.name || row.id}</td>
            <td className="py-2 text-slate-500">{row.type || "—"}</td>
            <td className="py-2 text-right text-neon-blue">{row.description || "—"}</td>
          </tr>
        ))}
      </tbody>
    </table>
  </div>
);

const MarkdownRenderer = ({ content }: { content: string }) => (
  <div className="prose prose-invert prose-slate max-w-none font-sans text-sm leading-relaxed text-slate-300 prose-table:font-mono prose-table:text-[11px] prose-th:text-slate-400 prose-th:border-b prose-th:border-white/10 prose-th:pb-2 prose-td:py-1.5 prose-td:border-t prose-td:border-white/5 prose-td:text-slate-300">
    <div className="flex items-center gap-2 mb-4">
      <FileText className="w-4 h-4 text-neon-purple" />
      <span className="font-mono text-[10px] text-slate-500 tracking-widest uppercase">Knowledge_Doc</span>
    </div>
    <Markdown remarkPlugins={[remarkGfm]}>{content}</Markdown>
  </div>
);

// Re-export the canonical type from api/types
export type { SemanticUIContainer } from "@/api/types";

interface SemanticInterpreterProps {
  payload: { components: any[] }; // DashboardUI shape
}

// Render a single semantic component by archetype
const renderComponent = (comp: any) => {
  switch (comp.archetype) {
    case "PROCESS_TOPOLOGY": {
      // Map semantic nodes to custom glassmorphism node types.
      // First node = trigger (green circle), rest = action (purple rectangle).
      const visualNodes = comp.nodes.map((node: any, index: number) => ({
        id: node.id,
        position: { x: 250, y: index * 160 + 50 },
        data: {
          label: node.name || node.id,
          subtitle: node.type || node.description || undefined,
          delay: index * 0.15,
        },
        type: index === 0 ? 'trigger' : 'action',
      }));

      const visualEdges = comp.edges.map((edge: any, index: number) => ({
        id: `e-${edge.source}-${edge.target}-${index}`,
        source: edge.source,
        target: edge.target,
        label: edge.relation || edge.predicate || "",
        type: 'animated',
      }));

      return (
        <div className="w-full h-[600px] relative rounded-xl overflow-hidden border border-white/5 bg-slate-950/50">
          <div className="absolute top-4 left-4 z-10 flex items-center gap-2 px-3 py-1.5 glass-panel-sm border-neon-green/30">
            <Share2 className="w-3 h-3 text-neon-green" />
            <span className="font-mono text-[9px] text-neon-green uppercase tracking-tighter">
              {comp.subject_concept}
            </span>
          </div>
          <WorkflowCanvas nodes={visualNodes} edges={visualEdges} hideHeader />
        </div>
      );
    }

    case "HAZARD_DECLARATION":
      return (
        <WarningCard
          error={comp.subject_concept}
          hazards={comp.hazards}
          isCritical={comp.severity === "CRITICAL"}
        />
      );

    case "ASSET_STATE_METRIC":
      return <SupplyTable data={comp.metrics} />;

    case "KNOWLEDGE_DOCUMENT":
      return <MarkdownRenderer content={comp.markdown_content} />;

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

// Graphs and documents span full width; cards flow inline in a 2-col grid
const isFullWidth = (archetype: string) =>
  archetype === "PROCESS_TOPOLOGY" || archetype === "KNOWLEDGE_DOCUMENT";

export const SemanticInterpreter: React.FC<SemanticInterpreterProps> = ({ payload }) => {
  if (!payload || !payload.components || !Array.isArray(payload.components)) {
    return null;
  }

  return (
    <div className="w-full grid grid-cols-1 md:grid-cols-2 gap-4">
      {payload.components.map((comp, index) => {
        const persona = comp.source_persona as keyof typeof PersonaConfig | undefined;
        const pCfg = persona ? PersonaConfig[persona] : null;

        // Use a stable key based on the component data if possible, else fallback to index + archetype
        const stableKey = `${comp.archetype}-${comp.subject_concept}-${index}`;

        return (
          <div
            key={stableKey}
            className={isFullWidth(comp.archetype) ? "col-span-full" : "col-span-1"}
          >
            <RadarReveal delayMs={index * 400}>
              {/* Persona attribution badge */}
              {pCfg && (
                <div className={`inline-flex items-center gap-1.5 px-2.5 py-1 mb-2 rounded-md border text-[10px] font-mono font-bold uppercase tracking-wider ${pCfg.bg} ${pCfg.color}`}>
                  {pCfg.icon}
                  {pCfg.label}
                </div>
              )}
              {renderComponent(comp)}
            </RadarReveal>
          </div>
        );
      })}
    </div>
  );
};
