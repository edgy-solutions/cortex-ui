import { create } from "zustand";
import type { Artifact, RouteDecision, Source, GraphTraceNode } from "@/api/types";

/**
 * Canvas store — the artifact-collection foundation per ADR-0023.
 *
 * This store replaces the previous single-slot `activeComponents`
 * shape (which was `[[canvas-overwrite-lies]]` literally in source:
 * every new turn overwrote the previous answer, the canvas could
 * only ever show "the latest"). The new shape is a COLLECTION of
 * durable `Artifact` objects with a `currentArtifactId` foregrounded.
 *
 * Phase 1 acceptance criteria embedded in the contract:
 *
 *   - #1 (Artifact shape): the collection holds full ADR-0023
 *     `Artifact` rows including `valid_as_of`, `valid_until`,
 *     `produced_for` (with nullable persona/entitlement slots),
 *     `produced_by`. The Artifact type itself enforces this; the
 *     store just holds rows.
 *
 *   - #2 (update-in-place): the store exposes BOTH
 *     `createPendingArtifact` (append a pending row at turn start —
 *     instant responsiveness) AND `updateArtifact` (patch in place as
 *     pipeline events arrive — pending→complete TRANSITIONS, does NOT
 *     replace). An append-only store would either duplicate
 *     (pending + complete as separate rows) or lose the
 *     responsiveness. Both methods are exercised by the
 *     create-pending → update-complete flow in `useInterviewAgent`.
 *
 *   - #3 (Message ≠ Artifact): the store knows nothing about
 *     `Message`. Artifacts reference messages by `message_id`;
 *     messages reference artifacts by `artifactId`. They live in
 *     different stores, intentionally — collapsing them is the
 *     concept-conflation trap acceptance #3 prevents.
 *
 * Monday+: this store becomes a read-through cache over the
 * Electric-synced projection from Neo4j. `createPendingArtifact` /
 * `updateArtifact` become local-write-then-await-sync. The Artifact
 * type stays put; only the source-of-truth path changes.
 */
interface CanvasState {
  /**
   * The durable artifact collection. Append-and-update, never
   * overwrite. The canvas is a VIEW over this collection.
   */
  artifacts: Artifact[];

  /**
   * The foregrounded artifact id — what the canvas renders right now.
   * Phase 1: usually the most-recently-created one. Future UI metaphor
   * (tabs / projects / free-spatial — deferred per ADR-0023) decides
   * how the user selects among artifacts; the data shape supports any
   * of those metaphors.
   */
  currentArtifactId: string | null;

  /** UI affordance: the canvas reveals (animates in) when content arrives. */
  isRevealing: boolean;

  /** Persona/tab filter (e.g. "ALL" or a persona key). */
  activeTab: string | null;

  /** Inspector panel state (deep-dive on a specific node within an artifact). */
  inspectedNodeId: string | null;
  isInspectorOpen: boolean;

  /**
   * Create a new PENDING artifact for this turn.
   *
   * Phase 1 acceptance #2: this is the create-pending half of the
   * create-pending→update-complete responsiveness flow. The artifact
   * appears IN THE COLLECTION immediately (canvas can show "I heard
   * you, working on it" without waiting for the pipeline to finish),
   * then transitions to complete via `updateArtifact` when the
   * pipeline's events arrive.
   *
   * The seed accepts only fields the caller KNOWS at turn-start:
   * `id`, `message_id`, `question_text`, `produced_for`. Routing,
   * sources, graph_trace, rendered_output are all null/empty until
   * the pipeline reports them; `produced_by` is set to a `pending`
   * sentinel and refined by `updateArtifact` when the routing
   * decision arrives carrying real engine identity.
   *
   * `derived_from_artifact_id` is in the signature (even though Phase 1
   * will almost always pass null) so the lineage edge is capturable
   * at creation when follow-up detection ships later. Without it in the
   * seed signature, lineage would be structurally uncapturable later
   * without changing the creation API — capture-or-lose-forever
   * bites.
   */
  createPendingArtifact: (seed: {
    id: string;
    message_id: string;
    question_text: string;
    produced_for: Artifact["produced_for"];
    /**
     * Optional lineage to a prior artifact when the query is a
     * follow-up. Almost always null in Phase 1 (no follow-up detection
     * yet in the mock-backed flow); the seed accepts it so the lineage
     * edge can be captured at creation when detection lands later
     * without changing this API — capture-or-lose-forever.
     */
    derived_from_artifact_id?: string | null;
  }) => void;

  /**
   * Patch an existing artifact by id.
   *
   * Phase 1 acceptance #2: the update-in-place half of the flow. Used
   * by `useInterviewAgent` as pipeline events arrive — `route_decision`
   * sets `routing` + refines `produced_by`; `sources` sets `sources`;
   * `graph_trace` sets `graph_trace`; `ui_payload`/`final_payload`
   * sets `rendered_output` + transitions `status` to `complete`;
   * `stream_end` ensures pending artifacts complete or fail.
   *
   * `updated_at` is bumped automatically on every patch.
   */
  updateArtifact: (id: string, patch: Partial<Artifact>) => void;

  /** Foreground a specific artifact (canvas view selection). */
  setCurrentArtifact: (id: string) => void;

  setActiveTab: (tab: string) => void;
  openInspector: (nodeId: string) => void;
  closeInspector: () => void;

  /**
   * Reset the entire collection. Intentional escape hatch — used by
   * `useInterviewStore.reset()` when the whole session resets. NOT
   * called on a per-turn basis (that would re-introduce the
   * canvas-overwrite class).
   */
  clearCanvas: () => void;
}

export const useCanvasStore = create<CanvasState>((set) => ({
  artifacts: [],
  currentArtifactId: null,
  isRevealing: false,
  activeTab: "ALL",
  inspectedNodeId: null,
  isInspectorOpen: false,

  createPendingArtifact: (seed) =>
    set((state) => {
      const now = Date.now();
      const artifact: Artifact = {
        id: seed.id,
        created_at: now,
        updated_at: now,
        // valid_as_of initially equals created_at; diverges later if the
        // artifact represents a historical snapshot (Phase 1 doesn't
        // produce those, but the field is required from day one so
        // freshness is checkable when it does — capture-or-lose-forever).
        valid_as_of: now,
        valid_until: null,
        question_text: seed.question_text,
        resolved_intent: {},
        message_id: seed.message_id,
        status: "pending",
        rendered_output: null,
        // produced_by starts as a pending sentinel because the agent
        // identity isn't known at turn-start; refined when the
        // route_decision event arrives carrying real handled_by.
        // This is the "lifecycle transition" acceptance #2 exercises.
        produced_by: {
          actor_type: "agent",
          actor_id: "pending",
        },
        produced_for: seed.produced_for,
        routing: null,
        sources: [],
        graph_trace: [],
        derived_from_artifact_id: seed.derived_from_artifact_id ?? null,
        // Hop 1 of projector build plan
        // (docs/plans/projector-build-plan.md commit 0eda9f7) — both
        // INTERIM under Decisions 0+1+3 (retire with Restate+topic
        // successor per [[coupled-interim-mechanisms-retire-together]]).
        //
        // durability_status starts `persistence_pending`: the artifact
        // is delivered locally; the cortex-bff Neo4j write is in
        // flight or queued. Transitions to `durable` or
        // `persistence_failed` arrive via Hop 3 (Electric → store).
        durability_status: "persistence_pending",
        // watermark = 0 is the pre-projection SENTINEL: the projector
        // has not yet assigned this artifact a real watermark. Any
        // positive value is server-assigned. See types.ts inline
        // comment on the Artifact.watermark field.
        watermark: 0,
      };
      return {
        artifacts: [...state.artifacts, artifact],
        currentArtifactId: seed.id,
        isRevealing: true,
        activeTab: "ALL",
      };
    }),

  updateArtifact: (id, patch) =>
    set((state) => ({
      artifacts: state.artifacts.map((a) =>
        a.id === id
          ? { ...a, ...patch, updated_at: Date.now() }
          : a
      ),
    })),

  setCurrentArtifact: (id) => set({ currentArtifactId: id }),

  setActiveTab: (tab) => set({ activeTab: tab }),

  openInspector: (nodeId) =>
    set({ inspectedNodeId: nodeId, isInspectorOpen: true }),

  closeInspector: () =>
    set({ inspectedNodeId: null, isInspectorOpen: false }),

  clearCanvas: () =>
    set({
      artifacts: [],
      currentArtifactId: null,
      isRevealing: false,
      activeTab: "ALL",
      isInspectorOpen: false,
      inspectedNodeId: null,
    }),
}));

/**
 * Stable empty references for the derived selectors below.
 *
 * Zustand compares selector results by reference (Object.is). Returning
 * a fresh `[]` or `{}` literal on each call would tell Zustand "the
 * value changed" on every store mutation, even unrelated mutations,
 * which triggers a re-render → re-select → fresh literal → loop. The
 * symptom is "Maximum update depth exceeded" + "getSnapshot should be
 * cached" — exactly what Phase 2 inspection caught on first dev-server
 * boot (HUD components mounted with no current artifact, hit the
 * empty branch, infinite loop, blank screen).
 *
 * Fix: hoist stable EMPTY constants and return THOSE when the value
 * is logically empty. Same reference across calls → Zustand sees
 * "unchanged" → no spurious re-render.
 *
 * Discipline: any future selector here that defaults to an empty
 * collection MUST use a hoisted constant, not a literal. The literal
 * is the trap.
 */
const EMPTY_SOURCES: Source[] = [];
const EMPTY_GRAPH_TRACE: GraphTraceNode[] = [];

/**
 * Derived selector — the currently-foregrounded artifact, or null if
 * none. Used by HUD components (`RoutingDecision`, `SourcesTrail`,
 * `GraphTrace`) to read per-current-artifact instead of from a
 * per-turn singleton in `useInterviewStore`.
 *
 * Equivalent to writing the inline find each time, but factored here
 * so the read shape is published from one place — closes the class
 * `[[ui-contract-assumed-not-published]]` names for the canvas
 * artifact view-model.
 *
 * Stability: returns `null` (literal singleton) on no-current,
 * otherwise the artifact object reference from the array (which is
 * stable until `updateArtifact` patches it). Both branches return
 * referentially-stable values; no infinite-loop risk.
 */
export function useCurrentArtifact(): Artifact | null {
  return useCanvasStore((s) => {
    const id = s.currentArtifactId;
    if (!id) return null;
    return s.artifacts.find((a) => a.id === id) ?? null;
  });
}

/** Convenience: the current artifact's routing, or null. */
export function useCurrentRouting(): RouteDecision | null {
  return useCanvasStore((s) => {
    const id = s.currentArtifactId;
    if (!id) return null;
    return s.artifacts.find((a) => a.id === id)?.routing ?? null;
  });
}

/** Convenience: the current artifact's sources, or stable empty array. */
export function useCurrentSources(): Source[] {
  return useCanvasStore((s) => {
    const id = s.currentArtifactId;
    if (!id) return EMPTY_SOURCES;
    const found = s.artifacts.find((a) => a.id === id)?.sources;
    return found ?? EMPTY_SOURCES;
  });
}

/** Convenience: the current artifact's graph trace, or stable empty array. */
export function useCurrentGraphTrace(): GraphTraceNode[] {
  return useCanvasStore((s) => {
    const id = s.currentArtifactId;
    if (!id) return EMPTY_GRAPH_TRACE;
    const found = s.artifacts.find((a) => a.id === id)?.graph_trace;
    return found ?? EMPTY_GRAPH_TRACE;
  });
}
