import { create } from "zustand";
import type {
  BPMNGraphUpdate,
  SemanticUIContainer,
  PipelineStageKind,
} from "@/api/types";
import { PIPELINE_STAGES } from "@/api/types";

// ── Types ──────────────────────────────────────────────────
export type MessageRole = "user" | "agent";
export type InterviewPhase = "active" | "blueprint" | "compiling" | "complete";

/**
 * ThinkingStep — a single row in the left-stream ThinkingCard.
 *
 * `kind` is the stable identity for upsert-by-kind dispatch (Phase 0
 * dedup fix). Two kinds of step:
 *   - PipelineStageKind: the 5 known stages from the routing substrate
 *     (understanding, locating, choosing_action, retrieving, composing).
 *     These pre-render as `pending` the instant a query fires so the
 *     panel never appears empty.
 *   - "legacy": used by the in-process useMockAgent helper for free-text
 *     thinking-step rows that don't map to a known pipeline stage.
 *     Production traffic NEVER produces this kind any more — the gateway
 *     emits typed pipeline_stage events post Option A clean cut
 *     (2026-06-22). Kept only for the mock-agent dev path.
 *
 * The `kind` field is the discriminator for the upsert. `id` is still
 * used as a React key but does NOT govern identity any more.
 */
export type ThinkingStepKind = PipelineStageKind | "legacy";

export interface ThinkingStep {
  id: string;
  kind: ThinkingStepKind;
  label: string;
  /**
   * Pipeline-stage status, by reception of a positive signal:
   *  - pending    : pre-rendered structure, no signal received yet
   *  - loading    : `pipeline_stage status=started` received
   *  - done       : `pipeline_stage status=completed` received (positive signal of success)
   *  - error      : `pipeline_error` received (positive signal of failure)
   *  - incomplete : stream ended without ever receiving a status for this stage —
   *                 the system did NOT confirm completion. NEVER synthesized to
   *                 "done" by the UI; founding principle is "surface what the
   *                 pipeline did, never synthesize." Visually distinct from
   *                 pending (which still means "still running") and from done
   *                 (positive completion signal).
   *
   * The fifth state was added 2026-06-25 to close the silent-degrade
   * composition class: when Engine O can't talk to LiteLLM and downstream
   * layers silently degrade to "did SOMETHING," the gateway's stream still
   * ends — and historically the UI promoted every still-pending stage to
   * "done" inside markAllStepsDone, manufacturing green checkmarks for
   * stages the pipeline never confirmed. That synthesis is the disease;
   * "incomplete" is the cure (positive third state for "we don't know").
   */
  status: "pending" | "loading" | "done" | "error" | "incomplete";
  /** Set when the step entered `loading` (used for elapsed-time display). */
  startedAt?: number;
  /** Reported by event; if absent, ThinkingCard derives from startedAt. */
  elapsedMs?: number;
}

export interface Message {
  id: string;
  role: MessageRole;
  content: string;
  /** For agent messages: whether the text is still being streamed */
  isStreaming: boolean;
  /** Optional thinking steps shown before the message body */
  thinkingSteps?: ThinkingStep[];
  /** Optional network or backend error message */
  error?: string;
  /** True if this message should render as a subtle receipt card */
  isReceipt?: boolean;
  timestamp: number;
  /**
   * For agent messages: the id of the durable `Artifact` this message
   * was produced WITH. Bidirectional reference back from the
   * `useCanvasStore` collection — `Artifact.message_id` points the
   * other way.
   *
   * Per ADR-0023 (Phase 1 acceptance #3), `Message` and `Artifact` are
   * STRUCTURALLY DISTINCT objects. `Message` = chat-transcript-turn
   * (what was said). `Artifact` = answerer's-output-object (the
   * durable grounded answer). They reference each other by id; they
   * are NOT collapsed. Do NOT add artifact fields (rendered_output,
   * sources, routing, graph_trace, valid_as_of, ...) onto `Message`
   * for convenience — that collapses two distinct concepts into one
   * slot, same class as the persona-conflation and the canvas-
   * overwrite the artifact-collection foundation closes.
   */
  artifactId?: string;
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

/**
 * GroundingDisplayMode — Phase 5 plain/detailed toggle.
 * "plain" = stages + routing card + sources (the default trust signals).
 * "detailed" = above PLUS graph trace + raw JSON expander.
 * Persisted in localStorage so per-user preference survives reload.
 */
export type GroundingDisplayMode = "plain" | "detailed";

const GROUNDING_MODE_KEY = "cortex-grounding-display-mode";
function readPersistedMode(): GroundingDisplayMode {
  if (typeof window === "undefined") return "plain";
  try {
    const v = window.localStorage.getItem(GROUNDING_MODE_KEY);
    return v === "detailed" ? "detailed" : "plain";
  } catch {
    return "plain";
  }
}

interface InterviewState {
  messages: Message[];
  phase: InterviewPhase;
  ontologyTerms: OntologyTerm[];
  dataBindings: DataBinding[];
  /** Live BPMN graph state from the backend stream */
  liveBpmnGraph: BPMNGraphUpdate | SemanticUIContainer | null;
  /** Dead-end paths requiring user resolution */
  unresolvedPaths: string[];
  isProcessing: boolean;

  // ── Grounding panel state (Phase 0 typed-union driven) ──
  //
  // Per ADR-0023 (Phase 1, 2026-06-26): the per-turn `routeDecision`,
  // `sources`, `graphTrace` SINGLETONS that used to live here are
  // GONE. They now live on the durable `Artifact` row in
  // `useCanvasStore.artifacts` — keyed by the artifact's id, not by
  // "the most recent turn." This closes the canvas-overwrite class
  // for grounding state too: prior artifacts' routing/sources/
  // graph_trace persist on their own rows; new turns don't wipe them.
  //
  // HUD components (`RoutingDecision`, `SourcesTrail`, `GraphTrace`)
  // now read from `useCurrentArtifact()` via the canvas store's
  // derived selectors. See ADR-0023 acceptance #2 / #3 for the why.

  /** Plain / detailed display preference. Persists per-user. */
  groundingDisplayMode: GroundingDisplayMode;

  // Actions
  addMessage: (msg: Message) => void;
  updateMessage: (id: string, patch: Partial<Message>) => void;
  /**
   * Phase 0 dedup-fix dispatch. Upserts a ThinkingStep on the agent
   * message by `kind`: if a step with the same kind exists, update it
   * in place (label, status, elapsedMs). Otherwise append.
   *
   * This is the single entry point through which left-stream stage
   * updates flow — `useInterviewAgent` calls it. Other message types
   * (chat content, errors, payload receipts) go through `updateMessage`
   * and are not affected by the upsert, so the dedup fix CANNOT
   * accidentally collapse distinct messages (architect's caution).
   */
  upsertThinkingStep: (
    agentMsgId: string,
    step: Omit<ThinkingStep, "id"> & { id?: string }
  ) => void;
  /**
   * Pre-render the 5 pipeline stages as `pending` on the agent message
   * the instant a query fires. The first stage is marked `loading`.
   * This is the "panel never appears empty" detail — instant
   * "I heard you" perceived responsiveness.
   */
  primePipelineStages: (agentMsgId: string) => void;
  setPhase: (phase: InterviewPhase) => void;
  addOntologyTerm: (term: OntologyTerm) => void;
  addDataBinding: (binding: DataBinding) => void;
  setLiveBpmnGraph: (graph: BPMNGraphUpdate | SemanticUIContainer | null) => void;
  setUnresolvedPaths: (paths: string[]) => void;
  setIsProcessing: (isProcessing: boolean) => void;
  /**
   * Wipe per-turn UI-only grounding state. Currently this means the
   * ontology terms + data bindings — they are transient UI
   * accumulators tied to the live turn, NOT artifact state. The
   * routing/sources/graph_trace singletons that used to be reset here
   * are gone — they live on the artifact row now and persist per-
   * artifact, not per-turn.
   *
   * Called at the START of a new turn by `useInterviewAgent`.
   * Replaces the old `resetTurnGrounding` (which conflated transient
   * UI with per-turn grounding singletons that no longer exist).
   */
  resetTurnGroundingUI: () => void;
  setGroundingDisplayMode: (mode: GroundingDisplayMode) => void;
  reset: () => void;
}

const initialState = {
  messages: [] as Message[],
  phase: "active" as InterviewPhase,
  ontologyTerms: [] as OntologyTerm[],
  dataBindings: [] as DataBinding[],
  liveBpmnGraph: null as BPMNGraphUpdate | SemanticUIContainer | null,
  unresolvedPaths: [] as string[],
  isProcessing: false,
  groundingDisplayMode: readPersistedMode(),
};

// Stable id-generator for ThinkingSteps so we can keep React-key stability
// even when the same step is upserted multiple times.
let _stepIdSeq = 0;
const _nextStepId = (kind: ThinkingStepKind) =>
  `step-${kind}-${++_stepIdSeq}-${Date.now()}`;

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

  /**
   * Upsert-by-kind dispatch — the Phase 0 dedup fix.
   *
   * Architect's caution preserved: this function only operates on the
   * `thinkingSteps` array of the named agent message. It cannot touch
   * other message content, errors, or payloads. The 1:1 mapping
   * "one kind → one row" is enforced by find-first semantics: the
   * first existing step with matching `kind` is updated; if no match,
   * append.
   *
   * Critically: this is the ONLY way ThinkingCard rows get written
   * during the normal flow. So a duplicate "agent_reasoning" event
   * every 10s collapses to a single row whose label/elapsedMs updates
   * in place. No more accumulation.
   */
  upsertThinkingStep: (agentMsgId, partial) =>
    set((state) => ({
      messages: state.messages.map((m) => {
        if (m.id !== agentMsgId) return m;
        const existing = m.thinkingSteps ?? [];
        const idx = existing.findIndex((s) => s.kind === partial.kind);
        if (idx >= 0) {
          // Update in place. Preserve startedAt unless explicitly given.
          const prev = existing[idx];
          const next: ThinkingStep = {
            ...prev,
            ...partial,
            id: prev.id, // keep the React key stable
            startedAt:
              partial.startedAt ??
              prev.startedAt ??
              (partial.status === "loading" ? Date.now() : prev.startedAt),
          };
          const out = existing.slice();
          out[idx] = next;
          return { ...m, thinkingSteps: out };
        }
        // No existing step of this kind — append.
        const fresh: ThinkingStep = {
          id: partial.id ?? _nextStepId(partial.kind),
          kind: partial.kind,
          label: partial.label,
          status: partial.status,
          startedAt:
            partial.startedAt ??
            (partial.status === "loading" ? Date.now() : undefined),
          elapsedMs: partial.elapsedMs,
        };
        return { ...m, thinkingSteps: [...existing, fresh] };
      }),
    })),

  /**
   * Phase 0 instant-pre-render. The 5 pipeline stages are seeded as
   * `pending` on the named agent message, with the FIRST stage already
   * `loading` so the user sees motion immediately. This is the
   * "panel never appears empty" detail the architect elevated to
   * a tonight-must-have.
   */
  primePipelineStages: (agentMsgId) =>
    set((state) => ({
      messages: state.messages.map((m) => {
        if (m.id !== agentMsgId) return m;
        const seeded: ThinkingStep[] = PIPELINE_STAGES.map((stg, i) => ({
          id: _nextStepId(stg.kind),
          kind: stg.kind,
          label: stg.label,
          status: i === 0 ? "loading" : "pending",
          startedAt: i === 0 ? Date.now() : undefined,
        }));
        return { ...m, thinkingSteps: seeded };
      }),
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

  setLiveBpmnGraph: (graph) => set({ liveBpmnGraph: graph }),

  setUnresolvedPaths: (paths) => set({ unresolvedPaths: paths }),

  setIsProcessing: (isProcessing) => set({ isProcessing }),

  // ── Per-turn UI-only reset ──
  //
  // Wipes the transient UI accumulators (ontology terms + data
  // bindings) at the start of a new turn so the panel shows the
  // CURRENT turn's, not an accumulation across the session. The
  // routing / sources / graph_trace per-turn singletons that used to
  // be reset here are GONE — they live on the artifact row now and
  // persist per-artifact, not per-turn. See ADR-0023 Phase 1.
  resetTurnGroundingUI: () =>
    set({
      ontologyTerms: [],
      dataBindings: [],
    }),
  setGroundingDisplayMode: (mode) => {
    if (typeof window !== "undefined") {
      try {
        window.localStorage.setItem(GROUNDING_MODE_KEY, mode);
      } catch {
        /* ignore quota / private mode */
      }
    }
    set({ groundingDisplayMode: mode });
  },

  reset: () =>
    set({
      ...initialState,
      // Preserve the per-user grounding-mode preference across resets;
      // it's a session-level pref, not turn state.
      groundingDisplayMode: readPersistedMode(),
    }),
}));
