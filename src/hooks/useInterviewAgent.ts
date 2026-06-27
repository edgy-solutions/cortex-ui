import { useCallback, useRef, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { streamInterviewResponse } from "@/api/client";
import type {
  StreamEvent,
  InterviewRequest,
} from "@/api/types";
import {
  useInterviewStore,
  type Message,
} from "@/store/useInterviewStore";

import { useCanvasStore } from "@/store/useCanvasStore";
import {
  isMockGroundingEnabled,
  runMockGroundingFor,
  type MockHandle,
} from "@/lib/mockGroundingEmitter";

// ── Helpers ───────────────────────────────────────────────
let _id = 0;
const uid = () => `msg-${++_id}-${Date.now()}`;
let _artifactSeq = 0;
const artifactUid = () => `artifact-${++_artifactSeq}-${Date.now()}`;

/**
 * Default `produced_for` for Phase 1.
 *
 * Per ADR-0023 + [[pingsso-claim-gap]], the PingSSO JWT today lacks
 * `user_persona` / `entitled_domains` claims. We populate the slot
 * THINLY (user_id + is_authenticated) and leave persona/entitlements
 * NULL. Null here means "unknown user persona," NOT a default —
 * treating null as default would silently mask the claim gap, which
 * is the opposite of why the slot exists. When claims expand, this
 * function expands to read them; the schema stays put.
 */
function getProducedFor(): {
  user_id: string;
  is_authenticated: boolean;
  user_persona: string | null;
  entitled_domains: string[] | null;
} {
  return {
    // Phase 1 placeholder; real user_id arrives when auth wires up.
    user_id: "sandbox-user",
    is_authenticated: false,
    user_persona: null,
    entitled_domains: null,
  };
}

// Option A clean cut (2026-06-22): the legacy `classifyLegacyLabel`
// helper that mapped free-text "status / think" labels onto stable
// PipelineStageKinds was REMOVED. The gateway now emits typed
// `pipeline_stage` events directly; the heartbeat / accumulation
// problem is fixed at the source (no every-10s status emission).
// If a legacy gateway is still emitting `status` events, parseSSE
// drops them silently — verify gateway version >= the Option A roll
// before upgrading the UI.

/**
 * The real interview hook that connects to the backend streaming API.
 * Replaces useMockAgent when the backend is running.
 *
 * Per ADR-0023 (Phase 1), each turn ALSO produces a durable `Artifact`
 * in `useCanvasStore.artifacts`:
 *
 *   - At turn start: `createPendingArtifact` appends the pending row
 *     (instant responsiveness — canvas can show "working on it"
 *     before any event arrives).
 *   - As events arrive: `updateArtifact` patches the row in place
 *     (`route_decision` → routing + refined produced_by;
 *     `sources` → sources; `graph_trace` → graph_trace;
 *     `ui_payload`/`final_payload` → rendered_output + status=complete).
 *   - At stream_end: any still-pending artifact is marked complete
 *     with whatever it accumulated, so it persists honestly.
 *   - On error: status=failed (honest degradation, not silent loss).
 *
 * This is the create-pending → update-complete responsiveness flow
 * acceptance #2 requires.
 *
 * Features:
 * - Streams text character-by-character (backend controls pacing)
 * - Parses special tokens to trigger thinking card animations
 * - Updates Zustand store with ontology terms and data bindings
 * - Transitions to "blueprint" phase on INTERVIEW_COMPLETE signal
 */
export function useInterviewAgent() {
  const {
    liveBpmnGraph,
    addMessage,
    updateMessage,
    setLiveBpmnGraph,
    setIsProcessing,
    setPhase,
    addOntologyTerm,
    addDataBinding,
    upsertThinkingStep,
    primePipelineStages,
  } = useInterviewStore();

  const [sessionId] = useState(() => `session-${Date.now()}`);
  const abortController = useRef<AbortController | null>(null);
  const currentAgentMsgId = useRef<string | null>(null);
  const currentArtifactIdRef = useRef<string | null>(null);
  const mockGroundingHandle = useRef<MockHandle | null>(null);


  /**
   * Helper invoked at `stream_end` to mark every stage that NEVER
   * received an explicit completion or error signal as `incomplete`.
   *
   * **The founding principle this enforces**: surface what the
   * pipeline did, never synthesize. The previous implementation
   * (`markAllStepsDone`) promoted any still-loading or pending stage
   * to `done` — a UI-side fabrication of a completion signal that
   * the gateway never sent. That was the *one* place the UI was
   * manufacturing green, and it's the contributing layer in the
   * silent-degrade composition class: when Engine O can't talk to
   * LiteLLM and downstream layers silently degrade to "did
   * SOMETHING," the gateway's stream still ends with no error AND no
   * completed event for stages 2-5, and the old code painted them
   * all green. Catastrophic false-positive.
   *
   * The corrected behavior is success-on-positive-signal:
   *  - `done` only on receipt of `pipeline_stage status=completed`
   *  - `error` only on receipt of `pipeline_error`
   *  - `incomplete` (NEW third state) on stream_end if neither arrived
   *
   * `incomplete` is rendered as an amber HelpCircle distinct from
   * pending (which means "still working"), surfacing the actual
   * epistemic situation: the stream is over, this stage never
   * reported done, we don't know if it completed.
   */
  const markUnconfirmedStepsIncomplete = useCallback(
    (agentMsgId: string) => {
      const msg = useInterviewStore
        .getState()
        .messages.find((m) => m.id === agentMsgId);
      const steps = msg?.thinkingSteps ?? [];
      steps.forEach((s) => {
        if (s.status === "loading" || s.status === "pending") {
          upsertThinkingStep(agentMsgId, {
            kind: s.kind,
            label: s.label,
            status: "incomplete",
          });
        }
      });
    },
    [upsertThinkingStep]
  );

  // Handle individual stream events
  const handleStreamEvent = useCallback(
    (event: StreamEvent) => {
      const agentId = currentAgentMsgId.current;
      const artifactId = currentArtifactIdRef.current;
      // Typed grounding-panel events flow even before an agent message
      // exists — gateway may emit them out-of-order; tolerate rather
      // than drop signal.
      const isAlwaysAllowed =
        event.type === "context_update" ||
        event.type === "final_payload" ||
        event.type === "ui_payload" ||
        event.type === "chat_message" ||
        event.type === "stream_end" ||
        event.type === "pipeline_stage" ||
        event.type === "pipeline_error" ||
        event.type === "route_decision" ||
        event.type === "sources" ||
        event.type === "graph_trace";
      if (!agentId && !isAlwaysAllowed) return;

      // Convenience: artifact-store getter we use across cases.
      const canvas = useCanvasStore.getState();

      switch (event.type) {
        case "context_update": {
          if (event.contextType === "ontology") {
            event.data.forEach((concept, i) => {
              addOntologyTerm({
                id: `concept-${Date.now()}-${i}`,
                category: "Concept",
                label: concept,
              });
            });
          } else if (event.contextType === "bindings") {
            event.data.forEach((uri, i) => {
              addDataBinding({
                id: `binding-${Date.now()}-${i}`,
                model: uri,
                schema: "Verified",
                healthy: true,
              });
            });
          }
          break;
        }

        case "pipeline_error": {
          if (!agentId) break;
          // Typed error event — replaces the legacy action="error"
          // status. If the error is bound to a specific pipeline stage
          // (`kind`), mark that row as error and surface the message.
          // If unbound, the error becomes a synthetic "composing" row
          // so the user still sees the failure in the timeline.
          const errorKind = event.kind ?? "composing";
          upsertThinkingStep(agentId, {
            kind: errorKind,
            label: event.message,
            status: "error",
          });
          // Reflect honest failure on the artifact too — status=failed
          // is the honest-degradation discipline applied to the
          // durable artifact (not silently absorbed into "complete").
          if (artifactId) {
            canvas.updateArtifact(artifactId, { status: "failed" });
          }
          break;
        }

        case "pipeline_stage": {
          // New typed grounding-panel event. Maps 1:1 to a known
          // pipeline kind; the upsert collapses repeated `started`
          // events (e.g. retries) to a single row.
          if (!agentId) break;
          const status =
            event.status === "completed"
              ? ("done" as const)
              : event.status === "failed"
              ? ("error" as const)
              : ("loading" as const);
          // Friendly label from PIPELINE_STAGES; the typed event itself
          // doesn't carry a label, by design (label is UI concern,
          // event is contract concern).
          const stageLabel =
            event.kind === "understanding"
              ? "Understanding your question"
              : event.kind === "locating"
              ? "Locating the subject"
              : event.kind === "choosing_action"
              ? "Choosing how to answer"
              : event.kind === "retrieving"
              ? "Retrieving evidence"
              : "Composing the answer";
          upsertThinkingStep(agentId, {
            kind: event.kind,
            label: stageLabel,
            status,
            elapsedMs: event.elapsed_ms,
          });
          break;
        }

        case "route_decision":
          // Routing arrived → update the artifact in place. This is also
          // where produced_by gets refined from the pending sentinel
          // to the real engine identity carried by handled_by — the
          // pending→complete lifecycle transition acceptance #2
          // exercises.
          if (artifactId) {
            canvas.updateArtifact(artifactId, {
              routing: event.decision,
              produced_by: {
                actor_type: "agent",
                actor_id: event.decision.handled_by.engine_name,
                endpoint: event.decision.handled_by.endpoint_url,
              },
              resolved_intent: {
                subject_uri: event.decision.about.uri,
                verb_iri: event.decision.action.iri,
              },
            });
          }
          break;

        case "sources":
          if (artifactId) {
            canvas.updateArtifact(artifactId, { sources: event.sources });
          }
          break;

        case "graph_trace":
          if (artifactId) {
            canvas.updateArtifact(artifactId, { graph_trace: event.nodes });
          }
          break;

        case "chat_message": {
          // chat_message means the synthesis stage produced text — it
          // does NOT mean every prior stage completed. Each stage gets
          // marked done only by its own pipeline_stage:completed event;
          // any stage still pending or loading at stream_end becomes
          // `incomplete`. Founding principle: surface what the pipeline
          // did, never synthesize.
          if (agentId && event.data) {
            updateMessage(agentId, {
              content: event.data.content,
              isStreaming: false,
            });
          }
          break;
        }

        case "ui_payload":
        case "final_payload": {
          // Engine F's final payload arrival is positive signal for
          // `composing` only — and the gateway already emits an explicit
          // pipeline_stage(composing, completed) for that. We do NOT
          // synthesize completion for stages 1-4 just because stage 5
          // produced output (the silent-degrade composition class can
          // produce a vacuous final_payload from a wholly-degraded run).
          if (agentId) {
            // Transition the artifact: pending → complete, with the
            // rendered_output the canvas reads. The artifact's status
            // is the responsiveness-flow signal acceptance #2 needs to
            // see transition (not be replaced by a new artifact).
            if (artifactId && event.payload?.components) {
              canvas.updateArtifact(artifactId, {
                status: "complete",
                rendered_output: {
                  components: event.payload.components,
                },
              });
            }
            // Update chat message with a receipt instead of the full payload
            updateMessage(agentId, {
              content: `Artifacts generated: ${
                event.payload?.components?.length || 0
              } modules deployed to Canvas.`,
              isReceipt: true,
              isStreaming: false,
            });
          }
          // (AgentTeamLoader was removed in Option A — nothing to clear here.)
          break;
        }

        case "stream_end": {
          // Stream is over. Any stage still in pending/loading never
          // received its positive completion signal — mark them
          // `incomplete` (NOT `done`). See markUnconfirmedStepsIncomplete
          // for the founding-principle rationale.
          if (agentId) {
            markUnconfirmedStepsIncomplete(agentId);
            updateMessage(agentId, { isStreaming: false });
          }
          // Artifact lifecycle: if the artifact never transitioned
          // out of pending (no final_payload arrived), mark it
          // complete with whatever it accumulated so it persists
          // honestly. If it errored, leave it as failed. This is the
          // "honest finalization" of the pending→complete flow —
          // pending artifacts aren't allowed to live forever; they
          // terminate, honestly, into complete or failed.
          if (artifactId) {
            const current = useCanvasStore
              .getState()
              .artifacts.find((a) => a.id === artifactId);
            if (current?.status === "pending") {
              canvas.updateArtifact(artifactId, { status: "complete" });
            }
          }
          currentAgentMsgId.current = null;
          currentArtifactIdRef.current = null;
          break;
        }
      }
    },
    [
      updateMessage,
      addOntologyTerm,
      addDataBinding,
      upsertThinkingStep,
      markUnconfirmedStepsIncomplete,
    ]
  );

  // Main mutation that handles the streaming request
  const mutation = useMutation({
    mutationFn: async (userInput: string) => {
      // Cancel any existing stream
      abortController.current?.abort();
      abortController.current = new AbortController();

      // Reset state for the new turn
      setIsProcessing(true);
      setPhase("active");
      setLiveBpmnGraph(null);
      // Per-turn UI grounding (ontology terms, data bindings) on the
      // interview store stays per-turn-resettable — that's transient
      // UI state, not artifact state. The per-turn routing/sources/
      // graph_trace SINGLETONS that used to live on useInterviewStore
      // are GONE — they live on the artifact now. See
      // useInterviewStore.resetTurnGroundingUI.
      useInterviewStore.getState().resetTurnGroundingUI();

      // Add user message
      const userMsg: Message = {
        id: uid(),
        role: "user",
        content: userInput,
        isStreaming: false,
        timestamp: Date.now(),
      };
      addMessage(userMsg);

      // Create agent message placeholder + the durable artifact it
      // points at. The artifact ID is captured up-front so subsequent
      // stream events can update it in place (acceptance #2).
      const agentId = uid();
      const artifactId = artifactUid();
      currentAgentMsgId.current = agentId;
      currentArtifactIdRef.current = artifactId;

      const agentMsg: Message = {
        id: agentId,
        role: "agent",
        content: "",
        isStreaming: true,
        thinkingSteps: [],
        timestamp: Date.now(),
        // Bidirectional reference: Message ↔ Artifact, by id. They are
        // STRUCTURALLY DISTINCT objects (acceptance #3). Do NOT add
        // artifact fields onto Message for convenience.
        artifactId,
      };
      addMessage(agentMsg);

      // Append the pending artifact to the canvas collection — instant
      // responsiveness, before any pipeline event arrives. The
      // produced_by sentinel will be refined when route_decision lands.
      // derived_from_artifact_id is null in Phase 1 (no follow-up
      // detection yet); the seed signature accepts it so capture-or-
      // lose-forever doesn't bite when detection lands later.
      useCanvasStore.getState().createPendingArtifact({
        id: artifactId,
        message_id: agentId,
        question_text: userInput,
        produced_for: getProducedFor(),
        derived_from_artifact_id: null,
      });

      // Phase 0 instant-pre-render: seed all 5 pipeline stages as
      // `pending` (first stage `loading`) on the agent message the
      // moment the query fires. The panel never appears empty — users
      // see "I heard you" structure before any gateway event arrives.
      primePipelineStages(agentId);

      // Dev: if mock-grounding is enabled, schedule a synthetic event
      // sequence that fires alongside the real backend events. Lets us
      // exercise the grounding panel end-to-end before the gateway
      // emits typed events for real. No-op in production builds.
      mockGroundingHandle.current?.cancel();
      if (isMockGroundingEnabled()) {
        mockGroundingHandle.current = runMockGroundingFor(
          userInput,
          handleStreamEvent
        );
      }

      // Build request with current graph state
      const request: InterviewRequest = {
        message: userInput,
        session_id: sessionId,
        current_graph_json: liveBpmnGraph ? JSON.stringify(liveBpmnGraph) : undefined,
      };

      // Stream the response
      await streamInterviewResponse(
        request,
        handleStreamEvent,
        abortController.current.signal
      );
      setIsProcessing(false);
    },
    retry: false,
    onError: (error: any) => {
      setIsProcessing(false);
      console.error("Interview stream error:", error);
      // Mark the message as failed with a specific error
      if (currentAgentMsgId.current) {
        updateMessage(currentAgentMsgId.current, {
          isStreaming: false,
          error: error.message || "NETWORK_OR_BACKEND_UNREACHABLE",
        });
      }
      // Mark the pending artifact as honestly failed — the durable
      // record of the failed turn, not a silent loss. Honest-
      // degradation as artifact state.
      if (currentArtifactIdRef.current) {
        useCanvasStore.getState().updateArtifact(currentArtifactIdRef.current, {
          status: "failed",
        });
      }
      currentAgentMsgId.current = null;
      currentArtifactIdRef.current = null;
    },
  });

  const sendMessage = useCallback(
    (userInput: string) => {
      if (mutation.isPending || !userInput.trim()) return;
      mutation.mutate(userInput.trim());
    },
    [mutation]
  );

  const cancelStream = useCallback(() => {
    abortController.current?.abort();
    mockGroundingHandle.current?.cancel();
    mockGroundingHandle.current = null;
  }, []);

  return {
    sendMessage,
    cancelStream,
    isProcessing: mutation.isPending,
    error: mutation.error,
  };
}
