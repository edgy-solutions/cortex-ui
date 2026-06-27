# Weekend plan — cortex-ui artifact-collection foundation toward ADR-0023

**Status:** Locked plan, ready to execute.
**Scope:** Client-side only. No work-cluster, no backend Neo4j/Electric. The
real Neo4j→Postgres projector lands Monday+.
**Source authority:** ADR-0023 (`iagent-answer-artifact-graph-cqrs.md` in
the invincible-agent repo).
**Pre-work:** Phase-0 survey, banked as `[[fork-a-finding-cortex-ui-vs-adr-0023]]`.

## What this plan is for

The Phase-0 survey concluded **Fork A** — the gap from current cortex-ui
to ADR-0023 is small and additive, with **one** structural item:
[`useCanvasStore.activeComponents`](../src/store/useCanvasStore.ts)
is a single slot consumed by
[`CanvasPane`](../src/components/AgenticCanvas/CanvasPane.tsx), and
every new turn overwrites it. That single-slot overwrite IS
`[[canvas-overwrite-lies]]` in source form.

The weekend's job is to **replace the single slot with a collection of
durable `Artifact` objects shaped per ADR-0023**, then harden render
states *within* that collection structure — so the hardening builds
toward the ADR's view-model rather than polishing the one-shot UI the
ADR replaces.

The plan has three phases. **Phase 1 (foundation) gates everything
else**; Phase 2 and 3 don't start until the Phase 1 acceptance criteria
below pass.

## Phase 1 — Foundation: artifact-collection view-model (~half a day)

### Phase 1 acceptance criteria (all three required to pass)

These are **gates**, not aspirations. The structural swap is right, but
the survey looked at *existing* types and the ADR has dimensions that
postdate the survey. Capture-or-lose-forever applies: if the `Artifact`
shape doesn't carry these at creation, no backfill is possible.

1. **The `Artifact` type carries the full ADR-0023 shape**, including
   the two fields added to the ADR *after* the survey's types were
   written:
   - `valid_as_of: number` — the as-of of the grounding. Initially
     equals `created_at`; the field exists for freshness-checkability
     against captured grounding (CITES + ROUTED_AS).
   - `valid_until?: number | null` — optional natural expiry. Null
     when no natural expiry applies; the field exists so artifacts
     with sprint-bounded or rotation-bounded validity can carry that
     contract.
   - **Dual-persona explicit, not collapsed:** `produced_by`
     (answerer-side persona, via the embedded routing's
     `owner_persona`) is structurally separate from `produced_for`
     (user-side persona). The user-side persona slot exists from day
     one even though `[[pingsso-claim-gap]]` means it's populated thinly
     (`user_id`, `is_authenticated`; persona/entitlements nullable)
     until the JWT claims expand. The slot existing now means the
     claims expansion is a populate, not a schema migration.

2. **The store supports update-in-place, not just append.** The
   `resetTurnGrounding`-becomes-`createPendingArtifact` flow needs the
   pending artifact to TRANSITION to complete as the pipeline finishes
   — not to be replaced by a separate complete artifact (which would
   either duplicate or lose the pending-responsiveness). The store
   contract has `appendArtifact(artifact)` AND
   `updateArtifact(id, patch)`, and both are exercised by the
   create-pending→update-complete flow.

3. **`Message` and `Artifact` stay DISTINCT objects, referencing each
   other by id.** `Message` is the chat-transcript-turn (what was
   said); `Artifact` is the answerer's-output-object (the durable
   grounded answer). One question-turn produces one artifact; a
   follow-up question can `DERIVED_FROM` a prior artifact while ALSO
   appearing as a new `Message`. **Do not shove artifact fields onto
   `Message`.** They have different lifecycles (`Message` is
   conversation-history; `Artifact` is durable output with its own
   freshness) and conflating them is the same class as the
   persona-conflation and the canvas-overwrite — two distinct
   concepts collapsed into one slot.

### The `Artifact` type (the binding shape)

Land this in [`src/api/types.ts`](../src/api/types.ts) alongside the
existing `RouteDecision` / `Source` / `GraphTraceNode` types. The type
references existing types where they already match ADR-0023 (no
redesign — survey confirmed `RouteDecision` is remarkably close to
`ROUTED_AS` properties, and `Source` is already shaped as a citation
target).

```ts
/**
 * Artifact — the durable, grounded answer-object per ADR-0023.
 *
 * One AnswerArtifact per answerer-output. NOT a chat-transcript-turn
 * (that's Message). Message references Artifact by id when a turn
 * produced one; an Artifact references its triggering Message by id.
 *
 * Capture-or-lose-forever applies to `valid_as_of`, `produced_by`,
 * `produced_for`, and `routing` — they must be set at creation.
 * No backfill is possible.
 */
export interface Artifact {
  /** Stable identifier (URN-shaped, mesh namespace once backend lands). */
  id: string;

  /** When the artifact was created. */
  created_at: number;
  /** Last update — bumps when pending→complete or on substrate-stale mark. */
  updated_at: number;

  /**
   * As-of of the grounding. Initially equals created_at; semantically
   * "the time-point the substrate was sampled at." Distinct from
   * created_at when the artifact is produced from a historical snapshot.
   * Required — capture-or-lose-forever.
   */
  valid_as_of: number;

  /**
   * Optional natural expiry — "current sprint status" expires at sprint
   * end; "who's on call" expires at rotation change. Null when no
   * natural expiry applies; freshness is then checked against grounding.
   */
  valid_until?: number | null;

  /** Raw user-question text. */
  question_text: string;
  /**
   * Resolved intent — subject, verb, parameters as the routing layer
   * resolved them. Preserved because re-running resolution wouldn't
   * reproduce the historical answer.
   */
  resolved_intent: {
    subject_uri?: string;
    verb_iri?: string;
    parameters?: Record<string, unknown>;
  };

  /**
   * The transcript message this artifact was produced for. Lets the
   * canvas show "which question this artifact answered" without
   * duplicating the question text into the message.
   */
  message_id: string;

  /**
   * Lifecycle status for the UI. NOT the ADR's "artifact state"
   * (validity is). This is the pending→complete responsiveness flow
   * only — instant create in `pending`, transitions to `complete` when
   * the pipeline finishes, or `failed` on honest error.
   *
   * IMPORTANT: this field is a UI concern, not an ADR-modeled artifact
   * property. When this projection moves to Neo4j+Electric, this field
   * is computed/derived, NOT persisted on the artifact node — the node
   * is born complete or it isn't born. See ADR-0023 §"Freshness as the
   * artifact's stateful dimension" for why generation-state is never
   * an artifact property.
   */
  status: "pending" | "complete" | "failed";

  /**
   * The presentation predicate's output. Shape derived from DashboardUI
   * (components array) plus archetype hints. Null while pending.
   */
  rendered_output: {
    components: unknown[];
    archetype?: string;
    component_uri?: string;
  } | null;

  /**
   * Provenance — answerer-side. The agent/user that PRODUCED this.
   * Agent actors carry version/endpoint/code_hash for repro/audit.
   * Capture-at-creation.
   */
  produced_by: {
    actor_type: "agent" | "user";
    actor_id: string;
    /** Agent-only fields: */
    version?: string;
    endpoint?: string;
    code_hash?: string;
  };

  /**
   * Provenance — user-side. The requesting human. Per ADR-0009 this
   * is STRUCTURALLY SEPARATE from produced_by; conflating them is the
   * bug ADR-0009 closed.
   *
   * Today's claim gap [[pingsso-claim-gap]]: the JWT lacks
   * user_persona / entitled_domains claims. Slot exists from day one;
   * persona/entitled_domains stay nullable until claims expand. Null
   * here means "unknown user persona", NOT a default.
   */
  produced_for: {
    user_id: string;
    is_authenticated: boolean;
    user_persona?: string | null;
    entitled_domains?: string[] | null;
  };

  /**
   * The routing decision (subject, verb, confidence, handler,
   * owner_persona). owner_persona is the ANSWERER-SIDE persona — the
   * persona the engine occupied when answering, distinct from
   * produced_for.user_persona above. See RouteDecision in this file
   * for the existing shape — port-as-is.
   */
  routing: RouteDecision;

  /**
   * Sources cited. Each Source is shaped as an addressable citation
   * (URI + type). Dedup-by-URN is a derived selector when needed; the
   * artifact carries the citations it made.
   */
  sources: Source[];

  /** Graph trace nodes (subject graph for the HUD's reasoning panel). */
  graph_trace: GraphTraceNode[];

  /**
   * Lineage — id of the artifact this follow-up was DERIVED_FROM. Null
   * for top-of-thread artifacts. One-hop sufficient for now;
   * multi-hop lineage queries become traversals once on Neo4j.
   */
  derived_from_artifact_id?: string | null;
}
```

### The store contract (binding)

Replace [`useCanvasStore`](../src/store/useCanvasStore.ts) with a
collection-aware store. Keep the inspector + active-tab state where it
is (they're orthogonal to the collection); change the
content-bearing slot.

```ts
interface CanvasState {
  artifacts: Artifact[];                  // append-and-update-in-place collection
  currentArtifactId: string | null;       // the one the canvas is foregrounding
  isRevealing: boolean;
  activeTab: string | null;
  inspectedNodeId: string | null;
  isInspectorOpen: boolean;

  /** Create a new pending artifact for this turn. Acceptance #2. */
  createPendingArtifact: (seed: {
    id: string;
    message_id: string;
    question_text: string;
    produced_for: Artifact["produced_for"];
  }) => void;

  /** Patch an existing artifact (pending → complete, sources arrived, etc.). */
  updateArtifact: (id: string, patch: Partial<Artifact>) => void;

  /** Foreground a specific artifact (canvas view selection). */
  setCurrentArtifact: (id: string) => void;

  setActiveTab: (tab: string) => void;
  openInspector: (nodeId: string) => void;
  closeInspector: () => void;
  clearCanvas: () => void;            // resets the collection; intentional escape hatch
}
```

The append-and-update pair (`createPendingArtifact` +
`updateArtifact`) is what acceptance #2 requires. A pure-append store
would force pending and complete to be DIFFERENT artifacts, breaking
the responsiveness flow.

### File-level changes (the executable list)

| File | Change | Acceptance criteria touched |
|---|---|---|
| [`src/api/types.ts`](../src/api/types.ts) | Add `Artifact` interface alongside the existing types. Exactly the shape above — do NOT inline-edit existing types like `RouteDecision` (the survey confirmed they port as-is). | #1, #3 |
| [`src/store/useCanvasStore.ts`](../src/store/useCanvasStore.ts) | Replace `activeComponents` single-slot with `artifacts: Artifact[]` + `currentArtifactId`. Implement `createPendingArtifact` and `updateArtifact`. | #2, #3 |
| [`src/components/AgenticCanvas/CanvasPane.tsx`](../src/components/AgenticCanvas/CanvasPane.tsx) | Read from `currentArtifactId` → look up in `artifacts` → render its `rendered_output.components`. The render component contract stays the same (components array); only the source-of-truth path changes. | #2, #3 |
| [`src/lib/mockGroundingEmitter.ts`](../src/lib/mockGroundingEmitter.ts) | Keep the staggered events for thinking-card animation. At `stream_end`, materialize an `Artifact` object from the accumulated bits and call `updateArtifact(id, { status: "complete", ... })`. The earlier `createPendingArtifact` call happens at stream start. | #2 |
| [`src/hooks/useInterviewAgent.ts`](../src/hooks/useInterviewAgent.ts) | At turn-start, call `createPendingArtifact` instead of clearing the canvas. At `stream_end`, call `updateArtifact` instead of `setCanvasContent`. `resetTurnGrounding` becomes "create the next pending artifact." | #2 |
| [`src/store/useInterviewStore.ts`](../src/store/useInterviewStore.ts) | The per-turn grounding singletons (`routeDecision`, `sources`, `graphTrace`) move OFF the interview store and ONTO the artifact row. `resetTurnGrounding` becomes a no-op or is removed entirely. `Message` and `Artifact` reference each other by id — `Message.artifactId?: string`. | #3 |
| HUD components (`HUD.tsx`, `RoutingDecision.tsx`, `SourcesTrail.tsx`, `GraphTrace.tsx`, `SemanticInterpreter.tsx`, etc.) | One-line per component: replace `useInterviewStore` singleton selectors with `useCanvasStore` per-current-artifact selectors. Survey confirmed components consume typed values; they don't care about the source. | #2 |

### What's intentionally NOT in Phase 1

- **The Neo4j write-model and Electric projection.** Backend work.
  This plan builds the UI SHAPE of the ADR's view-model, mock-backed.
  Wiring to real data happens Monday+, when the projector lands.
- **Lineage UI** (showing the `derived_from_artifact_id` relationship
  visually). The field exists; surfacing it is later.
- **Standards edges UI** (BPMN/ODCS/ODPS/CALM). ADR-0024 reserves
  the vocabulary; the UI for them lands per-standard when each
  integration lands.
- **Free-spatial-canvas / tabs / projects metaphor.** ADR-0023
  explicitly defers this. Phase 1 keeps a "current artifact
  foregrounded; prior artifacts recallable" shape; the metaphor is a
  later UI decision.
- **Persistence to localStorage / IndexedDB.** The collection lives
  in memory this weekend. Real persistence rides on the
  Neo4j+Electric backend; client-side persistence as a stopgap is
  out of scope.

## Phase 2 — Hardening within the collection (rest of the weekend)

Run the original enumerate-states → drive-via-mock → judge
works/honest/acceptable hardening loop, but now **inside** the
artifact-collection structure. The hardening is for render states of
the components reading per-current-artifact; the foundation is the
ADR's shape, not the one-shot UI.

Specific things the hardening covers:

- The grounding panel's per-artifact state (sources arriving,
  partial-evidence, honest 404 from Engine DA).
- The thinking-card pending → complete transition (acceptance #2 in
  action).
- The ontology card per-turn reset (already fixed in
  cortex-ui `df9068a`, verify still correct against the new
  collection store).
- Pipeline-stages incomplete state (cortex-ui `fdfd0af`,
  verify correct against the new collection store).
- Sources-card candidates-vs-citations distinction (the presentation
  ruling that was pending before the relocation work).

The multi-turn UI ruling that was pending — "how does the UI show
multi-turn behavior" — is RESOLVED by Phase 1 structurally: the
canvas-as-collection IS the multi-turn answer (answers accumulate,
don't overwrite). It's not a separate ruling anymore; it's what
Phase 1 builds.

## Phase 3 — ADR-0022 port-task (alternate thread)

The backend-flavored alternate from before the survey, kept as an
option for time-permitting work. Independent of Phase 1/2 — different
repo, different concern (DataHub MCP audit). See
`[[adr0022-port-tasks]]`.

## Self-check before merging Phase 1

Before the swap-the-single-slot PR merges, confirm each acceptance
criterion concretely:

- [ ] Acceptance #1: open `Artifact` type definition; verify
  `valid_as_of`, `valid_until`, `produced_by`, `produced_for` are all
  present. Verify `produced_for` has nullable persona / entitlement
  slots, not omitted.
- [ ] Acceptance #2: open `useCanvasStore`; verify BOTH
  `createPendingArtifact` AND `updateArtifact` are implemented and
  called. Verify the mock emitter calls `createPendingArtifact` at
  start and `updateArtifact` at `stream_end` — not two `appendArtifact`
  calls.
- [ ] Acceptance #3: open `Message` type; verify it does NOT carry
  artifact fields (`rendered_output`, `sources`, `routing`). Verify it
  has `artifactId?: string` referencing the artifact by id. Verify
  `Artifact` has `message_id: string` referencing back.

If any of the three fails, fix before merging Phase 1; do not start
Phase 2 against a Phase 1 that missed acceptance — that's exactly
the "additive to a stale shape" trap the sanity-checks exist to
prevent.

## When Monday's backend work lands

The artifact-collection store becomes a read-through cache over the
Electric-synced projection; `createPendingArtifact` /
`updateArtifact` become local-write-then-await-sync (with the
projector's position-advertisement settling the see-your-write
read). The `Artifact` type stays put. The UI doesn't change shape;
only the source-of-truth path changes from "in-memory + mock" to
"Electric Shape API + projector." That's exactly the "build the UI
SHAPE of the foundation now, wire to real data later" the ADR
discussion landed on.
