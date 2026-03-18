import React from "react";
import { Database, Activity } from "lucide-react";
import { motion } from "framer-motion";

interface SupplyTableProps {
  data: Record<string, any>[];
}

export const SupplyTable: React.FC<SupplyTableProps> = ({ data }) => {
  if (!data || data.length === 0) {
    return (
      <div className="p-4 glass-panel border-white/10 text-slate-500 font-mono text-xs italic">
        NO_TELEMETRY_DATA_AVAILABLE
      </div>
    );
  }

  // Extract keys for dynamic columns
  const columns = Object.keys(data[0]);

  const renderStatusBadge = (value: string) => {
    const val = String(value).toUpperCase();
    let glowColor = "bg-slate-500";
    let textColor = "text-slate-300";
    let borderColor = "border-slate-500/30";

    if (val === "OK" || val === "HEALTHY" || val === "OPERATIONAL") {
      glowColor = "bg-neon-green/20";
      textColor = "text-neon-green";
      borderColor = "border-neon-green/30";
    } else if (val === "CRITICAL" || val === "FAIL" || val === "OFFLINE") {
      glowColor = "bg-red-500/20";
      textColor = "text-red-500";
      borderColor = "border-red-500/30";
    } else if (val === "WARNING" || val === "DEGRADED" || val === "PENDING") {
      glowColor = "bg-amber-500/20";
      textColor = "text-amber-500";
      borderColor = "border-amber-500/30";
    }

    return (
      <div className={`inline-flex items-center px-2 py-0.5 rounded-full border ${borderColor} ${glowColor} ${textColor} text-[9px] font-bold tracking-tighter`}>
        <div className={`w-1 h-1 rounded-full ${isStatusActive(val) ? 'animate-pulse' : ''} bg-current mr-1.5`} />
        {val}
      </div>
    );
  };

  const isStatusActive = (val: string) => ["OK", "HEALTHY", "OPERATIONAL", "CRITICAL", "WARNING"].includes(val);

  return (
    <motion.div 
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="max-w-full glass-panel border-neon-blue/30 overflow-hidden relative group"
    >
      {/* Background Scanline */}
      <div className="absolute inset-0 bg-gradient-to-b from-neon-blue/5 to-transparent pointer-events-none opacity-20" />
      
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/10 bg-white/5 relative z-10">
        <div className="flex items-center gap-2">
          <Database className="w-4 h-4 text-neon-blue" />
          <span className="font-mono text-[10px] font-bold text-slate-300 tracking-widest uppercase">
            Live Telemetry / Inventory
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <Activity className="w-3 h-3 text-neon-blue animate-pulse" />
          <span className="font-mono text-[9px] text-neon-blue/60 uppercase tracking-tighter">Syncing...</span>
        </div>
      </div>

      {/* Table Content */}
      <div className="overflow-x-auto relative z-10 font-mono">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-slate-900/50">
              {columns.map((col) => (
                <th 
                  key={col} 
                  className="px-4 py-2.5 text-[10px] font-bold text-slate-500 uppercase tracking-wider border-b border-white/5"
                >
                  {col}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {data.map((row, i) => (
              <tr 
                key={i} 
                className="hover:bg-neon-blue/5 transition-colors duration-200 group/row"
              >
                {columns.map((col) => {
                  const val = row[col];
                  const isStatus = col.toLowerCase() === "status" || col.toLowerCase() === "health";
                  
                  return (
                    <td key={col} className="px-4 py-3 text-[11px] text-slate-300 border-b border-white/5 whitespace-nowrap">
                      {isStatus ? renderStatusBadge(val) : (
                        <span className={typeof val === 'number' ? 'text-neon-blue' : ''}>
                          {val}
                        </span>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Footer Footer Decoration */}
      <div className="h-1 w-full bg-gradient-to-r from-transparent via-neon-blue/20 to-transparent" />
    </motion.div>
  );
};
