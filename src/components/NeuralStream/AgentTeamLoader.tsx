import { useEffect, useState } from "react";
import * as LucideIcons from "lucide-react";
import { getMeshConfig } from "@/api/client";

export const DynamicIcon = ({ name, className }: { name: string, className?: string }) => {
  const IconComponent = (LucideIcons as any)[name] || LucideIcons.HelpCircle;
  return <IconComponent className={className} />;
};

export const useMeshConfig = () => {
  const [personaConfig, setPersonaConfig] = useState<Record<string, any>>({});
  
  useEffect(() => {
    getMeshConfig()
      .then(data => { if (data.personas) setPersonaConfig(data.personas); })
      .catch(err => console.error("Config load failed:", err));
  }, []);

  return { personaConfig };
};

export const AgentTeamLoader = ({ activePersonas }: { activePersonas: string[] }) => {
  const { personaConfig } = useMeshConfig();

  return (
    <div className="flex flex-col items-center justify-center p-8 space-y-6">
      <div className="relative flex items-center justify-center w-12 h-12">
        <div className="absolute inset-0 rounded-full border-2 border-[#00f0ff]/30 animate-ping"></div>
        <div className="w-4 h-4 bg-[#00f0ff] rounded-full shadow-[0_0_15px_#00f0ff] animate-pulse"></div>
      </div>
      <div className="text-center space-y-2">
        <p className="font-mono text-xs text-slate-400 uppercase tracking-widest">Engine O Planning Complete</p>
        <p className="font-mono text-[10px] text-slate-500">Summoning specialized mesh agents...</p>
      </div>
      <div className="flex gap-4 mt-4 flex-wrap justify-center">
        {activePersonas.map((personaKey) => {
          const config = personaConfig[personaKey] || { 
            label: personaKey, icon: "Bot", color: "text-slate-300", bg: "bg-slate-800/50 border-slate-700" 
          };
          return (
            <div key={personaKey} className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border ${config.bg} ${config.color}`}>
              <DynamicIcon name={config.icon} className="w-4 h-4" />
              <span className="font-mono text-[10px] font-bold uppercase tracking-wider">{config.label}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
};
