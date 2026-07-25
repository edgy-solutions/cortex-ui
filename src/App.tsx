import { useEffect, useRef, useState } from "react";
import { useAuth } from "react-oidc-context";
import { useInterviewStore } from "@/store/useInterviewStore";
import { Layout } from "@/components/Layout";
import { NeuralStream } from "@/components/NeuralStream/NeuralStream";
import { HUD } from "@/components/HUD/HUD";
import { WorkflowCanvas } from "@/components/Blueprint/WorkflowCanvas";
import { CompilationOverlay } from "@/components/Compilation/CompilationOverlay";
import { RequireAuth } from "@/auth/RequireAuth";
import { CanvasPersistence } from "@/hooks/useCanvasPersistence";
import { GlobalCanvasStage } from "@/components/AgenticCanvas/GlobalCanvasStage";
import {
  CORTEX_UI_FRONTEND_ID,
  CORTEX_UI_CAPABILITIES,
} from "@/registry/frontendCapabilities";
import { registerFrontendCapabilities } from "@/api/client";
import { startArtifactsSubscription } from "@/lib/electric";
import { startHumanTasksSubscription } from "@/lib/electricHumanTasks";
import { useTaskArtifactSync } from "@/lib/useTaskArtifactSync";
import { seedFromRest } from "@/lib/seedHumanTasks";
import { reconcileSessionOwner } from "@/lib/sessionIsolation";

import { Toaster } from "sonner";

/**
 * Hop 3 of the projector build plan
 * (docs/plans/projector-build-plan.md commit 0eda9f7 §4 Hop 3 Part 2).
 *
 * Mount the Electric subscription once at App-startup. Lifecycle:
 *   - Subscription starts on first mount (regardless of auth — the
 *     sandbox today is single-user; multi-user scoping comes in a
 *     follow-up that gates on produced_for.user_id once the JWT
 *     carries the user persona per [[pingsso-claim-gap]]).
 *   - On unmount, the subscription's stop function unsubscribes from
 *     the ShapeStream. React StrictMode in dev mounts twice; the
 *     unsubscribe between the two mounts is harmless (ShapeStream
 *     starts fresh on the second).
 *   - VITE_ELECTRIC_URL="" disables the subscription entirely (Shape C
 *     of Part 2 — proves the canvas works via Electric alone OR
 *     proves it doesn't when Electric is cut off).
 *
 * Source-of-truth claim: post-Hop-3, this subscription is the SOLE
 * source for the Electric-covered fields list in
 * useCanvasStore.ELECTRIC_COVERED_FIELDS. Part 2's absence probe
 * asserts via the provenance map.
 */
function useArtifactSync() {
  const auth = useAuth();
  const token = auth.user?.access_token ?? null;
  useEffect(() => {
    // 2026-06-30 per-user isolation: the Electric subscription now
    // flows through cortex-bff's `/electric/shape` proxy, which
    // server-injects a `produced_for.user_id = <verified sub>`
    // WHERE clause from the Bearer JWT. Without a token, the
    // subscription can't authenticate; defer until auth completes.
    // Re-fires when the token changes (e.g. silent refresh issues
    // a new access_token).
    const stop = startArtifactsSubscription(token);
    return stop;
  }, [token]);
}

/**
 * HITL Slice 2 — mount the HumanTask queue subscription. Mirrors
 * useArtifactSync: the Electric `human_task_projection` shape is served through
 * cortex-bff's /electric/shape proxy, which per-user-filters by the caller's
 * authz_id — so the browser only receives THIS user's tasks. Deferred until a
 * token exists; re-fires on silent refresh.
 */
function useHumanTaskSync() {
  const auth = useAuth();
  const token = auth.user?.access_token ?? null;
  useEffect(() => {
    // Seed the Tasks badge + canvas task-citizens from the authoritative REST
    // snapshot on load. Electric is the best-effort live layer on top.
    if (token) seedFromRest();
    const stop = startHumanTasksSubscription(token);
    return stop;
  }, [token]);
}

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

/**
 * Cross-user isolation guard. Called FIRST in App so its effect runs before the
 * data-sync hooks' effects — when the authenticated subject differs from the one
 * this browser last saw, purge every user-scoped store + cache before anything
 * repopulates. Returns false until the check has run, so the tree can withhold
 * render and no prior user's answers/tasks ever paint. See sessionIsolation.ts.
 */
function useSessionIsolation(): boolean {
  const auth = useAuth();
  const owner = auth.user?.profile?.sub ?? null;
  const [ready, setReady] = useState(false);
  useEffect(() => {
    if (!auth.isAuthenticated) {
      setReady(false);
      return;
    }
    if (!owner) return;
    reconcileSessionOwner(owner);
    setReady(true);
  }, [auth.isAuthenticated, owner]);
  return ready;
}

export default function App() {
  // MUST be first — purges a prior user's cached state before the sync hooks
  // below start their subscriptions or the timeline renders.
  const isolationReady = useSessionIsolation();
  const phase = useInterviewStore((s) => s.phase);
  const setPhase = useInterviewStore((s) => s.setPhase);
  useFrontendCapabilityRegistration();
  useArtifactSync();
  useHumanTaskSync();
  // Tasks are timeline citizens: mirror the HITL store into task-artifacts so
  // they ride the same timeline/canvas/HUD as answers.
  useTaskArtifactSync();

  return (
    <RequireAuth>
      {/* Withhold the whole data surface until the session-owner check has run,
          so a prior user's in-memory answers/tasks can never paint on switch. */}
      {!isolationReady ? (
        <div className="h-full w-full bg-slate-950" />
      ) : (
        <SessionSurface phase={phase} setPhase={setPhase} />
      )}
    </RequireAuth>
  );
}

function SessionSurface({
  phase,
  setPhase,
}: {
  phase: ReturnType<typeof useInterviewStore.getState>["phase"];
  setPhase: (p: ReturnType<typeof useInterviewStore.getState>["phase"]) => void;
}) {
  return (
    <>
      {/* Sync custom canvases with the server (durable, cross-device). */}
      <CanvasPersistence />
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
            
            {/* Semantic Canvas (Active Phase) — the camera-driven global
                stage (ADR-0028 canvas-dock model). It reuses CanvasPane for
                the double-click full-pane view. */}
            {phase !== "blueprint" && (
              <GlobalCanvasStage />
            )}
          </div>
        }
        hud={<HUD />}
      />

      {/* Full-screen Compilation Overlay */}
      {(phase === "compiling" || phase === "complete") && (
        <CompilationOverlay onComplete={() => setPhase("blueprint")} />
      )}
    </>
  );
}
