import { useCallback, useRef } from "react";
import {
  useInterviewStore,
  type Message,
  type ThinkingStep,
  type OntologyTerm,
  type DataBinding,
} from "@/store/useInterviewStore";

// ── Helpers ───────────────────────────────────────────────
let _id = 0;
const uid = () => `msg-${++_id}-${Date.now()}`;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// ── Keyword → response mapping ───────────────────────────
interface MockResponse {
  thinkingSteps: Omit<ThinkingStep, "id">[];
  text: string;
  ontologyTerms?: Omit<OntologyTerm, "id">[];
  dataBindings?: Omit<DataBinding, "id">[];
}

function getResponseForInput(input: string): MockResponse {
  const lower = input.toLowerCase();

  if (lower.includes("engine") || lower.includes("turbine")) {
    return {
      thinkingSteps: [
        { label: "Scanning IOF-MRO Ontology...", status: "loading" },
        { label: "Found Concept: iof:RotatingEquipment", status: "done" },
        {
          label: "Querying DataHub for stg_engine_telemetry...",
          status: "loading",
        },
      ],
      text: "I've identified the engine as a Rotating Equipment asset in the IOF-MRO ontology. The telemetry data is available through the stg_engine_telemetry model in DataHub. This model captures vibration signatures, temperature readings, and RPM data. Shall I bind this to the workflow?",
      ontologyTerms: [
        { category: "Asset", label: "Engine" },
        { category: "Concept", label: "iof:RotatingEquipment" },
      ],
      dataBindings: [
        { model: "stg_engine_telemetry", schema: "staging", healthy: true },
      ],
    };
  }

  if (lower.includes("damage") || lower.includes("failure")) {
    return {
      thinkingSteps: [
        { label: "Scanning IOF-MRO Ontology...", status: "loading" },
        { label: "Found Concept: iof:ImpactDamage", status: "done" },
        {
          label: "Querying DataHub for stg_maintenance_logs...",
          status: "loading",
        },
      ],
      text: "Impact damage events are tracked through the iof:ImpactDamage concept. I found maintenance log data in stg_maintenance_logs which correlates failure modes with inspection records. The data shows a 98.7% completeness score. Want me to add a failure prediction node?",
      ontologyTerms: [
        { category: "Concept", label: "iof:ImpactDamage" },
        { category: "Process", label: "FailureMode" },
      ],
      dataBindings: [
        { model: "stg_maintenance_logs", schema: "staging", healthy: true },
        { model: "dim_failure_modes", schema: "warehouse", healthy: true },
      ],
    };
  }

  if (lower.includes("schedule") || lower.includes("maintenance")) {
    return {
      thinkingSteps: [
        { label: "Scanning IOF-MRO Ontology...", status: "loading" },
        {
          label: "Found Concept: iof:MaintenanceSchedule",
          status: "done",
        },
        {
          label: "Querying DataHub for fct_work_orders...",
          status: "loading",
        },
      ],
      text: "Maintenance scheduling maps to iof:MaintenanceSchedule. I've linked it to the fct_work_orders fact table which tracks planned vs. actual maintenance windows. The current backlog shows 47 open work orders. Should I integrate this into the pipeline?",
      ontologyTerms: [
        { category: "Process", label: "MaintenanceSchedule" },
        { category: "Concept", label: "iof:MaintenanceSchedule" },
      ],
      dataBindings: [
        { model: "fct_work_orders", schema: "warehouse", healthy: true },
      ],
    };
  }

  // Default response
  return {
    thinkingSteps: [
      { label: "Scanning IOF-MRO Ontology...", status: "loading" },
      { label: "No direct ontology match found", status: "done" },
    ],
    text: `I understand you're interested in "${input}". Let me map this to our data mesh. Could you provide more context? For example, mention specific assets (engines, turbines), failure modes, or maintenance schedules so I can bind the correct ontology concepts and data models.`,
    ontologyTerms: [],
    dataBindings: [],
  };
}

// ── Hook ──────────────────────────────────────────────────
export function useMockAgent() {
  const {
    addMessage,
    updateMessage,
    addOntologyTerm,
    addDataBinding,
    setPhase,
  } = useInterviewStore();
  const isProcessing = useRef(false);

  const sendMessage = useCallback(
    async (userInput: string) => {
      if (isProcessing.current || !userInput.trim()) return;
      isProcessing.current = true;

      // 1. Add user message
      const userMsg: Message = {
        id: uid(),
        role: "user",
        content: userInput,
        isStreaming: false,
        timestamp: Date.now(),
      };
      addMessage(userMsg);

      // 2. Get mock response
      const response = getResponseForInput(userInput);

      // 3. Create agent message placeholder with thinking steps
      const agentId = uid();
      const thinkingSteps: ThinkingStep[] = response.thinkingSteps.map(
        (s, i) => ({
          ...s,
          id: `think-${i}`,
          status: "loading" as const,
        })
      );

      const agentMsg: Message = {
        id: agentId,
        role: "agent",
        content: "",
        isStreaming: true,
        thinkingSteps,
        timestamp: Date.now(),
      };
      addMessage(agentMsg);

      // 4. Simulate thinking steps one by one
      for (let i = 0; i < response.thinkingSteps.length; i++) {
        await sleep(800 + Math.random() * 600);
        const updated = thinkingSteps.map((s, j) => ({
          ...s,
          status:
            j <= i
              ? response.thinkingSteps[j].status
              : ("loading" as const),
        }));
        updateMessage(agentId, { thinkingSteps: updated });
      }

      await sleep(400);

      // 5. Stream text character-by-character
      let streamed = "";
      for (const char of response.text) {
        streamed += char;
        updateMessage(agentId, { content: streamed });
        await sleep(12 + Math.random() * 18);
      }

      updateMessage(agentId, { isStreaming: false });

      // 6. Add ontology terms and data bindings
      for (const term of response.ontologyTerms ?? []) {
        await sleep(200);
        addOntologyTerm({ ...term, id: uid() });
      }
      for (const binding of response.dataBindings ?? []) {
        await sleep(150);
        addDataBinding({ ...binding, id: uid() });
      }

      // 7. Check if we should end the interview (after 4+ exchanges)
      const msgs = useInterviewStore.getState().messages;
      const agentMsgCount = msgs.filter((m) => m.role === "agent").length;
      if (agentMsgCount >= 4) {
        setPhase("blueprint");
      }

      isProcessing.current = false;
    },
    [addMessage, updateMessage, addOntologyTerm, addDataBinding, setPhase]
  );

  return { sendMessage, isProcessing: isProcessing.current };
}
