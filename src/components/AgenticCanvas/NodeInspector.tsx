import React, { useEffect, useState } from 'react';
import { X, Database } from 'lucide-react';
import { useCanvasStore } from '../../store/useCanvasStore';

// Get backend URL from the environment or default to localhost
const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:8000";

export const NodeInspector = () => {
  const { inspectedNodeId, isInspectorOpen, closeInspector } = useCanvasStore();
  const [nodeData, setNodeData] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (!inspectedNodeId || !isInspectorOpen) return;
    
    setIsLoading(true);
    let isMounted = true;

    fetch(`${API_URL}/graph/node/${encodeURIComponent(inspectedNodeId)}`)
      .then((res) => res.json())
      .then((data) => {
        if (isMounted) {
          setNodeData(data);
          setIsLoading(false);
        }
      })
      .catch((err) => {
        if (isMounted) {
          console.error("Failed to fetch graph node:", err);
          setNodeData({ error: "Failed to connect to backend", details: String(err) });
          setIsLoading(false);
        }
      });

    return () => { isMounted = false; };
  }, [inspectedNodeId, isInspectorOpen]);

  return (
    <div 
      className={`absolute top-0 right-0 h-full w-[450px] bg-slate-950/95 backdrop-blur-md border-l border-neon-blue/30 shadow-[-10px_0_30px_rgba(0,240,255,0.1)] transition-transform duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] z-50 flex flex-col
        ${isInspectorOpen ? 'translate-x-0' : 'translate-x-full'}
      `}
    >
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-white/10">
        <div className="flex items-center gap-2 text-neon-blue">
          <Database className="w-4 h-4 animate-pulse" />
          <h3 className="font-mono text-xs font-bold uppercase tracking-widest">Raw Graph Node</h3>
        </div>
        <button onClick={closeInspector} className="text-slate-400 hover:text-white transition-colors cursor-pointer">
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Terminal View */}
      <div className="flex-1 p-4 overflow-y-auto custom-scrollbar">
        {isLoading ? (
          <div className="flex flex-col items-center justify-center h-full space-y-3 text-slate-500">
            <div className="w-5 h-5 border-2 border-neon-blue/30 border-t-neon-blue rounded-full animate-spin" />
            <p className="font-mono text-[10px] uppercase tracking-widest">Querying Neo4j...</p>
          </div>
        ) : (
          <div className="bg-black/50 border border-white/5 rounded-lg p-4 h-full relative group">
            <div className="absolute top-2 right-2 px-2 py-1 bg-neon-blue/10 rounded text-[9px] font-mono text-neon-blue uppercase">JSON</div>
            <pre className="font-mono text-[11px] text-green-400 whitespace-pre-wrap break-all leading-relaxed">
              {nodeData ? JSON.stringify(nodeData, null, 2) : '// No data bound'}
            </pre>
          </div>
        )}
      </div>
    </div>
  );
};
