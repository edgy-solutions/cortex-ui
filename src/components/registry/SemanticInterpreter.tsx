import React from "react";
import { AlertCircle, FileText, Share2, Database } from "lucide-react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";

// Lazy-loaded or imported directly for interpretation
import { WorkflowCanvas } from "../Blueprint/WorkflowCanvas";
import { WarningCard } from "../NeuralStream/WarningCard";
import { RadarReveal } from "../NeuralStream/RadarReveal";
import { useMeshConfig, DynamicIcon } from "../NeuralStream/AgentTeamLoader";
import { ChartWidget } from "../mesh/ChartWidget";
import { publishToSuperset } from "@/api/client";
import { toast } from "sonner";

// Mock/Placeholder components for missing types
const SupplyTable = ({ data }: { data: any[] }) => {
  if (!data || !Array.isArray(data)) return null;
  return (
    <div className="glass-panel overflow-hidden border-cyan-500/10">
      <div className="flex items-center justify-between px-4 py-3 bg-cyan-500/5 border-b border-white/5">
        <div className="flex items-center gap-2">
          <Database className="w-4 h-4 text-cyan-400" />
          <span className="font-mono text-[10px] text-cyan-400/80 font-bold tracking-widest uppercase">Asset_State_Registry</span>
        </div>
        <div className="flex gap-1">
          <div className="w-1.5 h-1.5 rounded-full bg-cyan-500/30 animate-pulse" />
          <div className="w-1.5 h-1.5 rounded-full bg-cyan-500/20" />
        </div>
      </div>
      <div className="p-0">
        <table className="w-full text-left font-mono text-[11px] border-collapse">
          <thead>
            <tr className="text-slate-500 bg-slate-900/40">
              <th className="px-4 py-2 border-b border-white/5 font-medium tracking-tighter">DATASET_IDENTIFIER</th>
              <th className="px-4 py-2 border-b border-white/5 font-medium tracking-tighter">TYPE_TAG</th>
              <th className="px-4 py-2 border-b border-white/5 font-medium tracking-tighter text-right">METADATA_EXTRACT</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {data.map((row, i) => (
              <tr key={i} className="group hover:bg-cyan-500/5 transition-colors">
                <td className="px-4 py-3 text-slate-200">
                  <span className="px-1.5 py-0.5 rounded bg-slate-800 text-[9px] mr-2 border border-white/10 uppercase">{row.id?.slice(0, 4) || "DSET"}</span>
                  {row.name || row.id}
                </td>
                <td className="px-4 py-3">
                  <span className="text-slate-500 italic lowercase">{row.type || "unknown"}</span>
                </td>
                <td className="px-4 py-3 text-right">
                  <span className="text-cyan-400 group-hover:text-cyan-300 transition-colors uppercase text-[9px] font-bold tracking-tight">
                    {row.description || "NO_DESCRIPTION_PROVIDED"}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

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
const renderComponent = (comp: any, onPublish: (sql: string, title: string) => void) => {
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

    case "CHART_WIDGET":
      return (
        <ChartWidget
          data={comp.data_payload}
          type={comp.chart_type}
          subject={comp.subject_concept}
          sql={comp.sql_query}
          onPublish={onPublish}
        />
      );

    default:
      return (
        <div className="p-4 glass-panel border-amber-500/30 flex flex-col gap-3">
          <div className="flex items-start gap-3 border-b border-amber-500/20 pb-3">
            <AlertCircle className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" />
            <div className="space-y-1">
              <p className="font-mono text-xs text-amber-500 font-bold">UI COMPONENT NOT FOUND: {comp.archetype}</p>
              <p className="font-mono text-[10px] text-slate-400">
                The mesh returned a new UI widget type. Raw data payload is displayed below:
              </p>
            </div>
          </div>
          <div className="bg-black/50 p-3 rounded text-[10px] font-mono text-slate-300 overflow-x-auto max-h-60 overflow-y-auto">
            <pre>{JSON.stringify(comp, null, 2)}</pre>
          </div>
        </div>
      );
  }
};

// Graphs and documents span full width; cards flow inline in a 2-col grid
const isFullWidth = (archetype: string) =>
  archetype === "PROCESS_TOPOLOGY" || archetype === "KNOWLEDGE_DOCUMENT" || archetype === "CHART_WIDGET";

export const SemanticInterpreter: React.FC<SemanticInterpreterProps> = ({ payload }) => {
  const { personaConfig } = useMeshConfig();

  const handlePublish = async (sql: string, title: string) => {
    const toastId = toast.loading("Publishing to Superset...");
    try {
      const result = await publishToSuperset(sql, title);
      toast.success("Chart Published!", {
        id: toastId,
        description: `View at: ${result.summary}`,
        duration: 5000,
      });
    } catch (err) {
      console.error("Failed to publish chart:", err);
      toast.error("Publication failed", {
        id: toastId,
        description: "The Analyst Service is currently unreachable.",
      });
    }
  };

  if (!payload || !payload.components || !Array.isArray(payload.components)) {
    return null;
  }

  return (
    <div className="w-full grid grid-cols-1 md:grid-cols-2 gap-4">
      {payload.components.map((comp, index) => {
        const persona = comp.source_persona;
        const pCfg = persona ? personaConfig[persona] : null;

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
                  <DynamicIcon name={pCfg.icon} className="w-3 h-3" />
                  {pCfg.label}
                </div>
              )}
              {renderComponent(comp, handlePublish)}
            </RadarReveal>
          </div>
        );
      })}
    </div>
  );
};
