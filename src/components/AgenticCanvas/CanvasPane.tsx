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
  const artifactCount = useCanvasStore((s) => s.artifacts.length);
  const currentIndex = useCanvasStore((s) => {
    const id = s.currentArtifactId;
    if (!id) return -1;
    return s.artifacts.findIndex((a) => a.id === id);
  });

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

  // Honest empty/transitional states per ADR-0023 lifecycle:
  // - no current artifact → "Awaiting Mesh Artifacts" (true empty)
  // - artifact pending → "Working on it…" (live, working)
  // - artifact failed → "This attempt failed." (honest — the turn
  //   happened but produced no canvas content; the routing card may
  //   still show what was tried; the failure is the answer, not a
  //   silent looks-like-nothing-happened)
  // - artifact complete with 0 components → "No components produced."
  //   (honest "finalized empty" — distinguishable from pending)
  if (!artifact) {
    return (
      <div className="h-full w-full flex items-center justify-center bg-slate-950/50 border-l border-white/10">
        <p className="font-mono text-slate-600 text-xs tracking-widest uppercase">
          Awaiting Mesh Artifacts...
        </p>
      </div>
    );
  }
  if (components.length === 0) {
    const empty =
      artifact.status === "pending"
        ? { label: "Working on it…", tone: "text-slate-500" }
        : artifact.status === "failed"
        ? { label: "This attempt failed.", tone: "text-rose-400/80" }
        : { label: "No components produced.", tone: "text-amber-400/80" };
    return (
      <div className="h-full w-full flex flex-col items-center justify-center bg-slate-950/50 border-l border-white/10 gap-2">
        <p className={`font-mono text-xs tracking-widest uppercase ${empty.tone}`}>
          {empty.label}
        </p>
        {artifactCount > 1 && (
          <p className="font-mono text-[10px] text-slate-600 tracking-wider">
            Artifact {currentIndex + 1} of {artifactCount}
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="h-full w-full bg-slate-900 border-l border-white/10 flex flex-col">
      {/* Artifact-count badge — verifies state 4 (multiple-in-collection)
          by looking. NO recall metaphor commitment here (tabs / spatial
          / drawer are deferred per ADR-0023); just an honest count so
          the collection growing is visible. */}
      {artifactCount > 1 && (
        <div className="w-full flex items-center justify-end px-6 pt-3 pb-1 shrink-0">
          <span className="font-mono text-[9px] text-slate-500 tracking-widest uppercase">
            Artifact {currentIndex + 1} of {artifactCount}
          </span>
        </div>
      )}
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
