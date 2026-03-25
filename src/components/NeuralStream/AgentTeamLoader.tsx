import { Wrench, BookOpen, Truck, ShieldCheck, Network, Database } from "lucide-react";

export const PersonaConfig = {
  MECHANIC: { label: "Line Mechanic", icon: <Wrench className="w-4 h-4" />, color: "text-amber-500", bg: "bg-amber-500/10 border-amber-500/30" },
  TECH_WRITER: { label: "Tech Writer", icon: <BookOpen className="w-4 h-4" />, color: "text-blue-400", bg: "bg-blue-400/10 border-blue-400/30" },
  LOGISTICS: { label: "Logistics", icon: <Truck className="w-4 h-4" />, color: "text-emerald-500", bg: "bg-emerald-500/10 border-emerald-500/30" },
  AUDITOR: { label: "Auditor", icon: <ShieldCheck className="w-4 h-4" />, color: "text-red-400", bg: "bg-red-400/10 border-red-400/30" },
  PROCESS_ENGINEER: { label: "Process Engineer", icon: <Network className="w-4 h-4" />, color: "text-purple-500", bg: "bg-purple-500/10 border-purple-500/30" },
  DATA_STEWARD: { label: "Data Steward", icon: <Database className="w-4 h-4" />, color: "text-cyan-400", bg: "bg-cyan-400/10 border-cyan-400/30" }
};

export const AgentTeamLoader = ({ activePersonas }: { activePersonas: string[] }) => {
  return (
    <div className="flex flex-col items-center justify-center p-8 space-y-6">
      <div className="relative flex items-center justify-center w-12 h-12">
        <div className="absolute inset-0 rounded-full border-2 border-[#00f0ff]/30 animate-ping"></div>
        <div className="w-4 h-4 bg-[#00f0ff] rounded-full shadow-[0_0_15px_#00f0ff] animate-pulse"></div>
      </div>
      <div className="text-center space-y-2">
        <p className="font-mono text-xs text-slate-400 uppercase tracking-widest">Engine O Planning Complete</p>
        <p className="font-mono text-[10px] text-slate-500">Summoning specialized graph agents...</p>
      </div>
      <div className="flex gap-4 mt-4 flex-wrap justify-center">
        {activePersonas.map((personaKey) => {
          const config = PersonaConfig[personaKey as keyof typeof PersonaConfig];
          if (!config) return null;
          return (
            <div key={personaKey} className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border ${config.bg} ${config.color}`}>
              {config.icon}
              <span className="font-mono text-[10px] font-bold uppercase tracking-wider">{config.label}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
};
