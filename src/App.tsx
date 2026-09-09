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
import { assembleCapabilities } from "@/registry/assembleCapabilities";
import {
  createRegistrationLifecycle,
  observeArtifactsForMenuLoss,
  type RegistrationLifecycle,
} from "@/registry/registrationLifecycle";
import { useCanvasStore } from "@/store/useCanvasStore";
import { useRegistrationStore } from "@/store/useRegistrationStore";
import { buildVersion } from "@/lib/buildVersion";
import type { Artifact } from "@/api/types";
import { registerFrontendCapabilities } from "@/api/client";
import { startArtifactsSubscription } from "@/lib/electric";
import { startHumanTasksSubscription } from "@/lib/electricHumanTasks";
import { useTaskArtifactSync } from "@/lib/useTaskArtifactSync";
import { seedFromRest } from "@/lib/seedHumanTasks";
import { reconcileSessionOwner } from "@/lib/sessionIsolation";
import { usePersonaStore } from "@/store/usePersonaStore";
import { useLiveViewRefresh } from "@/lib/useLiveViewRefresh";
import { useCanvasSeedFromAnswers } from "@/lib/canvasSeedFromAnswer";
import { fetchEntitlements } from "@/api/client";
// SIDE-EFFECT IMPORT, and the bare form is load-bearing. This module installs the
// `window.__cortexSeedPortfolioCanvas` bring-up trigger and exports nothing App needs, so an
// unused named import would be a binding a bundler may drop. A module no one imports at all is
// dropped outright — which is what happened here: the module claimed in its own comment to
// expose a global, six tests passed by importing the function directly, and the global was
// absent from every built bundle for two days because nothing on the entry path referenced it.
// Guarded by `seedPortfolioCanvas.reachability.test.ts`. Remove when the phrase routes.
import "@/lib/seedPortfolioCanvas";
// SIDE-EFFECT IMPORT, bare for the same reason as the line above: this module installs
// `window.__cortex` and exports nothing App needs, so an unused named binding would be a
// binding a bundler may drop and a module nobody imports is dropped outright. Covered by the
// same reachability law.
import "@/lib/debugGlobals";

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
//
// RE-ASSERTABLE, NOT ONCE-PER-SESSION. This hook latched on a boolean for a year, which is the
// right COST against a stable substrate and the wrong ASSUMPTION against one that can be wiped
// underneath it. A nuclear prime drops the collection holding every `rendersAs` row; the helm
// hook restarts the registering ENGINE deployments so theirs come back; nothing re-posts
// cortex's, because only a browser can, and this hook had already fired. Every answer then
// rendered `KNOWLEDGE_DOCUMENT · No content available` until someone reloaded the tab — which
// is what the "reroll the engines, sometimes reroll everything" ritual was accidentally doing.
//
// The trigger is the server's own report, which it stamps on every answer, so a stable session
// still costs exactly one request. See `registrationLifecycle.ts` for why the widened
// `selection_basis` is NOT the trigger, and `menuPresence.ts` for the label that is.
// EXPORTED FOR ITS TEST, and the reason is a defect this repo has now shipped three times:
// the wiring is where these break, not the helpers. A mutation deleting both publish calls
// below left the whole suite green — the badge would have sat at "…" for ever and nothing
// would have said so. See `capabilityRegistration.test.tsx`.
export function useFrontendCapabilityRegistration() {
  const auth = useAuth();
  const lifecycleRef = useRef<RegistrationLifecycle | null>(null);
  if (!lifecycleRef.current) {
    lifecycleRef.current = createRegistrationLifecycle({
      frontendId: CORTEX_UI_FRONTEND_ID,
      now: () => Date.now(),
    });
  }
  const lifecycle = lifecycleRef.current;

  // ONE POST, callable twice. Extracted from the effect so the re-assertion sends exactly what
  // the opening registration sent — a second copy of this call would drift from the first, and
  // the drift would show up only after a wipe, which is the least observable moment there is.
  const post = useRef((reason: "open" | "re-assert") => {
    lifecycle.attemptStarted();
    // Assembled once per attempt, so the log can name what was SENT. Recomputing it inside the
    // handler would report what the assembler produces now rather than what this request
    // carried — the same value today, and a lie the first time the two can differ.
    const sent = assembleCapabilities(CORTEX_UI_CAPABILITIES);
    return registerFrontendCapabilities({
      frontend_id: CORTEX_UI_FRONTEND_ID,
      // THE COMMIT, NOT THE WORD "dev".
      //
      // This read `VITE_APP_VERSION`, which nothing in this repo sets — no Dockerfile, no CI
      // step, no .env — so every registration this surface has ever made recorded its version
      // as the literal string "dev". Server-side that is indistinguishable from a real value:
      // truthy, printable, and useless for answering which build advertised which menu.
      //
      // The build now carries a real sha (`buildVersion`), so it reports one.
      //
      // NOT NULL, DELIBERATELY, AND NOT YET. The fleet contract says `git_sha` is null rather
      // than a placeholder, and this field should follow — but `frontend_version` is a
      // pre-existing `string` on the wire and the server owns its validation. Sending null
      // unilaterally risks a 422 that would break registration outright, which is a great deal
      // worse than a cosmetic placeholder. Raised with the backend lane rather than changed
      // here.
      //
      // Until then the no-sha case says "unstamped": a word that cannot be read as a commit,
      // an environment or a release, so nobody can mistake it for a version the way "dev" was
      // mistaken for one. The case is rare — the build falls back to asking git.
      frontend_version: buildVersion().git_sha ?? "unstamped",
      // ASSEMBLED from component contract exports, not hand-authored (ADR-0017
      // amendment 2026-08-20). Rows whose component exports a contract are derived;
      // the rest stay legacy until their export lands, one row at a time.
      capabilities: sent,
    }).then(
      (resp) => {
        // SENT AND ACCEPTED, SIDE BY SIDE, AND THE ROWS BY NAME.
        //
        // This line used to print `resp.accepted` alone. That is the SERVER's count, not what
        // the client offered, and a row the client sent and the server silently dropped was
        // invisible — the two numbers never appeared together, so there was nothing to compare.
        // A count can also be exactly right for the wrong state: 22 offered, 22 accepted, one
        // refused, and the number is correct FOR THE REJECTION.
        //
        // So: the names of what was sent (the console's instrument) beside both counts, and the
        // graph query confirms what landed (the other instrument). The gap between them is now
        // visible rather than inferred.
        lifecycle.attemptSettled(true);
        // PUBLISHED, not only logged. `sent != accepted` is the one signal that says the two
        // halves disagree about what can be RENDERED — a shorter menu selects a plausible
        // WRONG card rather than failing visibly — and it has lived in the console, which is
        // read by whoever thinks to open it, which is nobody at the moment the card is wrong.
        useRegistrationStore
          .getState()
          .report({ sent: sent.length, accepted: resp.accepted, reassertion: reason === "re-assert" });
        const names = sent.map((c) => c.archetype + " | " + c.subject_uri).sort();
        // eslint-disable-next-line no-console
        console.info(
          "[ADR-0017] frontend capabilities (" + reason + ") — sent:",
          sent.length,
          "accepted:",
          resp.accepted,
          "for",
          resp.frontend_id,
          names,
        );
        if (resp.accepted !== sent.length) {
          // Not an error — the server is entitled to refuse a row. It must not do so QUIETLY,
          // because the failure is indistinguishable from a row that was never sent.
          // eslint-disable-next-line no-console
          console.warn(
            "[ADR-0017] REGISTRATION MISMATCH — " +
              (sent.length - resp.accepted) +
              " row(s) offered but not accepted. Compare the names above against the graph; the" +
              " count alone cannot say WHICH.",
          );
        }
      },
      (err) => {
        lifecycle.attemptSettled(false);
        // A REQUEST THAT NEVER RETURNED IS NOT A PARTIAL ACCEPTANCE. Nothing was established
        // either way, and the repair is to retry rather than to go and find which row the
        // server refused.
        useRegistrationStore.getState().reportFailure();
        // Best-effort: a failed registration just means Engine F's
        // in-memory default table continues to speak for cortex-ui,
        // which is the pre-Stage-2 baseline anyway.
        // eslint-disable-next-line no-console
        console.warn("[ADR-0017] frontend capability registration failed:", err);
      },
    );
  }).current;

  // THE OPENING REGISTRATION — unchanged in cost and in timing.
  useEffect(() => {
    if (!auth.isAuthenticated) return;
    if (!lifecycle.shouldOpen()) return;
    void post("open");
  }, [auth.isAuthenticated, lifecycle, post]);

  // THE RE-ASSERTION, DRIVEN BY EVIDENCE.
  //
  // Every answer carries the selector's own account of which menu it used. An answer stamped
  // for a caller the server has no menu for is proof our rows are gone, and it is the ONLY
  // proof available from inside a session — no route change, reconnect or refetch reveals it.
  //
  // ONLY NEWLY ARRIVED ARTIFACTS ARE READ. A wiped answer stays in the list after the repair,
  // and re-reading it would re-trigger once per cooldown forever, against a menu that is
  // already back. The seen-set makes each artifact evidence exactly once.
  const seenRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    if (!auth.isAuthenticated) return;
    const inspect = (artifacts: Artifact[]) => {
      if (!observeArtifactsForMenuLoss(artifacts, seenRef.current, lifecycle)) return;
      // SAID OUT LOUD. The months this went undiagnosed were months in which the system was
      // behaving exactly as designed and reporting nothing, so the recovery announces itself —
      // and names the cause, because "re-registering" alone would read as routine noise.
      // eslint-disable-next-line no-console
      console.warn(
        "[ADR-0017] the server holds NO capability menu for this surface — re-asserting." +
          " This is the post-wipe state: a prime dropped the `rendersAs` rows and only a" +
          " browser can put cortex's back. Re-posting rather than waiting for a reload.",
      );
      void post("re-assert");
    };
    inspect(useCanvasStore.getState().artifacts);
    return useCanvasStore.subscribe((s, prev) => {
      if (s.artifacts !== prev.artifacts) inspect(s.artifacts);
    });
  }, [auth.isAuthenticated, lifecycle, post]);
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
  // Track WHICH owner we've reconciled, not just a boolean — so an in-place
  // account switch (owner changes without a full reload) also blanks the surface
  // until THIS owner's purge has run. Ready iff the reconciled owner === current.
  const [readyOwner, setReadyOwner] = useState<string | null>(null);
  useEffect(() => {
    if (!auth.isAuthenticated || !owner) {
      setReadyOwner(null);
      return;
    }
    reconcileSessionOwner(owner);
    setReadyOwner(owner);
  }, [auth.isAuthenticated, owner]);
  return owner != null && readyOwner === owner;
}

/**
 * Entitlements are SESSION BOOTSTRAP, so they are fetched here — on auth-ready, at the top of
 * the tree — rather than by the picker that displays them.
 *
 * The picker mounts deep inside the answer surface, so owning the fetch there meant the request
 * deciding whether a user may choose a persona went out AFTER the card tree rendered, behind
 * however many artifacts the session had accumulated. Under HTTP/1.1 the browser caps ~6
 * connections per origin and Electric holds two of them open for its live shapes, so on a
 * session with dozens of cards the request could sit unsent until it timed out — and the picker,
 * having no dependency that would change afterwards, stayed inert for the rest of the session.
 *
 * This is the correct ordering on the merits, not a workaround: bootstrap data should not queue
 * behind card data in any protocol. HTTP/2 multiplexing (which the TLS-terminating venue gets
 * for free) makes the old ordering survivable rather than correct.
 */
function useEntitlementsSync() {
  const auth = useAuth();
  const sub = auth.user?.profile?.sub ?? null;
  const loadEntitlements = usePersonaStore((s) => s.loadEntitlements);
  const loadedFor = useRef<string | null>(null);
  useEffect(() => {
    if (!auth.isAuthenticated || !sub) return;
    // Keyed on the SUBJECT rather than on a boolean: a user switch must re-fetch, and a failed
    // attempt must not be mistaken for a completed one. The store bounds its own retries and
    // surfaces a terminal failure through the picker's visible error state.
    if (loadedFor.current === sub) return;
    loadedFor.current = sub;
    void loadEntitlements(fetchEntitlements);
  }, [auth.isAuthenticated, sub, loadEntitlements]);
}

export default function App() {
  // MUST be first — purges a prior user's cached state before the sync hooks
  // below start their subscriptions or the timeline renders.
  const isolationReady = useSessionIsolation();
  const phase = useInterviewStore((s) => s.phase);
  const setPhase = useInterviewStore((s) => s.setPhase);
  useFrontendCapabilityRegistration();
  useEntitlementsSync();
  // ADR-0042 OQ1: ONE subscription for the whole surface, not one per card — a per-card
  // watcher on a global signal is the fan-out species swept for on 2026-08-25.
  useLiveViewRefresh();
  // The client end of "make me a portfolio canvas": watch for the seed ANSWER and arrange the
  // artifacts it names. Mounted once — a per-card watcher on a global store is the fan-out
  // species swept for on 2026-08-25.
  useCanvasSeedFromAnswers();
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
