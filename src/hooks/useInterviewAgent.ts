import { useCallback, useRef, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { streamInterviewResponse } from "@/api/client";
import type { StreamEvent, InterviewRequest } from "@/api/types";
import {
  useInterviewStore,
  type Message,
  type ThinkingStep,
} from "@/store/useInterviewStore";

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
    messages,
    ontologyTerms,
    dataBindings,
    addMessage,
    updateMessage,
    addOntologyTerm,
    addDataBinding,
    setPhase,
  } = useInterviewStore();

  const [sessionId] = useState(() => `session-${Date.now()}`);
  const abortController = useRef<AbortController | null>(null);
  const currentAgentMsgId = useRef<string | null>(null);
  const thinkingSteps = useRef<ThinkingStep[]>([]);

  // Build context from current store state
  const buildContext = useCallback(
    () => ({
      ontology_terms: ontologyTerms.map((t) => ({
        category: t.category,
        label: t.label,
      })),
      data_bindings: dataBindings.map((b) => ({
        model: b.model,
        schema: b.schema,
      })),
    }),
    [ontologyTerms, dataBindings]
  );

  // Handle individual stream events
  const handleStreamEvent = useCallback(
    (event: StreamEvent) => {
      const agentId = currentAgentMsgId.current;
      if (!agentId && event.type !== "interview_complete" && event.type !== "stream_end") {
        return;
      }

      switch (event.type) {
        case "text": {
          // Append text to the current agent message
          const currentMsg = messages.find((m) => m.id === agentId);
          const newContent = (currentMsg?.content ?? "") + event.content;
          updateMessage(agentId!, { content: newContent });
          break;
        }

        case "ontology_lookup": {
          // Add a "loading" thinking step
          const step: ThinkingStep = {
            id: `think-${thinkingSteps.current.length}`,
            label: `Scanning IOF-MRO Ontology for ${event.label}...`,
            status: "loading",
          };
          thinkingSteps.current = [...thinkingSteps.current, step];
          updateMessage(agentId!, { thinkingSteps: [...thinkingSteps.current] });
          break;
        }

        case "ontology_found": {
          // Mark the last thinking step as done, add the result
          const steps = [...thinkingSteps.current];
          if (steps.length > 0) {
            steps[steps.length - 1] = {
              ...steps[steps.length - 1],
              status: "done",
              label: `Found Concept: ${event.label}`,
            };
          }
          thinkingSteps.current = steps;
          updateMessage(agentId!, { thinkingSteps: [...steps] });

          // Add to ontology terms
          addOntologyTerm({
            id: uid(),
            category: event.category,
            label: event.label,
          });
          break;
        }

        case "datahub_query": {
          // Add a "querying" thinking step
          const step: ThinkingStep = {
            id: `think-${thinkingSteps.current.length}`,
            label: `Querying DataHub for ${event.model}...`,
            status: "loading",
          };
          thinkingSteps.current = [...thinkingSteps.current, step];
          updateMessage(agentId!, { thinkingSteps: [...thinkingSteps.current] });
          break;
        }

        case "datahub_result": {
          // Mark the last thinking step as done
          const steps = [...thinkingSteps.current];
          if (steps.length > 0) {
            steps[steps.length - 1] = {
              ...steps[steps.length - 1],
              status: "done",
              label: `Bound: ${event.model} (${event.schema})`,
            };
          }
          thinkingSteps.current = steps;
          updateMessage(agentId!, { thinkingSteps: [...steps] });

          // Add to data bindings
          addDataBinding({
            id: uid(),
            model: event.model,
            schema: event.schema,
            healthy: event.healthy,
          });
          break;
        }

        case "interview_complete": {
          // Transition to blueprint phase
          setPhase("blueprint");
          break;
        }

        case "stream_end": {
          // Mark the agent message as no longer streaming
          if (agentId) {
            updateMessage(agentId, { isStreaming: false });
          }
          currentAgentMsgId.current = null;
          thinkingSteps.current = [];
          break;
        }
      }
    },
    [messages, addOntologyTerm, addDataBinding, updateMessage, setPhase]
  );

  // Main mutation that handles the streaming request
  const mutation = useMutation({
    mutationFn: async (userInput: string) => {
      // Cancel any existing stream
      abortController.current?.abort();
      abortController.current = new AbortController();

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

      // Build request
      const request: InterviewRequest = {
        message: userInput,
        session_id: sessionId,
        context: buildContext(),
      };

      // Stream the response
      await streamInterviewResponse(
        request,
        handleStreamEvent,
        abortController.current.signal
      );
    },
    onError: (error) => {
      console.error("Interview stream error:", error);
      // Mark the message as done even on error
      if (currentAgentMsgId.current) {
        updateMessage(currentAgentMsgId.current, {
          isStreaming: false,
          content:
            useInterviewStore.getState().messages.find(
              (m) => m.id === currentAgentMsgId.current
            )?.content + "\n\n[Connection error - please try again]",
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
