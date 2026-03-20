import React from "react";
import { AlertTriangle, ShieldAlert } from "lucide-react";

interface HazardEntity {
  id: string;
  name?: string;
  type?: string;
  description?: string;
}

interface WarningCardProps {
  error: string;
  hazards: HazardEntity[];
  isCritical: boolean;
}

export const WarningCard: React.FC<WarningCardProps> = ({ error, hazards, isCritical }) => {
  return (
    <div className={`w-full p-5 rounded-xl border backdrop-blur-md ${
      isCritical 
        ? "bg-red-950/40 border-red-500/50 shadow-[0_0_30px_rgba(239,68,68,0.15)]" 
        : "bg-amber-950/40 border-amber-500/50 shadow-[0_0_30px_rgba(245,158,11,0.15)]"
    }`}>
      {/* Header */}
      <div className="flex items-center gap-3 mb-4 border-b border-white/10 pb-3">
        {isCritical ? (
          <ShieldAlert className="w-6 h-6 text-red-500 animate-pulse" />
        ) : (
          <AlertTriangle className="w-6 h-6 text-amber-500" />
        )}
        <div>
          <h3 className={`font-mono text-sm font-bold tracking-wider uppercase ${isCritical ? "text-red-500" : "text-amber-500"}`}>
            {isCritical ? "Structural Risk Alert" : "Safety Constraint"}
          </h3>
          <p className="text-[10px] text-slate-400 font-mono break-all">
            SUBJECT_CONCEPT: {error}
          </p>
        </div>
      </div>

      {/* Hazards List */}
      {hazards && hazards.length > 0 ? (
        <div className="space-y-3">
          {hazards.map((hazard, index) => (
            <div key={hazard.id || index} className="p-3 bg-black/40 rounded-lg border border-white/5">
              <div className="flex items-center gap-2 mb-1">
                <span className={`w-2 h-2 rounded-full ${isCritical ? "bg-red-500" : "bg-amber-500"}`} />
                <span className="font-mono text-xs text-white font-semibold uppercase tracking-wider">
                  {hazard.name || "Unknown Hazard"}
                </span>
                {hazard.type && (
                  <span className="ml-auto text-[9px] font-mono text-slate-500 bg-white/5 px-2 py-0.5 rounded">
                    {hazard.type}
                  </span>
                )}
              </div>
              {hazard.description && (
                <p className="text-sm text-slate-300 pl-4 border-l-2 border-white/10 ml-1 mt-2">
                  {hazard.description}
                </p>
              )}
            </div>
          ))}
        </div>
      ) : (
        <div className="p-4 text-center font-mono text-xs text-slate-500 bg-black/20 rounded-lg">
          No specific hazard telemetry extracted from the mesh.
        </div>
      )}
    </div>
  );
};
