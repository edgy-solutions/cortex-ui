import { useEffect, useRef } from "react";
import { useAuth } from "react-oidc-context";
import { useInterviewStore } from "@/store/useInterviewStore";
import { Layout } from "@/components/Layout";
import { NeuralStream } from "@/components/NeuralStream/NeuralStream";
import { HUD } from "@/components/HUD/HUD";
import { WorkflowCanvas } from "@/components/Blueprint/WorkflowCanvas";
import { CompilationOverlay } from "@/components/Compilation/CompilationOverlay";
import { RequireAuth } from "@/auth/RequireAuth";
import { CanvasPane } from "@/components/AgenticCanvas/CanvasPane";
import {
  CORTEX_UI_FRONTEND_ID,
  CORTEX_UI_CAPABILITIES,
} from "@/registry/frontendCapabilities";
import { registerFrontendCapabilities } from "@/api/client";

import { Toaster } from "sonner";

// ADR-0017 frontend self-registration of presentation capabilities.
// Fires once per authenticated session, best-effort. cortex-bff logs
// the advertisement structurally so Engine F's eventual
// /search_predicates lookup has a real source of truth to pull from.
function useFrontendCapabilityRegistration() {
  const auth = useAuth();
  const registeredRef = useRef(false);

  useEffect(() => {
    if (!auth.isAuthenticated || registeredRef.current) return;
    registeredRef.current = true;
    registerFrontendCapabilities({
      frontend_id: CORTEX_UI_FRONTEND_ID,
      // Read at runtime from Vite's build-time injected version string;
      // falls back to a placeholder if the env wasn't set.
      frontend_version: (import.meta as any).env?.VITE_APP_VERSION ?? "dev",
      capabilities: CORTEX_UI_CAPABILITIES,
    }).then(
      (resp) => {
        // eslint-disable-next-line no-console
        console.info(
          "[ADR-0017] frontend capabilities registered:",
          resp.accepted,
          "for",
          resp.frontend_id,
        );
      },
      (err) => {
        // Best-effort: a failed registration just means Engine F's
        // in-memory default table continues to speak for cortex-ui,
        // which is the pre-Stage-2 baseline anyway.
        // eslint-disable-next-line no-console
        console.warn("[ADR-0017] frontend capability registration failed:", err);
      },
    );
  }, [auth.isAuthenticated]);
}

export default function App() {
  const phase = useInterviewStore((s) => s.phase);
  const setPhase = useInterviewStore((s) => s.setPhase);
  useFrontendCapabilityRegistration();

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
