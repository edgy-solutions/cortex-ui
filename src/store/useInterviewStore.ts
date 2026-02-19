import { create } from "zustand";

// ── Types ──────────────────────────────────────────────────
export type MessageRole = "user" | "agent";
export type InterviewPhase = "active" | "blueprint" | "compiling" | "complete";

export interface ThinkingStep {
  id: string;
  label: string;
  status: "loading" | "done" | "error";
}

export interface Message {
  id: string;
  role: MessageRole;
  content: string;
  /** For agent messages: whether the text is still being streamed */
  isStreaming: boolean;
  /** Optional thinking steps shown before the message body */
  thinkingSteps?: ThinkingStep[];
  timestamp: number;
}

export interface OntologyTerm {
  id: string;
  category: string; // e.g. "Asset", "Concept", "Process"
  label: string;
}

export interface DataBinding {
  id: string;
  model: string;
  schema: string;
  healthy: boolean;
}

interface InterviewState {
  messages: Message[];
  phase: InterviewPhase;
  ontologyTerms: OntologyTerm[];
  dataBindings: DataBinding[];

  // Actions
  addMessage: (msg: Message) => void;
  updateMessage: (id: string, patch: Partial<Message>) => void;
  setPhase: (phase: InterviewPhase) => void;
  addOntologyTerm: (term: OntologyTerm) => void;
  addDataBinding: (binding: DataBinding) => void;
  reset: () => void;
}

const initialState = {
  messages: [] as Message[],
  phase: "active" as InterviewPhase,
  ontologyTerms: [] as OntologyTerm[],
  dataBindings: [] as DataBinding[],
};

export const useInterviewStore = create<InterviewState>((set) => ({
  ...initialState,

  addMessage: (msg) =>
    set((state) => ({ messages: [...state.messages, msg] })),

  updateMessage: (id, patch) =>
    set((state) => ({
      messages: state.messages.map((m) =>
        m.id === id ? { ...m, ...patch } : m
      ),
    })),

  setPhase: (phase) => set({ phase }),

  addOntologyTerm: (term) =>
    set((state) => {
      // Prevent duplicates by label
      if (state.ontologyTerms.some((t) => t.label === term.label)) return state;
      return { ontologyTerms: [...state.ontologyTerms, term] };
    }),

  addDataBinding: (binding) =>
    set((state) => {
      if (state.dataBindings.some((b) => b.model === binding.model))
        return state;
      return { dataBindings: [...state.dataBindings, binding] };
    }),

  reset: () => set(initialState),
}));
