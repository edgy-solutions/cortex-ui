import { useMemo } from 'react';
import { useCanvasStore } from '../../store/useCanvasStore';
import { SemanticInterpreter } from '../registry/SemanticInterpreter';
import { useMeshConfig, DynamicIcon } from '../NeuralStream/AgentTeamLoader';
import { Layers } from 'lucide-react';

export const CanvasPane = () => {
  const { personaConfig } = useMeshConfig();
  const { activeComponents, activeTab, setActiveTab } = useCanvasStore();

  // 1. Extract unique personas from the results (Must be above early return)
  const uniquePersonas = useMemo(() => {
    const personas = new Set<string>();
    activeComponents.forEach(comp => {
      if (comp.source_persona) personas.add(comp.source_persona);
    });
    return Array.from(personas);
  }, [activeComponents]);

  // 2. Filter components based on active tab (Must be above early return)
  const filteredComponents = useMemo(() => {
    if (activeTab === "ALL") return activeComponents;
    return activeComponents.filter(comp => comp.source_persona === activeTab);
  }, [activeComponents, activeTab]);

  if (activeComponents.length === 0) {
    return (
      <div className="h-full w-full flex items-center justify-center bg-slate-950/50 border-l border-white/10">
        <p className="font-mono text-slate-600 text-xs tracking-widest uppercase">Awaiting Mesh Artifacts...</p>
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
