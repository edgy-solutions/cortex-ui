import { readFileSync } from "node:fs";
import path from "node:path";
/**
 * CHARACTERIZATION of the SSE interview turn.
 *
 * Two properties dominate this file and neither is "the events are handled".
 *
 * The first: after Hop 3 most of these handlers DELIBERATELY DO NOTHING to the artifact.
 * routing / sources / graph_trace / rendered_output / status / durability_status /
 * watermark / produced_by / resolved_intent belong to Electric, and an SSE handler that
 * "helpfully" writes one back is not a small regression — it re-creates two writers for one
 * field. A no-op with no test is indistinguishable from an omission, so every no-op below is
 * pinned by BOTH the value and the store's provenance tag: restoring the write flips
 * `local:create_pending` to `sse:*` and this file goes red.
 *
 * The second: the turn's live feedback lands BEFORE the transport is awaited, and green is
 * never manufactured. `done` requires a positive completion signal; a stream that ends
 * without one yields `incomplete`, which is the whole point of the third state.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { createElement, type ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { StreamEvent } from "@/api/types";
import { useInterviewStore } from "@/store/useInterviewStore";
import { useCanvasStore, ELECTRIC_COVERED_FIELDS } from "@/store/useCanvasStore";
import { isMockGroundingEnabled } from "@/lib/mockGroundingEmitter";
import { useInterviewAgent } from "./useInterviewAgent";

/**
 * The transport is the ONLY boundary mocked. Everything below the hook — both Zustand
 * stores, the upsert-by-kind dispatch, the priming — is the real code, because the
 * behaviour under characterization is the composition, not the hook in isolation.
 */
const transport = vi.hoisted(() => ({
  calls: 0,
  request: null as Record<string, unknown> | null,
  onEvent: null as ((e: unknown) => void) | null,
  signal: null as AbortSignal | null,
  settle: null as { resolve: () => void; reject: (e: unknown) => void } | null,
  /** Fires INSIDE the transport call, before the hook awaits it. */
  onCall: null as (() => void) | null,
}));

vi.mock("@/api/client", () => ({
  streamInterviewResponse: (
    request: Record<string, unknown>,
    onEvent: (e: unknown) => void,
    signal?: AbortSignal,
  ) =>
    new Promise<void>((resolve, reject) => {
      transport.calls += 1;
      transport.request = request;
      transport.onEvent = onEvent;
      transport.signal = signal ?? null;
      transport.settle = { resolve, reject };
      transport.onCall?.();
    }),
  healthCheck: async () => true,
}));

const QUERY = "who owns the alpha dashboard?";

const wrapper = ({ children }: { children: ReactNode }) =>
  createElement(
    QueryClientProvider,
    { client: new QueryClient({ defaultOptions: { mutations: { retry: false } } }) },
    children,
  );

const mount = () => renderHook(() => useInterviewAgent(), { wrapper });

/** react-query defers mutationFn by a few microtasks; nothing here uses timers. */
const flush = async () => {
  for (let i = 0; i < 10; i++) await Promise.resolve();
};

async function startTurn(
  r: ReturnType<typeof mount>,
  text: string = QUERY,
): Promise<void> {
  await act(async () => {
    r.result.current.sendMessage(text);
    await flush();
  });
}

const emit = (e: StreamEvent) => {
  act(() => {
    transport.onEvent!(e);
  });
};

/** Close the transport and wait for react-query to leave `pending`. */
async function finishTurn(r: ReturnType<typeof mount>): Promise<void> {
  await act(async () => {
    transport.settle!.resolve();
    await flush();
  });
  await waitFor(() => expect(r.result.current.isProcessing).toBe(false));
}

const messages = () => useInterviewStore.getState().messages;
const agentMsg = () => messages().filter((m) => m.role === "agent").at(-1)!;
const steps = () => agentMsg().thinkingSteps ?? [];
const statusOf = (kind: string) => steps().find((s) => s.kind === kind)?.status;
const artifacts = () => useCanvasStore.getState().artifacts;
const artifact = () => artifacts().at(-1)!;
const provenance = (id: string) => useCanvasStore.getState()._lastUpdateSource[id] ?? {};

beforeEach(() => {
  window.localStorage.clear();
  window.sessionStorage.clear();
  useInterviewStore.getState().reset();
  useCanvasStore.getState().clearCanvas();
  transport.calls = 0;
  transport.request = null;
  transport.onEvent = null;
  transport.signal = null;
  transport.settle = null;
  transport.onCall = null;
});

describe("useInterviewAgent — turn start", () => {
  it("MOCK GROUNDING IS OFF — otherwise every test below characterizes the emitter", () => {
    // isMockGroundingEnabled() short-circuits the whole real path: no transport call, a
    // client-side timeline, and direct canvas writes tagged `mock-grounding`. If this flips
    // on (a stray localStorage key, a VITE_ var in a CI env file) the no-op pins below would
    // still pass while asserting nothing about the production path.
    expect(isMockGroundingEnabled()).toBe(false);
  });

  it("user message, agent placeholder, pending artifact and 5 primed stages land BEFORE the transport is awaited", async () => {
    // The freeze investigation's actual question: does pressing Enter produce visible state
    // without waiting on the network? The snapshot is taken INSIDE the transport call, so it
    // cannot be satisfied by anything the stream later delivers.
    const r = mount();
    const cap = { at: null as null | ReturnType<typeof snapshot> };
    const snapshot = () => ({
      roles: messages().map((m) => m.role),
      userText: messages().find((m) => m.role === "user")?.content,
      agentStreaming: messages().find((m) => m.role === "agent")?.isStreaming,
      stepCount: (messages().find((m) => m.role === "agent")?.thinkingSteps ?? []).length,
      artifactCount: artifacts().length,
      artifactQuestion: artifacts()[0]?.question_text,
    });
    transport.onCall = () => {
      cap.at = snapshot();
    };

    await startTurn(r);

    expect(transport.calls).toBe(1);
    expect(cap.at).not.toBeNull();
    expect(cap.at!.roles).toEqual(["user", "agent"]);
    expect(cap.at!.userText).toBe(QUERY);
    expect(cap.at!.agentStreaming).toBe(true);
    expect(cap.at!.stepCount).toBe(5);
    expect(cap.at!.artifactCount).toBe(1);
    expect(cap.at!.artifactQuestion).toBe(QUERY);
  });

  it("primes exactly the 5 pipeline stages — first `loading`, the rest `pending`", async () => {
    // "The panel never appears empty" is load-bearing perceived responsiveness. Seeding all
    // five as `pending` would show no motion; seeding all as `loading` would claim work that
    // has not started.
    const r = mount();
    await startTurn(r);

    expect(steps().map((s) => s.kind)).toEqual([
      "understanding",
      "locating",
      "choosing_action",
      "retrieving",
      "composing",
    ]);
    expect(steps().map((s) => s.status)).toEqual([
      "loading",
      "pending",
      "pending",
      "pending",
      "pending",
    ]);
  });

  it("the request carries the SAME artifact_id as the local pending row", async () => {
    // Electric merges the server row into the local pending row BY ID. A freshly-minted id
    // on the request would leave the user staring at an empty pending artifact while the
    // real one sits unviewed in the collection.
    const r = mount();
    await startTurn(r);

    expect(transport.request!.artifact_id).toBe(artifact().id);
    expect(transport.request!.message).toBe(QUERY);
  });

  it("omits active_persona / active_domains when the caller has no entitlement matrix", async () => {
    // Sending an empty selection is NOT the same as sending nothing: cortex-bff falls back
    // to the JWT-claim path only when the fields are absent.
    const r = mount();
    await startTurn(r);

    expect("active_persona" in transport.request!).toBe(false);
    expect("active_domains" in transport.request!).toBe(false);
  });

  it("a second Enter while a turn is in flight is DROPPED, not queued", async () => {
    // The freeze report's neighbour symptom. The guard is `mutation.isPending`, which stays
    // true for the whole stream — so the second keystroke produces no user message at all.
    const r = mount();
    await startTurn(r, "first");
    await act(async () => {
      r.result.current.sendMessage("second");
      await flush();
    });

    expect(transport.calls).toBe(1);
    expect(messages().filter((m) => m.role === "user").map((m) => m.content)).toEqual(["first"]);
  });

  it("cancelStream aborts the signal the transport was handed — not a detached one", async () => {
    // The hook keeps ONE AbortController per turn in a ref. A cancel that minted a fresh
    // controller (or aborted after the ref was reassigned) would leave the real stream open
    // and the surface would keep mutating after the user stopped it.
    const r = mount();
    await startTurn(r);
    expect(transport.signal!.aborted).toBe(false);

    act(() => r.result.current.cancelStream());

    expect(transport.signal!.aborted).toBe(true);
  });

  it("a new turn wipes per-turn UI grounding but NEVER a prior artifact", async () => {
    // The canvas-overwrite class. Ontology chips are per-turn accumulators; artifacts are
    // durable rows. Resetting the collection here is the regression this pins shut.
    const r = mount();
    await startTurn(r, "first");
    emit({ type: "context_update", contextType: "ontology", data: ["Dataset"] });
    emit({ type: "stream_end" });
    await finishTurn(r);

    await startTurn(r, "second");

    expect(artifacts()).toHaveLength(2);
    expect(artifacts().map((a) => a.question_text)).toEqual(["first", "second"]);
    expect(useInterviewStore.getState().ontologyTerms).toEqual([]);
    expect(useInterviewStore.getState().accessDenial).toBeNull();
  });
});

describe("useInterviewAgent — the Hop 3 no-ops (deliberate, not omissions)", () => {
  const ELECTRIC_ONLY_EVENTS: StreamEvent[] = [
    {
      type: "route_decision",
      decision: {
        about: { label: "Catalog Asset", uri: "urn:x:Dataset", confidence: 0.9 },
        action: {
          label: "Look up ownership",
          iri: "mesh:lookupOwnership",
          confidence: 0.9,
          classify_called: true,
          candidate_count: 1,
        },
        handled_by: {
          engine_name: "Engine A",
          provider: "engine_a_lookup_ownership",
          endpoint_url: "http://engine-a:8081/analyze",
        },
      },
    },
    {
      type: "sources",
      sources: [{ type: "catalog_asset", label: "Alpha", uri: "urn:x:alpha", relevance: 1 }],
    },
    {
      type: "graph_trace",
      nodes: [{ uri: "urn:x:Dataset", label: "Dataset", role: "resolved_subject", hops: 0 }],
      alternates: [{ uri: "urn:x:Other", label: "Other", role: "resolved_subject", hops: 1 }],
    },
    { type: "final_payload", payload: { components: [] } as never },
  ];

  it("route_decision does NOT write routing / produced_by / resolved_intent", async () => {
    // Pre-Hop-3 this handler refined produced_by off the pending sentinel. The sentinel
    // surviving the event IS the passing condition now — Electric carries the refinement.
    const r = mount();
    await startTurn(r);
    emit(ELECTRIC_ONLY_EVENTS[0]);

    expect(artifact().routing).toBeNull();
    expect(artifact().produced_by.actor_id).toBe("pending");
    expect(artifact().resolved_intent).toEqual({});
    expect(provenance(artifact().id).routing).toBe("local:create_pending");
    expect(provenance(artifact().id).produced_by).toBe("local:create_pending");
  });

  it("sources does NOT write sources", async () => {
    const r = mount();
    await startTurn(r);
    emit(ELECTRIC_ONLY_EVENTS[1]);

    expect(artifact().sources).toEqual([]);
    expect(provenance(artifact().id).sources).toBe("local:create_pending");
  });

  it("graph_trace does NOT write graph_trace", async () => {
    const r = mount();
    await startTurn(r);
    emit(ELECTRIC_ONLY_EVENTS[2]);

    expect(artifact().graph_trace).toEqual([]);
    expect(artifact().graph_trace_alternates).toEqual([]);
    expect(provenance(artifact().id).graph_trace).toBe("local:create_pending");
  });

  it("final_payload does NOT write rendered_output or flip status to complete", async () => {
    // The payload arriving is not the substrate agreeing it was persisted. Writing
    // status=complete here would show a durable-looking answer the writer never confirmed.
    const r = mount();
    await startTurn(r);
    emit(ELECTRIC_ONLY_EVENTS[3]);

    expect(artifact().rendered_output).toBeNull();
    expect(artifact().status).toBe("pending");
    expect(artifact().durability_status).toBe("persistence_pending");
    expect(provenance(artifact().id).rendered_output).toBe("local:create_pending");
    expect(provenance(artifact().id).status).toBe("local:create_pending");
  });

  it("pipeline_error does NOT mark the artifact failed — only the HUD row", async () => {
    // Two paths, two concerns: the stage row is an SSE-side HUD fact, the artifact's
    // terminal state is the Hop 1 writer's decision delivered over Electric.
    const r = mount();
    await startTurn(r);
    emit({ type: "pipeline_error", kind: "retrieving", message: "engine timeout" });

    expect(statusOf("retrieving")).toBe("error");
    expect(artifact().status).toBe("pending");
    expect(provenance(artifact().id).status).toBe("local:create_pending");
  });

  it("stream_end does NOT finalize the artifact — pending is the honest resting state", async () => {
    // Pre-Hop-3 stream_end forced pending→complete as "honest finalization". It is now the
    // opposite: the UI does not know whether the write landed, so it does not say.
    const r = mount();
    await startTurn(r);
    emit({ type: "stream_end" });

    expect(artifact().status).toBe("pending");
    expect(artifact().durability_status).toBe("persistence_pending");
    expect(artifact().watermark).toBe(0);
    expect(provenance(artifact().id).status).toBe("local:create_pending");
  });

  it("a dead transport leaves the artifact PENDING — it is never forced to failed", async () => {
    // A stuck-pending artifact is honest about what the client knows (it never heard back).
    // Forcing status=failed would assert a substrate outcome the client never observed.
    const r = mount();
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    await startTurn(r);
    await act(async () => {
      transport.settle!.reject(new Error("NETWORK_OR_BACKEND_UNREACHABLE"));
      await flush();
    });
    await waitFor(() => expect(r.result.current.error).toBeTruthy());
    logged.mockRestore();

    expect(agentMsg().error).toBe("NETWORK_OR_BACKEND_UNREACHABLE");
    expect(agentMsg().isStreaming).toBe(false);
    expect(artifact().status).toBe("pending");
    expect(provenance(artifact().id).status).toBe("local:create_pending");
  });

  it("NO Electric-covered field carries an `sse:*` provenance tag after a FULL stream", async () => {
    // The generalized guard, and the reason `updateArtifact` takes a source at all: a
    // re-added SSE write would produce the CORRECT value (Electric writes it too), so value
    // assertions alone cannot see the regression. Only the tag can.
    const r = mount();
    await startTurn(r);
    for (const e of ELECTRIC_ONLY_EVENTS) emit(e);
    emit({ type: "pipeline_stage", kind: "understanding", status: "completed" });
    emit({ type: "pipeline_error", kind: "retrieving", message: "engine timeout" });
    emit({ type: "chat_message", data: { role: "agent", content: "owners are a, b, c" } });
    emit({ type: "stream_end" });

    const tags = provenance(artifact().id);
    // Positive control: an empty provenance map would make the loop below assert nothing.
    expect(Object.keys(tags).length).toBeGreaterThanOrEqual(ELECTRIC_COVERED_FIELDS.length);
    for (const field of ELECTRIC_COVERED_FIELDS) {
      expect(tags[field], `${field} was written by ${tags[field]}`).toBe("local:create_pending");
    }
  });
});

describe("useInterviewAgent — stream_end never manufactures green", () => {
  it("marks unconfirmed stages `incomplete`, NEVER `done`", async () => {
    // The one place the UI used to fabricate a completion signal. Under silent degrade the
    // gateway ends the stream with no error AND no completed events for stages 2-5; the old
    // markAllStepsDone painted them all green. Catastrophic false positive.
    const r = mount();
    await startTurn(r);
    emit({ type: "pipeline_stage", kind: "understanding", status: "completed" });
    emit({ type: "pipeline_stage", kind: "locating", status: "started" });
    emit({ type: "stream_end" });

    expect(steps().map((s) => s.status)).toEqual([
      "done", // positive completion signal — preserved
      "incomplete", // was loading, never completed
      "incomplete",
      "incomplete",
      "incomplete",
    ]);
    expect(steps().filter((s) => s.status === "done")).toHaveLength(1);
  });

  it("does not downgrade a stage that DID report — done stays done, error stays error", async () => {
    // The other direction. A rule that rewrote every row at stream_end would erase the two
    // states the pipeline actually confirmed.
    const r = mount();
    await startTurn(r);
    emit({ type: "pipeline_stage", kind: "understanding", status: "completed" });
    emit({ type: "pipeline_stage", kind: "composing", status: "completed" });
    emit({ type: "pipeline_error", kind: "retrieving", message: "engine timeout" });
    emit({ type: "stream_end" });

    expect(statusOf("understanding")).toBe("done");
    expect(statusOf("composing")).toBe("done");
    expect(statusOf("retrieving")).toBe("error");
    expect(statusOf("locating")).toBe("incomplete");
    expect(statusOf("choosing_action")).toBe("incomplete");
  });

  it("a final_payload does not confirm stages 1-4 — a vacuous answer still ends amber", async () => {
    // The silent-degrade shape: a wholly-degraded run can still emit a final payload. Stage
    // 5 producing output is positive signal for stage 5 only.
    const r = mount();
    await startTurn(r);
    emit({ type: "final_payload", payload: { components: [] } as never });
    emit({ type: "stream_end" });

    expect(steps().map((s) => s.status)).toEqual([
      "incomplete",
      "incomplete",
      "incomplete",
      "incomplete",
      "incomplete",
    ]);
  });

  it("stream_end clears isStreaming and RELEASES the turn — later stage events land nowhere", async () => {
    // The refs are nulled, so a trailing pipeline_stage after the terminator cannot revive
    // the finished turn's rows. Trailing steps are non-fatal, and silent.
    const r = mount();
    await startTurn(r);
    emit({ type: "stream_end" });
    expect(agentMsg().isStreaming).toBe(false);

    emit({ type: "pipeline_stage", kind: "locating", status: "completed" });
    expect(statusOf("locating")).toBe("incomplete");
  });

  it("context_update STILL applies after stream_end — it is the one handler with no agent-message guard", async () => {
    // Event-ordering tolerance, characterized as it actually is: ontology/binding chips are
    // agent-message-independent, so they flow whether or not a turn owns them.
    const r = mount();
    await startTurn(r);
    emit({ type: "stream_end" });
    emit({ type: "context_update", contextType: "ontology", data: ["Dataset"] });
    emit({ type: "context_update", contextType: "bindings", data: ["urn:x:alpha"] });

    expect(useInterviewStore.getState().ontologyTerms.map((t) => t.label)).toEqual(["Dataset"]);
    expect(useInterviewStore.getState().dataBindings.map((b) => b.model)).toEqual(["urn:x:alpha"]);
  });
});

describe("useInterviewAgent — pipeline_stage mapping", () => {
  it("completed→done, failed→error, everything else→loading", async () => {
    // `started` is not the only non-terminal value the gateway may send; anything unknown
    // reads as "in progress", never as success.
    const r = mount();
    await startTurn(r);
    emit({ type: "pipeline_stage", kind: "understanding", status: "completed" });
    emit({ type: "pipeline_stage", kind: "locating", status: "failed" });
    emit({ type: "pipeline_stage", kind: "retrieving", status: "started" });

    expect(statusOf("understanding")).toBe("done");
    expect(statusOf("locating")).toBe("error");
    expect(statusOf("retrieving")).toBe("loading");
  });

  it("repeated `started` for one kind COLLAPSES to a single row", async () => {
    // The 10-second-heartbeat accumulation bug: each emission used to append. Identity is
    // `kind`, so a retrying stage updates in place instead of growing the panel.
    const r = mount();
    await startTurn(r);
    emit({ type: "pipeline_stage", kind: "locating", status: "started", elapsed_ms: 10 });
    emit({ type: "pipeline_stage", kind: "locating", status: "started", elapsed_ms: 20 });
    emit({ type: "pipeline_stage", kind: "locating", status: "started", elapsed_ms: 30 });

    expect(steps()).toHaveLength(5);
    expect(steps().filter((s) => s.kind === "locating")).toHaveLength(1);
    expect(steps().find((s) => s.kind === "locating")?.elapsedMs).toBe(30);
  });

  it("the label comes from the UI's table, never from the event", async () => {
    // Label is a UI concern and the typed event deliberately carries none — so a stage that
    // arrives before priming still reads as a sentence, not as a kind slug.
    const r = mount();
    await startTurn(r);
    emit({ type: "pipeline_stage", kind: "choosing_action", status: "completed" });

    expect(steps().find((s) => s.kind === "choosing_action")?.label).toBe("Choosing how to answer");
  });
});

describe("useInterviewAgent — pipeline_error binding", () => {
  it("binds to event.kind and REPLACES that row's label with the error message", async () => {
    // The failure has to be legible where the user is already looking, which costs the
    // friendly label. Pinned as-is: it is the current contract, not an accident to tidy.
    const r = mount();
    await startTurn(r);
    emit({ type: "pipeline_error", kind: "retrieving", message: "Engine W timed out" });

    const row = steps().find((s) => s.kind === "retrieving")!;
    expect(row.status).toBe("error");
    expect(row.label).toBe("Engine W timed out");
    expect(steps()).toHaveLength(5);
  });

  it("an UNBOUND error falls back to `composing` — it never vanishes", async () => {
    // No kind means the gateway could not attribute the failure. Dropping it would leave the
    // timeline looking merely unfinished instead of failed.
    const r = mount();
    await startTurn(r);
    emit({ type: "pipeline_error", message: "unattributed failure" });

    expect(statusOf("composing")).toBe("error");
    expect(steps().find((s) => s.kind === "composing")?.label).toBe("unattributed failure");
    expect(steps()).toHaveLength(5);
  });
});

describe("useInterviewAgent — access_denied", () => {
  it("stores the STRUCTURED denial — the fields that key the request-access loop", async () => {
    // A denial is an authorization outcome, not a fault and not an empty result. Collapsing
    // it into a generic error would lose the assets and domain the HITL request is routed by.
    const r = mount();
    await startTurn(r);
    emit({
      type: "access_denied",
      denied_assets: ["urn:x:alpha"],
      subject: "alice",
      domain: "SUSTAINMENT",
      message: "can_read denied",
    });

    expect(useInterviewStore.getState().accessDenial).toEqual({
      denied_assets: ["urn:x:alpha"],
      subject: "alice",
      domain: "SUSTAINMENT",
      message: "can_read denied",
    });
  });

  it("flips the STORE's isProcessing off while the hook still reports processing", async () => {
    // Two different notions of "processing" and the denial moves only one. The surface reads
    // the store (spinner stops, denial renders); the composer reads mutation.isPending and
    // stays disabled until the stream actually ends.
    const r = mount();
    await startTurn(r);
    emit({
      type: "access_denied",
      denied_assets: ["urn:x:alpha"],
      subject: "alice",
      domain: "SUSTAINMENT",
      message: "can_read denied",
    });

    expect(useInterviewStore.getState().isProcessing).toBe(false);
    expect(r.result.current.isProcessing).toBe(true);
  });

  it("is NOT terminal for event processing — later events still mutate the turn", async () => {
    // The turn refs are untouched by the denial, so the stream keeps driving the HUD after
    // the surface has already flipped to access-denied.
    const r = mount();
    await startTurn(r);
    emit({
      type: "access_denied",
      denied_assets: ["urn:x:alpha"],
      subject: "alice",
      domain: "SUSTAINMENT",
      message: "can_read denied",
    });
    emit({ type: "pipeline_stage", kind: "locating", status: "completed" });

    expect(statusOf("locating")).toBe("done");
  });
});

describe("useInterviewAgent — chat layer vs artifact layer", () => {
  it("chat_message writes the agent text and marks NO stage done", async () => {
    // Text arriving means synthesis produced something, not that stages 1-4 succeeded.
    const r = mount();
    await startTurn(r);
    emit({ type: "chat_message", data: { role: "agent", content: "owners are a, b, c" } });

    expect(agentMsg().content).toBe("owners are a, b, c");
    expect(agentMsg().isStreaming).toBe(false);
    expect(steps().map((s) => s.status)).toEqual([
      "loading",
      "pending",
      "pending",
      "pending",
      "pending",
    ]);
  });

  it("final_payload OVERWRITES the chat text with a receipt — the answer body is the canvas's", async () => {
    // The message becomes a pointer, not a copy of rendered_output. The number is the
    // artifact's 1-based position in the collection at receipt time.
    //
    // This pins a CONTRACT, not a defect — it reads like data loss and is not. The prose
    // from `chat_message` is destroyed here, but nothing displays it: the only renderer of
    // `message.content` is MessageBubble, which the answer-first redesign left unmounted
    // (see NeuralStream.tsx). The surface reads the ARTIFACT via Electric — `answerSummary`
    // takes the backend-composed headline, the body renders from `rendered_output`. The
    // chat message degrading to a receipt is the design, so do not "fix" this overwrite.
    //
    // Latent-with-trigger, and the reason this comment exists: it is safe only because a
    // component is dead. Revive the conversation thread and the overwrite becomes real —
    // the answer prose would vanish at the last event of every turn. If that thread ever
    // comes back, this test is the place the question surfaces.
    const r = mount();
    await startTurn(r);
    emit({ type: "chat_message", data: { role: "agent", content: "owners are a, b, c" } });
    emit({ type: "final_payload", payload: { components: [] } as never });

    expect(agentMsg().content).toBe("Artifact #1 deployed to Canvas.");
    expect(agentMsg().isReceipt).toBe(true);
    expect(agentMsg().isStreaming).toBe(false);
  });

  it("ui_payload is the SAME handler as final_payload — not a lesser one", async () => {
    // They share a case. A future divergence that only patches `final_payload` would leave
    // the streaming-preview path silently different.
    const r = mount();
    await startTurn(r);
    emit({ type: "ui_payload", payload: { components: [] } as never });

    expect(agentMsg().content).toBe("Artifact #1 deployed to Canvas.");
    expect(agentMsg().isReceipt).toBe(true);
  });
});

describe("useInterviewAgent — event admission", () => {
  it("EVERY StreamEvent member is in `isAlwaysAllowed`, so the no-agent-message guard is unreachable", () => {
    // Characterizing the guard as it stands: `if (!agentId && !isAlwaysAllowed) return;`
    // cannot fire for any event the contract can produce. A new event type added to
    // types.ts but NOT to the list would make that guard live for the first time — which is
    // a real behaviour change (silent drop before the agent message exists), so it should
    // be a decision, not a discovery. This goes red on that day, in both directions.
    const typesSrc = readFileSync(path.join(__dirname, "../api/types.ts"), "utf8");
    const hookSrc = readFileSync(path.join(__dirname, "./useInterviewAgent.ts"), "utf8");

    const unionStart = typesSrc.indexOf("export type StreamEvent =");
    const union = typesSrc.slice(unionStart, typesSrc.indexOf("\nexport ", unionStart + 1));
    const declared = new Set([...union.matchAll(/type: "(\w+)"/g)].map((m) => m[1]));

    const guardStart = hookSrc.indexOf("const isAlwaysAllowed =");
    const guard = hookSrc.slice(guardStart, hookSrc.indexOf(";", guardStart));
    const admitted = new Set([...guard.matchAll(/event\.type === "(\w+)"/g)].map((m) => m[1]));

    // Positive control: a regex that stopped matching would make the comparison vacuous.
    expect(declared.size).toBeGreaterThanOrEqual(11);
    expect(admitted.size).toBeGreaterThanOrEqual(11);
    expect([...admitted].sort()).toEqual([...declared].sort());
  });
});
