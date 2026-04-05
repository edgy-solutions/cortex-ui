import { useInterviewStore } from "@/store/useInterviewStore";
import { Layout } from "@/components/Layout";
import { NeuralStream } from "@/components/NeuralStream/NeuralStream";
import { HUD } from "@/components/HUD/HUD";
import { WorkflowCanvas } from "@/components/Blueprint/WorkflowCanvas";
import { CompilationOverlay } from "@/components/Compilation/CompilationOverlay";
import { RequireAuth } from "@/auth/RequireAuth";
import { CanvasPane } from "@/components/AgenticCanvas/CanvasPane";

import { Toaster } from "sonner";

export default function App() {
  const phase = useInterviewStore((s) => s.phase);
  const setPhase = useInterviewStore((s) => s.setPhase);

  return (
    <RequireAuth>
      <Toaster 
        theme="dark" 
        position="top-center" 
        expand={false} 
        richColors 
        toastOptions={{
          className: "glass-panel-sm border-neon-blue/20 bg-slate-950/90 text-slate-200",
        }}
      />
      <Layout
        stream={<NeuralStream />}
        canvas={
          <div className="h-full w-full relative overflow-hidden">
            {/* Workflow Blueprint (Blueprint Phase) */}
            {phase === "blueprint" && (
              <div className="absolute inset-0 z-10 animate-in fade-in duration-700">
                <WorkflowCanvas />
              </div>
            )}
            
            {/* Semantic Canvas (Active Phase) */}
            {phase !== "blueprint" && (
              <CanvasPane />
            )}
          </div>
        }
        hud={<HUD />}
      />

      {/* Full-screen Compilation Overlay */}
      {(phase === "compiling" || phase === "complete") && (
        <CompilationOverlay onComplete={() => setPhase("blueprint")} />
      )}
    </RequireAuth>
  );
}
