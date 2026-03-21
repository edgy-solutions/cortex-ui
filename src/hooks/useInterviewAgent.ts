import { useCallback, useRef, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { streamInterviewResponse } from "@/api/client";
import type { StreamEvent, InterviewRequest } from "@/api/types";
import {
  useInterviewStore,
  type Message,
  type ThinkingStep,
} from "@/store/useInterviewStore";

import { useCanvasStore } from "@/store/useCanvasStore";

// ── Helpers ───────────────────────────────────────────────
let _id = 0;
const uid = () => `msg-${++_id}-${Date.now()}`;

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
    setUnresolvedPaths,
    setActivePersonas,
    setIsProcessing,
    setPhase,
    addOntologyTerm,
    addDataBinding,
  } = useInterviewStore();

  const [sessionId] = useState(() => `session-${Date.now()}`);
  const abortController = useRef<AbortController | null>(null);
  const currentAgentMsgId = useRef<string | null>(null);
  const thinkingSteps = useRef<ThinkingStep[]>([]);


  // Handle individual stream events
  const handleStreamEvent = useCallback(
    (event: StreamEvent) => {
      const agentId = currentAgentMsgId.current;
      if (!agentId && event.type !== "status" && event.type !== "context_update" && event.type !== "final_payload" && event.type !== "stream_end") {
        return;
      }

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
          const steps = [...thinkingSteps.current];
          
          if (event.action === "think") {
             // If there was a previous loading step, mark it as done (sequential flow)
             if (steps.length > 0 && steps[steps.length - 1].status === "loading") {
               steps[steps.length - 1] = { ...steps[steps.length - 1], status: "done" };
             }
             // Add new loading step
             const step: ThinkingStep = {
               id: `think-${steps.length}`,
               label: event.label,
               status: "loading",
             };
             steps.push(step);
          } else if (event.action === "found") {
             // Mark last step as'done' and update its label to the result
             if (steps.length > 0) {
               steps[steps.length - 1] = {
                 ...steps[steps.length - 1],
                 status: "done",
                 label: event.label,
               };
             }
          } else if (event.action === "error") {
             if (steps.length > 0) {
              steps[steps.length - 1] = { ...steps[steps.length - 1], status: "error", label: event.label };
             }
          }

          thinkingSteps.current = steps;
          updateMessage(agentId!, { thinkingSteps: [...steps] });

          if (event.action === "plan" && event.personas) {
            setActivePersonas(event.personas);
          }
          break;
        }

        case "final_payload": {
          // Engine F has returned the final orchestrated semantic payload.
          if (agentId) {
             // Ensure all thinking steps are marked as done
             const steps = thinkingSteps.current.map(s => ({ ...s, status: s.status === "loading" ? "done" : s.status }));
             thinkingSteps.current = steps;
             
             // Dispatch to Canvas Store
             if (event.payload?.components) {
               useCanvasStore.getState().setCanvasContent(event.payload.components);
             }

             // Update chat message with a receipt instead of the full payload
             updateMessage(agentId, { 
               content: `Artifacts generated: ${event.payload?.components?.length || 0} modules deployed to Canvas.`,
               isReceipt: true,
               thinkingSteps: steps, 
               isStreaming: false 
             });
          }
          
          setActivePersonas([]); // Clear assembly icons
          break;
        }

        case "stream_end": {
          // Mark the agent message as no longer streaming
          if (agentId) {
            updateMessage(agentId, { isStreaming: false, thinkingSteps: [...thinkingSteps.current] });
          }
          currentAgentMsgId.current = null;
          thinkingSteps.current = [];
          break;
        }
      }
    },
    [updateMessage, setPhase, setLiveBpmnGraph, setUnresolvedPaths, addOntologyTerm, addDataBinding]
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
      thinkingSteps.current = [];

      const agentMsg: Message = {
        id: agentId,
        role: "agent",
        content: "",
        isStreaming: true,
        thinkingSteps: [],
        timestamp: Date.now(),
      };
      addMessage(agentMsg);

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
  }, []);

  return {
    sendMessage,
    cancelStream,
    isProcessing: mutation.isPending,
    error: mutation.error,
  };
}
