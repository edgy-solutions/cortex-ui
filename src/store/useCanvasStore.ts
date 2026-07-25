import { create } from "zustand";
import type { Artifact, RouteDecision, Source, GraphTraceNode } from "@/api/types";
import { TASK_ARTIFACT_PREFIX } from "@/lib/taskArtifact";

/** Do two task-artifacts carry the same displayed content? Compares the fields
 *  that matter for rendering (task_ref + display) and `rendered_output` BY
 *  REFERENCE (a preserved lazy-fetched batch is the same ref). Used so the
 *  reconciler can REUSE the existing object when a re-delivered task is
 *  unchanged — otherwise a fresh object churns the render tree and an
 *  in-progress edit (a review override + reason) is wiped by a remount. */
function taskArtifactContentEqual(a: Artifact, b: Artifact): boolean {
  if (a === b) return true;
  if (a.rendered_output !== b.rendered_output) return false;
  if (a.summary !== b.summary || a.created_at !== b.created_at || a.status !== b.status) return false;
  const ra = a.task_ref;
  const rb = b.task_ref;
  if (!ra || !rb) return ra === rb;
  return (
    ra.task_state === rb.task_state &&
    ra.kind === rb.kind &&
    ra.audience === rb.audience &&
    ra.requestedBy === rb.requestedBy &&
    ra.subjectRef === rb.subjectRef &&
    ra.workflowId === rb.workflowId &&
    ra.taskId === rb.taskId
  );
}

/**
 * Hop 3 of the projector build plan
 * (docs/plans/projector-build-plan.md commit 0eda9f7 §4 Hop 3 Part 2).
 *
 * Provenance instrumentation for updateArtifact — Shape A of Load 2.
 *
 * Every call to updateArtifact passes a `source` tag identifying who
 * wrote it. The store records the source of the LAST update for each
 * (artifactId, fieldName) pair. Part 2's absence-of-SSE probe reads
 * `_lastUpdateSource` and asserts every Electric-covered field's
 * last-update-source is `electric:*`, none are `sse:*`.
 *
 * Without provenance, a future PR could silently re-add SSE-driven
 * updates for routing/sources/graph_trace and the test would still
 * pass (because Electric also writes the field and the value would
 * be correct from BOTH sources). The provenance tag is the durable
 * defence against SSE-handler reintroduction.
 *
 * The Electric-covered fields are documented in ELECTRIC_COVERED_FIELDS
 * below; the test reads that constant and the provenance map together.
 */
export type UpdateSource =
  // Electric subscription delivered the Postgres projection row.
  | "electric:answer_artifact_projection"
  // SSE event handler in useInterviewAgent. Should NOT appear as the
  // last source for any field in ELECTRIC_COVERED_FIELDS after Hop 3.
  | "sse:route_decision"
  | "sse:sources"
  | "sse:graph_trace"
  | "sse:ui_payload"
  | "sse:final_payload"
  | "sse:pipeline_error"
  | "sse:stream_end"
  // Local writes: creating a pending artifact, the onError fallback
  // marking it failed, etc. These are NOT Electric-covered (they're
  // about client-side liveness, not substrate state).
  | "local:create_pending"
  | "local:onerror_failed"
  // Task-artifact: the review batch lazy-fetched (get_batch) on first selection
  // and written into the GROUPED_REVIEW component. Client-side liveness, not
  // substrate state — like the other local:* tags.
  | "local:task_batch"
  // Dev-only: mock-grounding emitter writes synthesizing what
  // Electric would have delivered if Postgres+projector were
  // running locally. Fires ONLY when isMockGroundingEnabled() is
  // true — guarded by the env var or localStorage key. Distinct
  // from `sse:*` deliberately: the Part 2 absence probe checks
  // for `sse:*` tags on Electric-covered fields; mock-grounding
  // writes carry their own tag so the probe remains a valid
  // production assertion. In production runs this tag MUST NOT
  // appear (mock mode is off) — its presence on an Electric-
  // covered field at rest is itself a bug indicating mock-mode
  // leaked into production. Added 2026-06-29 to close the gap
  // where the mock fired events client-side but the UI's
  // Electric-backed rendered_output / sources / routing stayed
  // null because no Postgres was in the loop.
  | "mock-grounding";

/**
 * Fields the Electric subscription is the sole source of truth for
 * post-Hop-3. After this hop, no SSE handler may drive these fields
 * onto the store — only `electric:answer_artifact_projection` may.
 *
 * Part 2's absence probe asserts: for every artifact, every field in
 * this list whose `_lastUpdateSource` is set is `electric:*`, never
 * `sse:*`. (Fields untouched by either side are allowed to be
 * absent from `_lastUpdateSource` — the assertion is `last == sse`
 * is FALSE for these fields, not that `last == electric` is TRUE.)
 *
 * These match what cortex-bff writes into Neo4j (Hop 1) and what the
 * projector copies into Postgres (Hop 2): routing, sources, graph_trace,
 * rendered_output, status, durability_status, watermark. The first
 * four were SSE-driven pre-Hop-3; the last three are new fields the
 * projector covers exclusively.
 *
 * `produced_by` and `resolved_intent` are also Electric-covered
 * because route_decision used to refine them in the SSE path; the
 * Electric row contains the same refinement and the SSE handler
 * MUST NOT touch them post-Hop-3.
 */
export const ELECTRIC_COVERED_FIELDS: readonly (keyof Artifact)[] = [
  "routing",
  "sources",
  "graph_trace",
  "rendered_output",
  "status",
  "durability_status",
  "watermark",
  "produced_by",
  "resolved_intent",
  "summary",
] as const;

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

  /**
   * True iff `currentArtifactId` was set by an explicit user action
   * (createPendingArtifact, setCurrentArtifact) since the last
   * clearCanvas. Used by `electricUpsertArtifact` to decide whether
   * Electric's hydrate-time rows may auto-foreground the
   * highest-watermark artifact.
   *
   * Without this flag, Electric stream-order determines the foreground:
   * the FIRST row received locks currentArtifactId (because once
   * non-null, subsequent upserts respect it). Electric streams shapes
   * in apply-order, so on refresh you'd land on the OLDEST artifact
   * instead of the newest. This flag lets the store keep auto-
   * foregrounding (always picking highest-watermark) until the user
   * acts.
   */
  currentArtifactSetByUser: boolean;

  /** UI affordance: the canvas reveals (animates in) when content arrives. */
  isRevealing: boolean;

  /** Persona/tab filter (e.g. "ALL" or a persona key). */
  activeTab: string | null;

  /** Inspector panel state (deep-dive on a specific node within an artifact). */
  inspectedNodeId: string | null;
  isInspectorOpen: boolean;

  /**
   * Per-artifact per-field provenance of the LAST update.
   *
   * `_lastUpdateSource[artifactId][fieldName] = UpdateSource`. The
   * provenance is tagged AT THE CALL SITE (not computed after the
   * fact) — every updateArtifact / electricUpsertArtifact / etc.
   * passes its `source` and the store records it for each field in
   * the patch. Per [[verify-subtle-acceptance-by-inspection]], the
   * tag-at-source design is what makes the provenance unforgeable;
   * a post-hoc tag could lie.
   *
   * Read by Part 2's absence probe (test_hop3_electric_vs_sse_provenance).
   * Bounded by the artifact collection size; reset by clearCanvas.
   *
   * INTERIM under Decisions 0+1+3 — when Electric retires, the
   * provenance map's surface area collapses to "local writes only"
   * (no SSE, no Electric); the map either dies or becomes a debug
   * affordance. The map's job today is to PROVE no SSE source
   * touched an Electric-covered field; that proof obligation
   * dissolves with the SSE path.
   */
  _lastUpdateSource: Record<string, Partial<Record<keyof Artifact, UpdateSource>>>;

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
   * Phase 1 acceptance #2: the update-in-place half of the flow.
   *
   * Hop 3 (this commit): callers MUST pass a `source` tag identifying
   * who is writing (per [[verify-subtle-acceptance-by-inspection]] —
   * tag-at-source, not post-hoc). The store records the source for
   * each field in the patch in `_lastUpdateSource[id]`. Part 2's
   * absence probe reads this map to assert no SSE source touched any
   * Electric-covered field. Without the source parameter, a future
   * regression that re-adds SSE writes for Electric-covered fields
   * would be invisible to the test.
   *
   * Post-Hop-3 SSE handlers may STILL call updateArtifact (e.g., the
   * onError fallback marking the artifact failed when the SSE stream
   * itself dies — that's a client-side liveness concern, not a
   * substrate-state concern), but ONLY for fields NOT in
   * ELECTRIC_COVERED_FIELDS. The absence probe enforces this.
   *
   * `updated_at` is bumped automatically on every patch.
   */
  updateArtifact: (id: string, patch: Partial<Artifact>, source: UpdateSource) => void;

  /**
   * Upsert from an Electric-synced projection row. The Postgres-side
   * shape comes through `@electric-sql/client`; we coerce it to an
   * `Artifact` and either:
   *   - patch the existing row (preserves question_text + message_id
   *     captured at create-pending; the projection echoes these but
   *     the client's local row is the canonical source for them in
   *     the create-pending → Electric-fill flow), OR
   *   - append a new row (Electric is the sole source — happens on
   *     page reload or when an artifact was created in another tab).
   *
   * All fields written via this path are tagged
   * `electric:answer_artifact_projection` in the provenance map.
   *
   * Hop 3 (this commit) is where this method ships; before this commit
   * the store had no Electric path and SSE handlers drove every
   * field. See useArtifactsSubscription in src/lib/electric.ts for
   * the caller; the conversion lives there to keep the store's
   * surface area on the data shape, not the wire shape.
   */
  electricUpsertArtifact: (artifact: Artifact) => void;

  /**
   * Remove an artifact from the collection — driven by Electric `delete`
   * operations (the projector grew a delete path: rows can now be pruned
   * from `answer_artifact_projection`, e.g. clearing pre-summary
   * artifacts). If the removed artifact was foregrounded, the selection
   * clears so the canvas doesn't dangle on a gone id.
   */
  removeArtifact: (id: string) => void;

  /**
   * Reconcile the synthetic TASK artifacts (id-prefixed `task:`) to exactly the
   * supplied set — upsert each, drop task-artifacts no longer present, and leave
   * every ANSWER artifact untouched. Preserves an existing task-artifact's
   * `rendered_output` when the incoming one is null (keeps a lazy-fetched review
   * batch across a task-state update). The task→artifact reconciler calls this.
   */
  reconcileTaskArtifacts: (taskArtifacts: Artifact[]) => void;

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
  currentArtifactSetByUser: false,
  isRevealing: false,
  activeTab: "ALL",
  inspectedNodeId: null,
  isInspectorOpen: false,
  _lastUpdateSource: {},

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
        // Honest-absent until the answer lands: the S·P headline is
        // composed at the gateway write point (routing is final) and
        // arrives via Electric. The pending row has no routing yet, so
        // no headline; the UI degrades to question_text meanwhile.
        summary: "",
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
        graph_trace_alternates: [],
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
      // Tag every field on the new artifact with `local:create_pending`
      // so the provenance map starts in a known shape. Subsequent
      // updates from Electric or SSE overwrite per-field.
      const provenance: Partial<Record<keyof Artifact, UpdateSource>> = {};
      (Object.keys(artifact) as (keyof Artifact)[]).forEach((k) => {
        provenance[k] = "local:create_pending";
      });
      return {
        artifacts: [...state.artifacts, artifact],
        currentArtifactId: seed.id,
        currentArtifactSetByUser: true,
        isRevealing: true,
        activeTab: "ALL",
        _lastUpdateSource: {
          ...state._lastUpdateSource,
          [seed.id]: provenance,
        },
      };
    }),

  updateArtifact: (id, patch, source) =>
    set((state) => {
      // Record provenance for every field in the patch. Tag-at-source
      // per [[verify-subtle-acceptance-by-inspection]]: the call site
      // knows what it is; a post-hoc tag could lie.
      const prevSource = state._lastUpdateSource[id] ?? {};
      const nextSource: Partial<Record<keyof Artifact, UpdateSource>> = {
        ...prevSource,
      };
      (Object.keys(patch) as (keyof Artifact)[]).forEach((k) => {
        nextSource[k] = source;
      });
      return {
        artifacts: state.artifacts.map((a) =>
          a.id === id
            ? { ...a, ...patch, updated_at: Date.now() }
            : a
        ),
        _lastUpdateSource: {
          ...state._lastUpdateSource,
          [id]: nextSource,
        },
      };
    }),

  electricUpsertArtifact: (artifact) =>
    set((state) => {
      // Electric is the substrate's authoritative read-side per
      // ADR-0023's CQRS naming. When a row arrives:
      //   - If the artifact already exists locally (created-pending
      //     started the local row), patch it with Electric's fields.
      //     question_text + message_id were captured locally at
      //     create-pending; Electric echoes them, the local values
      //     win on the question_text/message_id keys to avoid a
      //     spurious display change while the user is still reading
      //     the question text. All other fields take Electric's
      //     value.
      //   - If no local row exists (page reload, cross-tab create),
      //     append the Electric row outright.
      //
      // Every field touched is tagged
      // `electric:answer_artifact_projection`. Per Part 2's absence
      // probe, this is the ONLY source tag that may legitimately
      // appear for fields in ELECTRIC_COVERED_FIELDS.
      const existingIdx = state.artifacts.findIndex((a) => a.id === artifact.id);
      const prevSource = state._lastUpdateSource[artifact.id] ?? {};
      const nextSource: Partial<Record<keyof Artifact, UpdateSource>> = {
        ...prevSource,
      };
      (Object.keys(artifact) as (keyof Artifact)[]).forEach((k) => {
        nextSource[k] = "electric:answer_artifact_projection";
      });
      let nextArtifacts: Artifact[];
      if (existingIdx >= 0) {
        const existing = state.artifacts[existingIdx];
        const merged: Artifact = {
          ...existing,
          ...artifact,
          // Preserve locally-captured invariants — question_text +
          // message_id are set at create-pending and the user is
          // already seeing them; the projection echoes them but
          // letting the SAME value re-arrive via Electric is fine,
          // we just don't want a future schema drift to wipe them.
          question_text: existing.question_text || artifact.question_text,
          message_id: existing.message_id || artifact.message_id,
          updated_at: Date.now(),
        };
        nextArtifacts = state.artifacts.map((a, i) =>
          i === existingIdx ? merged : a
        );
      } else {
        nextArtifacts = [...state.artifacts, artifact];
      }

      // On page reload, the store starts with currentArtifactId=null,
      // currentArtifactSetByUser=false, and Electric hydrates the
      // collection from the substrate. We need to foreground the
      // highest-watermark row (server-assigned monotonic apply-order
      // per Decision 3 Option C) so the user lands on the most
      // recently-projected artifact.
      //
      // Why "always recompute until user acts": Electric streams rows
      // in apply-order (ascending watermark). On a "null → set on first
      // row" approach, the FIRST row received wins and currentArtifactId
      // locks to the OLDEST. We have to keep recomputing the
      // highest-watermark on each upsert during the hydrate window, and
      // stop only when the user has explicitly chosen (createPendingArtifact
      // or setCurrentArtifact). That's what `currentArtifactSetByUser`
      // gates.
      //
      // During an active query, createPendingArtifact has already set
      // currentArtifactSetByUser=true at turn start — so this block
      // never auto-foregrounds away from the user's pending artifact.
      // The Electric upsert for that pending artifact's id matches
      // existingIdx and merges in place; the foreground sticks.
      //
      // Class instance: [[fixture-must-exercise-paths]] — Hop 3
      // substrate-proof tested propagation but didn't evoke the
      // "page reload with multiple existing artifacts streamed in
      // apply-order" path. First-fix attempt (82b999a) used a
      // null-check that only fired once, locking to the first row.
      // Production refresh exposed both bugs in sequence.
      const computeHighestWatermarkId = (): string | null => {
        if (nextArtifacts.length === 0) return null;
        return nextArtifacts.reduce<Artifact>(
          (best, a) => (a.watermark > best.watermark ? a : best),
          nextArtifacts[0]
        ).id;
      };
      const nextCurrentId = state.currentArtifactSetByUser
        ? state.currentArtifactId
        : computeHighestWatermarkId();

      return {
        artifacts: nextArtifacts,
        currentArtifactId: nextCurrentId,
        _lastUpdateSource: {
          ...state._lastUpdateSource,
          [artifact.id]: nextSource,
        },
      };
    }),

  removeArtifact: (id) =>
    set((state) => {
      if (!state.artifacts.some((a) => a.id === id)) return {};
      const artifacts = state.artifacts.filter((a) => a.id !== id);
      const wasCurrent = state.currentArtifactId === id;
      // Drop provenance for the removed row.
      const _lastUpdateSource = { ...state._lastUpdateSource };
      delete _lastUpdateSource[id];
      return {
        artifacts,
        _lastUpdateSource,
        ...(wasCurrent
          ? { currentArtifactId: null, currentArtifactSetByUser: false }
          : {}),
      };
    }),

  reconcileTaskArtifacts: (taskArtifacts) =>
    set((state) => {
      const incoming = new Map(taskArtifacts.map((t) => [t.id, t]));
      const existingTasks = new Map(
        state.artifacts
          .filter((a) => a.id.startsWith(TASK_ARTIFACT_PREFIX))
          .map((a) => [a.id, a] as const)
      );

      // Build the reconciled task-artifacts, REUSING the existing object whenever
      // a task's content is unchanged — so a re-delivered identical task (Electric
      // poll) produces the SAME references and no re-render, and an in-progress
      // review edit survives. Only genuinely-changed tasks get a fresh object.
      let changed = existingTasks.size !== incoming.size;
      const merged = taskArtifacts.map((t) => {
        const prev = existingTasks.get(t.id);
        // Preserve a lazy-fetched review batch across a task-state update.
        const next =
          prev && prev.rendered_output && !t.rendered_output
            ? { ...t, rendered_output: prev.rendered_output }
            : t;
        if (prev && taskArtifactContentEqual(prev, next)) return prev;
        changed = true;
        return next;
      });

      // Nothing changed (and none removed) -> no state update at all (no churn).
      if (!changed) return {};

      const answers = state.artifacts.filter(
        (a) => !a.id.startsWith(TASK_ARTIFACT_PREFIX)
      );
      const _lastUpdateSource = { ...state._lastUpdateSource };
      for (const id of existingTasks.keys()) {
        if (!incoming.has(id)) delete _lastUpdateSource[id];
      }
      const currentGone =
        state.currentArtifactId != null &&
        state.currentArtifactId.startsWith(TASK_ARTIFACT_PREFIX) &&
        !incoming.has(state.currentArtifactId);
      return {
        artifacts: [...answers, ...merged],
        _lastUpdateSource,
        ...(currentGone
          ? { currentArtifactId: null, currentArtifactSetByUser: false }
          : {}),
      };
    }),

  setCurrentArtifact: (id) =>
    set({ currentArtifactId: id, currentArtifactSetByUser: true }),

  setActiveTab: (tab) => set({ activeTab: tab }),

  openInspector: (nodeId) =>
    set({ inspectedNodeId: nodeId, isInspectorOpen: true }),

  closeInspector: () =>
    set({ inspectedNodeId: null, isInspectorOpen: false }),

  clearCanvas: () =>
    set({
      artifacts: [],
      currentArtifactId: null,
      currentArtifactSetByUser: false,
      isRevealing: false,
      activeTab: "ALL",
      isInspectorOpen: false,
      inspectedNodeId: null,
      _lastUpdateSource: {},
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
const EMPTY_GRAPH_ALTERNATES: GraphTraceNode[] = [];

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

/** Convenience: the current artifact's verb-leg alternates (branches not
 *  taken), or stable empty array. Consumed by the decision-path diagram. */
export function useCurrentGraphAlternates(): GraphTraceNode[] {
  return useCanvasStore((s) => {
    const id = s.currentArtifactId;
    if (!id) return EMPTY_GRAPH_ALTERNATES;
    const found = s.artifacts.find((a) => a.id === id)?.graph_trace_alternates;
    return found ?? EMPTY_GRAPH_ALTERNATES;
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
