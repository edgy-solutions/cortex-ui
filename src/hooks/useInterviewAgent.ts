import { useCallback, useRef, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { streamInterviewResponse } from "@/api/client";
import type {
  StreamEvent,
  InterviewRequest,
  PipelineStageKind,
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

/**
 * Map an existing untyped "status / think" label to a PipelineStageKind
 * when possible. This is a transitional bridge — the gateway today
 * emits free-text labels; later we'll receive typed `pipeline_stage`
 * events directly. Until then, we still want the dedup property:
 * recurring "Agent reasoning…" labels MUST collapse to a single row,
 * not accumulate. This map turns the most common labels into stable
 * kinds so the upsert dedups them.
 */
function classifyLegacyLabel(label: string): PipelineStageKind | "agent_reasoning" | null {
  const s = label.toLowerCase();
  if (s.includes("agent") && s.includes("reasoning")) return "agent_reasoning";
  if (s.includes("smolagent")) return "agent_reasoning";
  if (s.includes("plan")) return "understanding";
  if (s.includes("resolv") || s.includes("subject") || s.includes("understand"))
    return "locating";
  if (s.includes("verb") || s.includes("classif") || s.includes("action"))
    return "choosing_action";
  if (s.includes("query") || s.includes("retriev") || s.includes("search"))
    return "retrieving";
  if (s.includes("compos") || s.includes("respons") || s.includes("answer"))
    return "composing";
  return null;
}

/**
 * The real interview hook that connects to the backend streaming API.
 * Replaces useMockAgent when the backend is running.
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
    setActivePersonas,
    setIsProcessing,
    setPhase,
    addOntologyTerm,
    addDataBinding,
    upsertThinkingStep,
    primePipelineStages,
    setRouteDecision,
    setSources,
    setGraphTrace,
    resetTurnGrounding,
  } = useInterviewStore();

  const [sessionId] = useState(() => `session-${Date.now()}`);
  const abortController = useRef<AbortController | null>(null);
  const currentAgentMsgId = useRef<string | null>(null);
  const mockGroundingHandle = useRef<MockHandle | null>(null);


  /**
   * Helper used by `stream_end` and payload events to mark every still-
   * loading step as `done` without disturbing kind / startedAt. We read
   * the latest thinkingSteps off the store (not a ref) so we never drift.
   */
  const markAllStepsDone = useCallback(
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
            status: "done",
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
      // Allow context updates and the new typed grounding events to flow
      // even before an agent message exists (the gateway may emit them
      // out-of-order; we tolerate that rather than dropping signal).
      const isAlwaysAllowed =
        event.type === "status" ||
        event.type === "context_update" ||
        event.type === "final_payload" ||
        event.type === "ui_payload" ||
        event.type === "chat_message" ||
        event.type === "stream_end" ||
        event.type === "pipeline_stage" ||
        event.type === "route_decision" ||
        event.type === "sources" ||
        event.type === "graph_trace";
      if (!agentId && !isAlwaysAllowed) return;

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

        case "status": {
          if (!agentId) break;
          // Phase 0 dedup: route legacy "think" labels through the
          // upsert-by-kind dispatch. Recurring labels (e.g. "Agent
          // reasoning time 10s / 20s / 30s") now collapse to ONE row
          // whose label updates in place — NEVER accumulate.
          const kind =
            classifyLegacyLabel(event.label) ?? ("legacy" as const);
          if (event.action === "think") {
            upsertThinkingStep(agentId, {
              kind,
              label: event.label,
              status: "loading",
            });
          } else if (event.action === "found") {
            upsertThinkingStep(agentId, {
              kind,
              label: event.label,
              status: "done",
            });
          } else if (event.action === "error") {
            upsertThinkingStep(agentId, {
              kind,
              label: event.label,
              status: "error",
            });
          } else if (event.action === "plan" && event.personas) {
            setActivePersonas(event.personas);
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
          setRouteDecision(event.decision);
          break;

        case "sources":
          setSources(event.sources);
          break;

        case "graph_trace":
          setGraphTrace(event.nodes);
          break;

        case "chat_message": {
          if (agentId && event.data) {
            markAllStepsDone(agentId);
            updateMessage(agentId, {
              content: event.data.content,
              isStreaming: false,
            });
          }
          break;
        }

        case "ui_payload":
        case "final_payload": {
          // Engine F has returned the final orchestrated semantic payload.
          if (agentId) {
            markAllStepsDone(agentId);
            // Dispatch to Canvas Store
            if (event.payload?.components) {
              useCanvasStore
                .getState()
                .setCanvasContent(event.payload.components);
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
          setActivePersonas([]); // Clear assembly icons
          break;
        }

        case "stream_end": {
          if (agentId) {
            markAllStepsDone(agentId);
            updateMessage(agentId, { isStreaming: false });
          }
          currentAgentMsgId.current = null;
          break;
        }
      }
    },
    [
      updateMessage,
      setActivePersonas,
      addOntologyTerm,
      addDataBinding,
      upsertThinkingStep,
      setRouteDecision,
      setSources,
      setGraphTrace,
      markAllStepsDone,
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
      setActivePersonas([]);
      // Phase 0: wipe per-turn grounding state so the right-HUD doesn't
      // show stale routing decisions from a prior query while the new
      // one is in flight.
      resetTurnGrounding();

      // Add user message
      const userMsg: Message = {
        id: uid(),
        role: "user",
        content: userInput,
        isStreaming: false,
        timestamp: Date.now(),
      };
      addMessage(userMsg);

      // Create agent message placeholder
      const agentId = uid();
      currentAgentMsgId.current = agentId;

      const agentMsg: Message = {
        id: agentId,
        role: "agent",
        content: "",
        isStreaming: true,
        thinkingSteps: [],
        timestamp: Date.now(),
      };
      addMessage(agentMsg);

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
      currentAgentMsgId.current = null;
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
