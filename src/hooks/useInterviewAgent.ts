import { boundSlotsBody } from "@/api/boundSlots";
import { spokenAnswerBody, type SpokenAnswer } from "@/api/spokenAnswer";
import type { AnsweredWith } from "@/api/types";
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
import { usePersonaStore } from "@/store/usePersonaStore";
import {
  isMockGroundingEnabled,
  runMockGroundingFor,
  type MockHandle,
} from "@/lib/mockGroundingEmitter";

// Hop 3 of the projector build plan
// (docs/plans/projector-build-plan.md commit 0eda9f7 §4 Hop 3 Part 2).
//
// SSE handlers MUST NOT drive any Electric-covered field on the
// Artifact (routing, sources, graph_trace, rendered_output, status,
// durability_status, watermark, produced_by, resolved_intent — see
// ELECTRIC_COVERED_FIELDS in useCanvasStore.ts). Pre-Hop-3 this
// hook drove ALL of those from SSE events (route_decision, sources,
// graph_trace, ui_payload/final_payload, pipeline_error, stream_end,
// onError). Post-Hop-3, every one of those branches is a NO-OP for
// the artifact path; the cortex-bff Hop 1 writer persists the
// substrate state to Neo4j, the projector projects it, Electric
// delivers it to the canvas store. Part 2's absence-of-SSE probe
// asserts the provenance map confirms no sse:* tag touched any
// Electric-covered field.
//
// What this hook STILL does for the SSE turn:
//   - context_update     → ontology/binding HUD chips
//   - pipeline_error     → HUD step error indicator only
//   - pipeline_stage     → HUD step status
//   - chat_message       → agent message text (chat layer, not artifact)
//   - ui_payload/final_payload → receipt-text on the chat message
//                          (artifact rendered_output is Electric's)
//   - stream_end         → mark unconfirmed steps incomplete +
//                          clear the agent message's isStreaming
//   - onError            → mark the agent message with the error
//                          (the artifact stays in its locally-pending
//                          state until Electric delivers a terminal
//                          state, per [[feedback-trailing-steps-nonfatal]])

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
 *
 * Capture A per ADR-0025 / ADR-0026 step 6: `entitlement_source` defaults
 * to `"none"` here — the client truly doesn't know the origin (it's a
 * server-side fact) and step 6 made `"none"` the honest-empty state. The
 * Electric-synced server value (`"topaz"` | `"none"`) overwrites this on
 * first apply. Per `[[optimistic-defaults-are-dishonest]]`: do NOT default
 * to `"topaz"` — that would fabricate an entitlement origin the client
 * hasn't confirmed.
 */
function getProducedFor(): import("@/api/types").Artifact["produced_for"] {
  return {
    // Phase 1 placeholder; real user_id arrives when auth wires up.
    user_id: "sandbox-user",
    is_authenticated: false,
    user_persona: null,
    entitled_domains: null,
    // Honest default per [[optimistic-defaults-are-dishonest]]:
    // failure-revealing, overwritten on first Electric apply.
    entitlement_source: "none",
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
/**
 * One turn's outgoing content: the phrase, and whatever the reader's answer was — a PICK from
 * a menu, or typed WORDS where there was no menu to pick from. Never both, and never inside
 * the phrase.
 */
interface SendPayload {
  userInput: string;
  boundSlots?: Record<string, string>;
  spoken?: SpokenAnswer;
  /**
   * PRESENTATION ONLY. Written onto the pending artifact so the in-flight card can say what was
   * answered; deliberately NOT spread into the request body, because `label` is a display
   * string and the wire carries ids and words — nothing a person merely looked at.
   */
  answeredWith?: AnsweredWith;
}

export function useInterviewAgent() {
  const {
    liveBpmnGraph,
    addMessage,
    updateMessage,
    setLiveBpmnGraph,
    setIsProcessing,
    setAccessDenial,
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
        event.type === "graph_trace" ||
        event.type === "access_denied";
      if (!agentId && !isAlwaysAllowed) return;
      // Note: pre-Hop-3, this function used `const canvas = useCanvasStore.getState()`
      // as a convenience for updateArtifact calls. Hop 3 removed every
      // such call (the artifact data path is Electric-only). artifactId
      // is still tracked because future receipt-text logic refers to
      // it via the chat-layer's findIndex; the canvas-store getter has
      // moved to the (single) site that still needs it.

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
          // Hop 3: artifact.status is an ELECTRIC-COVERED field. SSE
          // does NOT drive it post-Hop-3 — the cortex-bff Hop 1 writer
          // marks the Neo4j artifact `failed` on pipeline_error and
          // Electric propagates the row. The HUD step above is
          // SSE-side because pipeline_stage events flow over SSE; the
          // artifact's substrate state flows over Electric. Two
          // distinct concerns, two distinct paths.
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
          // Hop 3: `routing`, `produced_by`, `resolved_intent` are
          // ALL Electric-covered. Pre-Hop-3, this handler refined
          // produced_by from its pending sentinel — now the cortex-bff
          // Hop 1 writer captures handled_by into the Neo4j artifact
          // and Electric propagates the refined row. SSE handler
          // intentionally NO-OPs for the artifact; pipeline_stage
          // events still flow over SSE for the HUD's reasoning
          // panel (handled elsewhere). Per Part 2's absence-of-SSE
          // claim, the provenance map must show route_decision
          // NEVER touched routing/produced_by/resolved_intent.
          //
          // MOCK-MODE OVERRIDE: in production the data flows through
          // Postgres+Electric. The mock-grounding emitter fires this
          // event client-side with no Postgres in the loop, so the
          // UI would never see routing data. When mock mode is on,
          // write directly to the canvas store — visual iteration
          // works without infra. Production path UNCHANGED.
          if (isMockGroundingEnabled() && artifactId) {
            useCanvasStore.getState().updateArtifact(
              artifactId,
              { routing: event.decision },
              "mock-grounding",
            );
          }
          break;

        case "sources":
          // Hop 3: `sources` is Electric-covered. Hop 1 writer
          // persists each Source as a (:Source) node and (:CITES) edge;
          // the projector denormalizes them into the projection's
          // `sources` JSONB column; Electric delivers it. SSE no-op.
          // MOCK-MODE OVERRIDE: see route_decision case above.
          if (isMockGroundingEnabled() && artifactId) {
            useCanvasStore.getState().updateArtifact(
              artifactId,
              { sources: event.sources },
              "mock-grounding",
            );
          }
          break;

        case "graph_trace":
          // Hop 3: `graph_trace` is Electric-covered. Same shape as
          // sources — persisted in Neo4j by Hop 1, projected by
          // Hop 2, delivered by Electric. SSE no-op.
          // MOCK-MODE OVERRIDE: see route_decision case above.
          if (isMockGroundingEnabled() && artifactId) {
            useCanvasStore.getState().updateArtifact(
              artifactId,
              {
                graph_trace: event.nodes,
                graph_trace_alternates: event.alternates ?? [],
              },
              "mock-grounding",
            );
          }
          break;

        case "access_denied":
          // Bug 2 — the data-plane can_read gate 403'd for this caller.
          // Store the structured denial so the answer surface can render an
          // access-denied state (NOT an empty chart / generic error) wired to
          // the HITL request-access flow. The gate's specific signal is what
          // keys the request, per the deny→request→grant→allow loop.
          setAccessDenial({
            denied_assets: event.denied_assets,
            subject: event.subject,
            domain: event.domain,
            message: event.message,
          });
          // Denial is a terminal answer for this turn — stop the spinner so
          // the surface flips from "processing" to the access-denied state.
          setIsProcessing(false);
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
            // Hop 3: `status` and `rendered_output` are BOTH
            // Electric-covered. The cortex-bff Hop 1 writer captures
            // the rendered output into the Neo4j artifact at the
            // final_payload point and Electric delivers it. SSE
            // handler no-ops on the artifact; only the receipt text
            // for the chat message (a non-Artifact concern) fires.
            //
            // MOCK-MODE OVERRIDE: in production the rendered_output
            // and status patches flow through Postgres+Electric. The
            // mock-grounding emitter fires this event client-side
            // with no Postgres in the loop, so the canvas's artifact
            // would stay stuck at "Working on it..." forever. When
            // mock mode is on, write directly to the canvas store —
            // visual iteration works without infra. Production path
            // unchanged. (Same shape as the route_decision / sources
            // / graph_trace overrides above.)
            if (
              isMockGroundingEnabled() &&
              artifactId &&
              event.payload
            ) {
              useCanvasStore.getState().updateArtifact(
                artifactId,
                {
                  rendered_output: event.payload,
                  status: "complete",
                  durability_status: "durable",
                },
                "mock-grounding",
              );
            }
            const fresh = useCanvasStore.getState();
            const artifactNumber = artifactId
              ? fresh.artifacts.findIndex((a) => a.id === artifactId) + 1
              : 0;
            updateMessage(agentId, {
              content: `Artifact #${artifactNumber} deployed to Canvas.`,
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
          // Hop 3: artifact.status is Electric-covered. Pre-Hop-3,
          // stream_end would force a pending→complete transition
          // here as the "honest finalization" of the responsiveness
          // flow. Post-Hop-3 the cortex-bff Hop 1 writer is the
          // single decider of artifact terminal state (complete /
          // failed / persistence_*), and Electric carries that state
          // to the canvas. SSE no-op on the artifact; the agent
          // message's isStreaming flip above is a chat-layer concern
          // and stays.
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
    mutationFn: async ({ userInput, boundSlots, spoken, answeredWith }: SendPayload) => {
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
        // WHAT THE CLIENT SENT, for the in-flight card. Presentation only — it is not part of
        // the request body, which carries ids and words and nothing a person merely looked at.
        answered_with: answeredWith ?? null,
      });

      // Phase 0 instant-pre-render: seed all 5 pipeline stages as
      // `pending` (first stage `loading`) on the agent message the
      // moment the query fires. The panel never appears empty — users
      // see "I heard you" structure before any gateway event arrives.
      primePipelineStages(agentId);

      // Dev: if mock-grounding is enabled, the mock OWNS the timeline.
      // It emits pipeline_stage, route_decision, sources, graph_trace,
      // final_payload (when applicable), and stream_end. The real
      // backend call is skipped in this mode — otherwise a no-backend
      // dev environment would error out at streamInterviewResponse and
      // mutation.onError would mark the artifact failed regardless of
      // the mock's intended scenario. Phase 2 scenario triggers
      // (@happy / @fail / @partial-no-payload / @partial-no-grounding /
      // @empty) live in the mock; see mockGroundingEmitter docstring.
      mockGroundingHandle.current?.cancel();
      if (isMockGroundingEnabled()) {
        mockGroundingHandle.current = runMockGroundingFor(
          userInput,
          handleStreamEvent
        );
        // Resolve the mutation cleanly so React Query doesn't fire
        // onError (which would override the mock's intended artifact
        // status). Processing flips off when the mock's stream_end
        // fires; until then the artifact is `pending` honestly.
        setIsProcessing(false);
        return;
      }

      // Build request with current graph state. Pass the locally-
      // generated artifactId so cortex-bff persists with the SAME id —
      // when Electric streams the real artifact back, the cortex-ui
      // store's `electricUpsertArtifact` finds the pending row by id
      // and merges in place (otherwise pending stays foregrounded
      // empty while the real one sits unviewed in the collection).
      // ADR-0026 step 4: per-prompt persona/domain override from the
      // picker. Only attach when the user has a matrix (picker
      // renders); on legacy JWT-claim clusters `selectedPersona` is
      // null and we send neither field, letting cortex-bff fall back
      // to the JWT-claim path.
      const personaSelection = usePersonaStore.getState();
      const request: InterviewRequest = {
        message: userInput,
        // Only when a pick was made. An empty object is NOT the same as absent: the server
        // branches on the field being None, and `{}` is a claim that a menu was answered.
        // The decision lives in a function so it can be sealed; a conditional spread here
        // could not be.
        ...boundSlotsBody(boundSlots),
        // And the same, for an ask that had no menu. A separate function and separate fields
        // because a typed answer is not a pick: `validate_bound_slots` refuses a no-menu slot
        // by design, so routing words through that path would 422 or default silently.
        ...spokenAnswerBody(spoken),
        session_id: sessionId,
        current_graph_json: liveBpmnGraph ? JSON.stringify(liveBpmnGraph) : undefined,
        artifact_id: artifactId,
        ...(personaSelection.hasEntitlements() && personaSelection.selectedPersona
          ? {
              active_persona: personaSelection.selectedPersona,
              active_domains: personaSelection.selectedDomains,
            }
          : {}),
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
      // Hop 3: artifact.status is Electric-covered. Pre-Hop-3, the
      // network-failure case would set status=failed locally. Now:
      //   - If the SSE stream itself failed (network/backend
      //     unreachable), the cortex-bff Hop 1 write probably hasn't
      //     run either; the artifact stays in its locally-created
      //     `pending` + `persistence_pending` state. That IS the
      //     honest state per Decision 0's decouple-with-honest-
      //     failure-state ruling — a stuck-pending artifact is honest
      //     about what the system knows (it never heard back), not a
      //     forced-to-failed lie.
      //   - If the SSE stream completed but cortex-bff's Neo4j write
      //     failed, the Hop 1 writer records durability_status=
      //     persistence_failed AND status=complete/failed per its
      //     own state machine; Electric delivers that state.
      // Either way, SSE no longer drives the artifact.status field.
      currentAgentMsgId.current = null;
      currentArtifactIdRef.current = null;
    },
  });

  /** What one turn carries. An answer rides BESIDE the phrase, never inside it. */
  const sendMessage = useCallback(
    (
      userInput: string,
      boundSlots?: Record<string, string>,
      spoken?: SpokenAnswer,
      answeredWith?: AnsweredWith,
    ) => {
      if (mutation.isPending || !userInput.trim()) return;
      mutation.mutate({ userInput: userInput.trim(), boundSlots, spoken, answeredWith });
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
