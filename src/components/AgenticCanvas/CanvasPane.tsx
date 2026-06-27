import { useMemo } from 'react';
import { useCanvasStore, useCurrentArtifact } from '../../store/useCanvasStore';
import { SemanticInterpreter } from '../registry/SemanticInterpreter';
import { useMeshConfig, DynamicIcon } from '@/lib/meshPersonaConfig';
import { Layers } from 'lucide-react';

/**
 * CanvasPane — view OVER the artifact collection per ADR-0023.
 *
 * Reads the foregrounded artifact via `useCurrentArtifact` and renders
 * its `rendered_output.components`. The render component contract
 * (SemanticInterpreter consuming a components array) is unchanged from
 * the pre-collection shape; only the source-of-truth path changes
 * (previously: useCanvasStore.activeComponents single slot;
 * now: the current artifact's rendered_output.components).
 *
 * Pending artifacts render the "awaiting" state — that's the
 * create-pending half of the responsiveness flow (acceptance #2) made
 * visible. Once `useInterviewAgent` calls `updateArtifact(id, {
 * status: "complete", rendered_output: { components } })`, the canvas
 * lights up.
 *
 * Prior artifacts in the collection are NOT shown by this component
 * today — Phase 1 keeps a "current artifact foregrounded" shape so
 * the canvas-as-collection is structurally correct without committing
 * to a specific UI metaphor (tabs / projects / free-spatial — deferred
 * per ADR-0023 §"What stays deferred"). The collection IS there in
 * the store; surfacing prior artifacts is a Phase 2/UI-cleanup arc
 * decision.
 */
export const CanvasPane = () => {
  const { personaConfig } = useMeshConfig();
  const artifact = useCurrentArtifact();
  const activeTab = useCanvasStore((s) => s.activeTab);
  const setActiveTab = useCanvasStore((s) => s.setActiveTab);

  // The components for the current artifact (empty until status=complete
  // and rendered_output is populated).
  const components = useMemo<any[]>(() => {
    return (artifact?.rendered_output?.components as any[] | undefined) ?? [];
  }, [artifact]);

  // 1. Extract unique personas from the current artifact's components.
  const uniquePersonas = useMemo(() => {
    const personas = new Set<string>();
    components.forEach((comp: any) => {
      if (comp?.source_persona) personas.add(comp.source_persona);
    });
    return Array.from(personas);
  }, [components]);

  // 2. Filter components based on active tab.
  const filteredComponents = useMemo(() => {
    if (activeTab === "ALL") return components;
    return components.filter((comp: any) => comp?.source_persona === activeTab);
  }, [components, activeTab]);

  // Empty state: no current artifact, OR current artifact is pending
  // and has no components yet. Both are honestly "nothing to render."
  if (!artifact || components.length === 0) {
    return (
      <div className="h-full w-full flex items-center justify-center bg-slate-950/50 border-l border-white/10">
        <p className="font-mono text-slate-600 text-xs tracking-widest uppercase">
          {artifact?.status === "pending"
            ? "Working on it…"
            : "Awaiting Mesh Artifacts..."}
        </p>
      </div>
    );
  }

  return (
    <div className="h-full w-full bg-slate-900 border-l border-white/10 flex flex-col">
      {/* Tab Navigation */}
      {uniquePersonas.length > 0 && (
        <div className="w-full flex items-center px-6 pt-4 pb-2 border-b border-white/5 gap-2 overflow-x-auto hide-scrollbar shrink-0">
          {/* ALL Tab */}
          <button
            onClick={() => setActiveTab("ALL")}
            className={`flex items-center gap-2 px-4 py-2 rounded-t-lg border-b-2 transition-all font-mono text-[10px] tracking-wider uppercase font-bold
              ${activeTab === "ALL"
                ? "border-neon-blue text-neon-blue bg-neon-blue/10"
                : "border-transparent text-slate-500 hover:text-slate-300 hover:bg-white/5"}`}
          >
            <Layers className="w-4 h-4" />
            Full Dashboard
          </button>

          {/* Persona Tabs */}
          {uniquePersonas.map(personaKey => {
            const config = personaConfig[personaKey];
            if (!config) return null;
            const isActive = activeTab === personaKey;

            return (
              <button
                key={personaKey}
                onClick={() => setActiveTab(personaKey)}
                className={`flex items-center gap-2 px-4 py-2 rounded-t-lg border-b-2 transition-all font-mono text-[10px] tracking-wider uppercase font-bold
                  ${isActive
                    ? `border-current ${config.color} ${config.bg}`
                    : "border-transparent text-slate-500 hover:text-slate-300 hover:bg-white/5"}`}
              >
                <DynamicIcon name={config.icon} className="w-4 h-4" />
                {config.label}
              </button>
            );
          })}
        </div>
      )}

      {/* Content Area */}
      <div className="flex-1 overflow-y-auto custom-scrollbar p-6">
        {/* We pass the filtered payload. SemanticInterpreter handles the grid, col-spans, and RadarReveal internally. */}
        <SemanticInterpreter payload={{ components: filteredComponents }} />
      </div>
    </div>
  );
};
