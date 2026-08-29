/**
 * CHARACTERIZATION of the artifact spine.
 *
 * Three properties dominate this file.
 *
 * The first: the pending row is made of SENTINELS, not placeholders. `produced_by.actor_id
 * = "pending"`, `watermark = 0`, `durability_status = "persistence_pending"`, `summary = ""`
 * each mean "the client genuinely does not know yet" and each has a reader downstream that
 * treats it as absence. Anything that "helpfully" fills one in is claiming a substrate fact
 * the client never observed, so they are pinned by exact value.
 *
 * The second: WHO wrote a field is a separate fact from WHAT the field says, and only the
 * first one can catch a boundary regression. Electric writes the same correct value an
 * SSE handler would, so a wrongly-sourced write produces an identical-looking artifact.
 * Every Electric-boundary assertion below therefore carries BOTH halves — the value and
 * the `_lastUpdateSource` tag — and the sweep over ELECTRIC_COVERED_FIELDS carries a
 * positive control proving the server row actually DIFFERS from the pending row, without
 * which the value half asserts nothing.
 *
 * The third: the store WITNESSES the boundary, it does not ENFORCE it. `updateArtifact`
 * will happily let `sse:route_decision` write `status`. What stops that is the SSE
 * handler plus useInterviewAgent.test.ts; this store's job is to make the write visible.
 * That is characterized explicitly, so nobody mistakes the provenance map for a guard.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import type { Artifact, RouteDecision } from "@/api/types";
import { TASK_ARTIFACT_PREFIX } from "@/lib/taskArtifact";
import { useCanvasStore, ELECTRIC_COVERED_FIELDS } from "./useCanvasStore";

const store = () => useCanvasStore.getState();
const artifacts = () => store().artifacts;
const ids = () => artifacts().map((a) => a.id);
const byId = (id: string) => artifacts().find((a) => a.id === id)!;
const provenance = (id: string) => store()._lastUpdateSource[id] ?? {};
const fieldOf = (a: Artifact, f: keyof Artifact): unknown =>
  (a as unknown as Record<string, unknown>)[f];

const PRODUCED_FOR: Artifact["produced_for"] = {
  user_id: "alice",
  is_authenticated: true,
  entitlement_source: "none",
};

const seed = (id: string, question_text = "who owns the alpha dashboard?") => ({
  id,
  message_id: `msg-${id}`,
  question_text,
  produced_for: PRODUCED_FOR,
});

const ROUTING: RouteDecision = {
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
};

/**
 * A fully-populated projection row. Every ELECTRIC_COVERED_FIELD here is DELIBERATELY
 * different from the pending seed's value for that field — the sweep's positive control
 * asserts exactly that, because a server row that happened to echo a sentinel would make
 * the value assertions pass while proving nothing arrived.
 */
const serverRow = (id: string, overrides: Partial<Artifact> = {}): Artifact => ({
  id,
  created_at: 500,
  updated_at: 600,
  // Differs from the pending row`s honest `null` on purpose — the sweep above
  // refuses a fixture whose server value matches the pending one, because such a
  // field would pass its assertion without anything having actually arrived.
  duration_ms: 4200,
  valid_as_of: 500,
  valid_until: null,
  question_text: "who owns the alpha dashboard?",
  summary: "Alpha Dashboard · ownership",
  resolved_intent: { subject_uri: "urn:x:alpha", verb_iri: "mesh:lookupOwnership" },
  message_id: `msg-${id}`,
  status: "complete",
  rendered_output: { components: [{ archetype: "TABLE" }] },
  produced_by: { actor_type: "agent", actor_id: "engine_a_lookup_ownership" },
  produced_for: PRODUCED_FOR,
  routing: ROUTING,
  sources: [{ type: "catalog_asset", label: "Alpha", uri: "urn:x:alpha", relevance: 1 }],
  graph_trace: [{ uri: "urn:x:Dataset", label: "Dataset", role: "resolved_subject", hops: 0 }],
  graph_trace_alternates: [],
  derived_from_artifact_id: null,
  durability_status: "durable",
  watermark: 42,
  ...overrides,
});

const taskRow = (rowId: string, overrides: Partial<Artifact> = {}): Artifact => ({
  ...serverRow(`${TASK_ARTIFACT_PREFIX}${rowId}`),
  question_text: "review the batch",
  summary: "Grouped review",
  rendered_output: null,
  watermark: 0,
  task_ref: {
    taskId: rowId,
    workflowId: "wf-1",
    kind: "grouped_review",
    task_state: "pending",
    audience: "stewards",
    requestedBy: "bob",
    subjectRef: null,
  },
  ...overrides,
});

/** created_at / updated_at come from Date.now(); real time makes "did it bump" a coin flip. */
let clock = 1_000_000;
const tick = (ms = 1000) => {
  clock += ms;
};

beforeEach(() => {
  clock = 1_000_000;
  vi.spyOn(Date, "now").mockImplementation(() => clock);
  useCanvasStore.getState().clearCanvas();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("useCanvasStore — createPendingArtifact: the row exists before the answer does", () => {
  it("appends the row SYNCHRONOUSLY and foregrounds it — the canvas has something to draw on keystroke", () => {
    // The whole reason create-pending exists. If the row only landed once the pipeline
    // reported, pressing Enter would leave the canvas showing the PREVIOUS answer for the
    // length of a round trip, which reads as a freeze.
    useCanvasStore.getState().createPendingArtifact(seed("a1"));

    expect(ids()).toEqual(["a1"]);
    expect(byId("a1").question_text).toBe("who owns the alpha dashboard?");
    expect(byId("a1").message_id).toBe("msg-a1");
    expect(store().currentArtifactId).toBe("a1");
    expect(store().isRevealing).toBe(true);
  });

  it("seeds SENTINELS, not placeholders — every unknown says so in a way a reader can detect", () => {
    // These four are honest-absence markers with downstream readers: watermark 0 is
    // "unprojected" (AnswersPanel sorts on it), produced_by "pending" is "no engine identity
    // yet", persistence_pending is "the Neo4j write is still in flight", summary "" is "no
    // captured headline, degrade to question_text". Filling any of them in at create time
    // would assert a substrate outcome the client has not observed.
    useCanvasStore.getState().createPendingArtifact(seed("a1"));
    const a = byId("a1");

    expect(a.status).toBe("pending");
    expect(a.watermark).toBe(0);
    expect(a.durability_status).toBe("persistence_pending");
    expect(a.produced_by).toEqual({ actor_type: "agent", actor_id: "pending" });
    expect(a.summary).toBe("");
    expect(a.routing).toBeNull();
    expect(a.rendered_output).toBeNull();
    expect(a.sources).toEqual([]);
    expect(a.graph_trace).toEqual([]);
    expect(a.graph_trace_alternates).toEqual([]);
    expect(a.resolved_intent).toEqual({});
    expect(a.valid_until).toBeNull();
  });

  it("the three timestamps start EQUAL and valid_as_of is a separate field from created_at", () => {
    // valid_as_of is the grounding's as-of, created_at is when the row was made. They are
    // equal here only because a fresh answer samples the substrate now; collapsing them into
    // one field would make freshness uncheckable the day they diverge.
    useCanvasStore.getState().createPendingArtifact(seed("a1"));
    const a = byId("a1");

    expect(a.created_at).toBe(1_000_000);
    expect(a.updated_at).toBe(1_000_000);
    expect(a.valid_as_of).toBe(1_000_000);
  });

  it("carries derived_from_artifact_id through, and NULLS it rather than omitting when absent", () => {
    // Lineage is capture-or-lose-forever: the edge is knowable only at creation. An explicit
    // null is the difference between "no parent" and "nobody asked".
    useCanvasStore.getState().createPendingArtifact(seed("a1"));
    useCanvasStore
      .getState()
      .createPendingArtifact({ ...seed("a2"), derived_from_artifact_id: "a1" });

    expect(byId("a1").derived_from_artifact_id).toBeNull();
    expect(byId("a2").derived_from_artifact_id).toBe("a1");
  });

  it("tags EVERY Electric-covered field `local:create_pending` — the baseline the boundary is measured against", () => {
    // The pending row is the zero-point of the provenance map. If a field were left untagged
    // at creation, the sibling hook test's "no sse:* tag on an Electric-covered field" probe
    // would pass vacuously for that field forever: undefined is not "sse:*".
    useCanvasStore.getState().createPendingArtifact(seed("a1"));
    const tags = provenance("a1");

    // Positive control: an empty covered-field list, or a provenance map that stopped being
    // populated, would make the loop below iterate over nothing and report coverage.
    expect(ELECTRIC_COVERED_FIELDS.length).toBeGreaterThanOrEqual(10);
    expect(Object.keys(tags).length).toBeGreaterThanOrEqual(ELECTRIC_COVERED_FIELDS.length);
    for (const field of ELECTRIC_COVERED_FIELDS) {
      expect(tags[field], `${field} was left untagged at create-pending`).toBe(
        "local:create_pending",
      );
    }
  });

  it("counts as a USER foreground choice — Electric hydration may not move the canvas afterwards", () => {
    // `currentArtifactSetByUser` is the one bit standing between the user's in-flight
    // question and a hydrate storm that re-picks the highest watermark on every row.
    useCanvasStore.getState().createPendingArtifact(seed("a1"));

    expect(store().currentArtifactSetByUser).toBe(true);
  });

  it("resets activeTab to ALL — a persona filter does not survive asking a question", () => {
    // Characterized as-is. The new artifact would otherwise be invisible behind the filter
    // the user last set, but the cost is that the filter silently clears under them.
    useCanvasStore.getState().setActiveTab("SUSTAINMENT");
    useCanvasStore.getState().createPendingArtifact(seed("a1"));

    expect(store().activeTab).toBe("ALL");
  });

  it("a second turn APPENDS — a new question never overwrites the previous answer", () => {
    // The canvas-overwrite class this store was built to close. The collection is durable;
    // "the latest" is a selection, not the only slot.
    useCanvasStore.getState().createPendingArtifact(seed("a1", "first"));
    useCanvasStore.getState().createPendingArtifact(seed("a2", "second"));

    expect(artifacts().map((a) => a.question_text)).toEqual(["first", "second"]);
    expect(store().currentArtifactId).toBe("a2");
  });

  it("does NOT dedupe by id — a repeated id yields TWO rows and one shared provenance entry", () => {
    // Pinned as a defect-in-waiting, not as a contract. Nothing here rejects a duplicate id:
    // the collection grows a shadow row that `find`-based selectors will never reach, while
    // the provenance map keeps a single entry keyed by that id for both.
    useCanvasStore.getState().createPendingArtifact(seed("a1", "first ask"));
    useCanvasStore.getState().createPendingArtifact(seed("a1", "second ask"));

    expect(ids()).toEqual(["a1", "a1"]);
    expect(artifacts()[0].question_text).toBe("first ask");
    expect(Object.keys(store()._lastUpdateSource)).toEqual(["a1"]);
  });
});

describe("useCanvasStore — updateArtifact patches in place", () => {
  beforeEach(() => {
    useCanvasStore.getState().createPendingArtifact(seed("a1"));
    useCanvasStore.getState().createPendingArtifact(seed("a2"));
  });

  it("patches the addressed row and leaves the collection's length and order alone", () => {
    // The append-only failure mode: a store that pushed the patched row would show pending
    // and complete as two separate answers to one question.
    tick();
    useCanvasStore.getState().updateArtifact("a1", { status: "failed" }, "local:onerror_failed");

    expect(ids()).toEqual(["a1", "a2"]);
    expect(byId("a1").status).toBe("failed");
    expect(byId("a2").status).toBe("pending");
  });

  it("bumps updated_at only — created_at and valid_as_of are creation facts, not update facts", () => {
    tick(5000);
    useCanvasStore.getState().updateArtifact("a1", { status: "failed" }, "local:onerror_failed");
    const a = byId("a1");

    expect(a.updated_at).toBe(1_005_000);
    expect(a.created_at).toBe(1_000_000);
    expect(a.valid_as_of).toBe(1_000_000);
  });

  it("re-tags EXACTLY the patched keys and leaves every other field's tag standing", () => {
    // Per-field, not per-artifact. A source recorded at artifact granularity would let one
    // legitimate local write (the onError fallback) relabel the whole row and erase the
    // evidence of who wrote the Electric-covered fields.
    useCanvasStore.getState().updateArtifact("a1", { status: "failed" }, "local:onerror_failed");
    const tags = provenance("a1");

    expect(tags.status).toBe("local:onerror_failed");
    expect(tags.routing).toBe("local:create_pending");
    expect(tags.sources).toBe("local:create_pending");
    expect(tags.rendered_output).toBe("local:create_pending");
  });

  it("REFUSES NOTHING — an sse:* source can write an Electric-covered field, and the tag says so", () => {
    // The load-bearing statement about this store: the provenance map is a WITNESS, not a
    // guard. Nothing here rejects the write. What keeps the boundary is the SSE handler
    // declining to make it, plus the probe in useInterviewAgent.test.ts that reads this tag.
    // Anyone reading `_lastUpdateSource` as enforcement will build on a floor that isn't there.
    useCanvasStore
      .getState()
      .updateArtifact("a1", { status: "complete", routing: ROUTING }, "sse:route_decision");

    expect(byId("a1").status).toBe("complete");
    expect(byId("a1").routing).toEqual(ROUTING);
    expect(provenance("a1").status).toBe("sse:route_decision");
    expect(provenance("a1").routing).toBe("sse:route_decision");
  });

  it("last write wins per field, including a later LOCAL write over an earlier ELECTRIC one", () => {
    // No source precedence exists. Electric is authoritative by convention among callers,
    // not by any rule in the store — so a late local write silently outranks the substrate.
    useCanvasStore
      .getState()
      .updateArtifact("a1", { status: "complete" }, "electric:answer_artifact_projection");
    useCanvasStore.getState().updateArtifact("a1", { status: "failed" }, "local:onerror_failed");

    expect(byId("a1").status).toBe("failed");
    expect(provenance("a1").status).toBe("local:onerror_failed");
  });

  it("an UNKNOWN id changes no row but still mints a provenance entry for it", () => {
    // Pinned as found. The map's own doc claims it is "bounded by the artifact collection
    // size"; it is not — a typo'd or already-removed id leaves a permanent orphan record
    // that only clearCanvas reclaims.
    useCanvasStore.getState().updateArtifact("ghost", { status: "complete" }, "sse:stream_end");

    expect(ids()).toEqual(["a1", "a2"]);
    expect(store()._lastUpdateSource.ghost).toEqual({ status: "sse:stream_end" });
  });

  it("an EMPTY patch still replaces the row object and bumps updated_at", () => {
    // Referential churn with no content change. Every consumer selecting the artifact object
    // re-renders; `taskArtifactContentEqual` exists elsewhere in this file precisely because
    // that churn wipes in-progress edits.
    const before = byId("a1");
    tick();
    useCanvasStore.getState().updateArtifact("a1", {}, "sse:stream_end");

    expect(byId("a1")).not.toBe(before);
    expect(byId("a1").updated_at).toBe(1_001_000);
  });
});

describe("useCanvasStore — the Electric boundary", () => {
  it("MERGES the server row onto the pending row BY ID — one artifact, not two", () => {
    // Why useInterviewAgent sends its locally-generated artifact_id to the gateway. A merge
    // that missed would leave the user watching a permanently-pending row while the answered
    // one sat unviewed further down the collection.
    useCanvasStore.getState().createPendingArtifact(seed("a1"));
    useCanvasStore.getState().electricUpsertArtifact(serverRow("a1"));

    expect(ids()).toEqual(["a1"]);
    expect(byId("a1").status).toBe("complete");
    expect(byId("a1").watermark).toBe(42);
  });

  it("the merge keeps the row's POSITION — hydration does not reshuffle the collection", () => {
    useCanvasStore.getState().createPendingArtifact(seed("a1"));
    useCanvasStore.getState().createPendingArtifact(seed("a2"));
    useCanvasStore.getState().electricUpsertArtifact(serverRow("a1"));

    expect(ids()).toEqual(["a1", "a2"]);
  });

  it("APPENDS when no local row exists — reload and cross-tab creates arrive with no pending twin", () => {
    useCanvasStore.getState().electricUpsertArtifact(serverRow("srv-1"));

    expect(ids()).toEqual(["srv-1"]);
    expect(byId("srv-1").rendered_output).toEqual({ components: [{ archetype: "TABLE" }] });
  });

  it("EVERY Electric-covered field takes the server's value AND flips to the electric tag", () => {
    // The sweep. Value alone cannot see a boundary regression — an SSE handler re-added
    // tomorrow writes the SAME correct value Electric does, so the artifact looks identical
    // and only the tag names the writer. Both halves, every covered field.
    useCanvasStore.getState().createPendingArtifact(seed("a1"));
    const pending = byId("a1");
    const row = serverRow("a1");

    // Positive control, and the sharper half of it: if the server row echoed a pending
    // sentinel for some field, that field's value assertion below would pass without
    // anything having arrived. Assert the fixture actually differs first.
    expect(ELECTRIC_COVERED_FIELDS.length).toBeGreaterThanOrEqual(10);
    for (const field of ELECTRIC_COVERED_FIELDS) {
      expect(fieldOf(row, field), `fixture does not exercise ${field}`).not.toEqual(
        fieldOf(pending, field),
      );
    }

    useCanvasStore.getState().electricUpsertArtifact(row);
    const merged = byId("a1");
    const tags = provenance("a1");

    for (const field of ELECTRIC_COVERED_FIELDS) {
      expect(fieldOf(merged, field), `${field} did not take Electric's value`).toEqual(
        fieldOf(row, field),
      );
      expect(tags[field], `${field} is tagged ${tags[field]}, not electric`).toBe(
        "electric:answer_artifact_projection",
      );
    }
  });

  it("keeps the LOCAL question_text and message_id — the text the user is reading does not flicker", () => {
    // The projection echoes both, but the local capture is canonical for the create-pending
    // → fill flow. A schema drift that shipped an empty question_text must not blank the
    // question out from under someone mid-read.
    useCanvasStore.getState().createPendingArtifact(seed("a1", "LOCAL question"));
    useCanvasStore
      .getState()
      .electricUpsertArtifact(
        serverRow("a1", { question_text: "SERVER question", message_id: "server-msg" }),
      );

    expect(byId("a1").question_text).toBe("LOCAL question");
    expect(byId("a1").message_id).toBe("msg-a1");
  });

  it("but tags them `electric` anyway — the provenance for those two keys names a writer that lost", () => {
    // Pinned as found, and it is the one place the map is not trustworthy: the tag loop runs
    // over the INCOMING row's keys, before the merge decides the local value wins. Anything
    // that later reasons "question_text came from Electric" reads a false witness.
    useCanvasStore.getState().createPendingArtifact(seed("a1", "LOCAL question"));
    useCanvasStore
      .getState()
      .electricUpsertArtifact(serverRow("a1", { question_text: "SERVER question" }));

    expect(byId("a1").question_text).toBe("LOCAL question");
    expect(provenance("a1").question_text).toBe("electric:answer_artifact_projection");
  });

  it("an EMPTY local question_text yields to the server's — the guard is falsiness, not presence", () => {
    // The `||` means a legitimately-empty local value is replaceable. Reload-hydrated task
    // artifacts (message_id "") depend on this branch.
    useCanvasStore.getState().createPendingArtifact({ ...seed("a1"), question_text: "" });
    useCanvasStore
      .getState()
      .electricUpsertArtifact(serverRow("a1", { question_text: "SERVER question" }));

    expect(byId("a1").question_text).toBe("SERVER question");
  });

  it("the MERGE path discards the server's updated_at while the APPEND path keeps it", () => {
    // Pinned as found: the same field means "when the projector last wrote" on a hydrated row
    // and "when this client last merged" on a merged one. Anything sorting or diffing on
    // updated_at is comparing two different clocks.
    useCanvasStore.getState().createPendingArtifact(seed("a1"));
    tick(7000);
    useCanvasStore.getState().electricUpsertArtifact(serverRow("a1", { updated_at: 600 }));
    useCanvasStore.getState().electricUpsertArtifact(serverRow("srv-2", { updated_at: 600 }));

    expect(byId("a1").updated_at).toBe(1_007_000);
    expect(byId("srv-2").updated_at).toBe(600);
  });

  it("a field ABSENT from the incoming row survives the merge and keeps its old tag", () => {
    // Spread-merge, not replace. `task_ref` is absent on answer rows and `derived_from` is
    // optional; a merge that reset the row to the incoming shape would drop the lineage edge
    // that only creation could capture.
    useCanvasStore
      .getState()
      .createPendingArtifact({ ...seed("a1"), derived_from_artifact_id: "parent" });
    const row = serverRow("a1");
    delete (row as Partial<Artifact>).derived_from_artifact_id;
    useCanvasStore.getState().electricUpsertArtifact(row);

    expect(byId("a1").derived_from_artifact_id).toBe("parent");
    expect(provenance("a1").derived_from_artifact_id).toBe("local:create_pending");
  });
});

describe("useCanvasStore — the foreground is the user's, until the user has none", () => {
  it("hydration does NOT steal the foreground from the artifact the user is looking at", () => {
    // The whole point of `currentArtifactSetByUser`. Electric streams every row in the shape
    // on reconnect; without the gate, an in-flight question would be yanked off-screen by a
    // months-old artifact that merely has a higher watermark.
    useCanvasStore.getState().createPendingArtifact(seed("a1"));
    useCanvasStore.getState().electricUpsertArtifact(serverRow("older", { watermark: 999 }));

    expect(store().currentArtifactId).toBe("a1");
  });

  it("with no user choice, EVERY upsert re-picks the highest watermark — not the first row seen", () => {
    // The reload path, and the bug that shipped first: a null-check that only fired once
    // locked the foreground to whichever row Electric streamed first, which is the OLDEST.
    // Recomputing on every row is what makes a refresh land on the newest answer.
    useCanvasStore.getState().electricUpsertArtifact(serverRow("old", { watermark: 1 }));
    expect(store().currentArtifactId).toBe("old");

    useCanvasStore.getState().electricUpsertArtifact(serverRow("mid", { watermark: 5 }));
    expect(store().currentArtifactId).toBe("mid");

    useCanvasStore.getState().electricUpsertArtifact(serverRow("newest", { watermark: 9 }));
    expect(store().currentArtifactId).toBe("newest");
  });

  it("a LATE low-watermark row drags the foreground BACK to the highest — it never latches", () => {
    // The consequence of "recompute every time": arrival order is irrelevant, only the
    // watermark ranking is. Also means auto-foreground keeps moving for the whole session
    // if the user never selects anything.
    useCanvasStore.getState().electricUpsertArtifact(serverRow("newest", { watermark: 9 }));
    useCanvasStore.getState().electricUpsertArtifact(serverRow("old", { watermark: 1 }));

    expect(store().currentArtifactId).toBe("newest");
  });

  it("ties keep the INCUMBENT — the reduce uses a strict `>`, so unprojected rows never win one", () => {
    // Every pre-projection row carries watermark 0, as do all task-artifacts. A `>=` here
    // would make the foreground flip to whichever zero arrived last, on every poll.
    useCanvasStore.getState().electricUpsertArtifact(serverRow("first-zero", { watermark: 0 }));
    useCanvasStore.getState().electricUpsertArtifact(serverRow("second-zero", { watermark: 0 }));

    expect(store().currentArtifactId).toBe("first-zero");
  });

  it("setCurrentArtifact freezes the foreground against all later hydration", () => {
    useCanvasStore.getState().electricUpsertArtifact(serverRow("old", { watermark: 1 }));
    useCanvasStore.getState().setCurrentArtifact("old");
    useCanvasStore.getState().electricUpsertArtifact(serverRow("newest", { watermark: 9 }));

    expect(store().currentArtifactId).toBe("old");
    expect(store().currentArtifactSetByUser).toBe(true);
  });

  it("setCurrentArtifact accepts an id that is not in the collection, and still latches", () => {
    // Pinned as found. There is no membership check, so a stale id from a removed row
    // foregrounds nothing AND permanently disables the auto-foreground that would have
    // recovered — the canvas can be left blank with no path back except clearCanvas.
    useCanvasStore.getState().electricUpsertArtifact(serverRow("real", { watermark: 9 }));
    useCanvasStore.getState().setCurrentArtifact("does-not-exist");

    expect(store().currentArtifactId).toBe("does-not-exist");
    expect(artifacts().some((a) => a.id === "does-not-exist")).toBe(false);

    useCanvasStore.getState().electricUpsertArtifact(serverRow("newer", { watermark: 99 }));
    expect(store().currentArtifactId).toBe("does-not-exist");
  });

  it("hydration does NOT raise isRevealing — the reveal animation belongs to asking, not to loading", () => {
    // Only createPendingArtifact raises it and only clearCanvas lowers it. A refresh that
    // re-triggered the reveal would animate the whole history in as if it just arrived.
    useCanvasStore.getState().electricUpsertArtifact(serverRow("srv-1"));

    expect(store().isRevealing).toBe(false);
  });
});

describe("useCanvasStore — ordering is not this store's job", () => {
  it("keeps INSERTION order and never sorts by watermark or created_at", () => {
    // Deliberate: AnswersPanel and QuestionNavigator each sort for their own reasons
    // (watermark-then-created_at, bucketed). A store-level sort would fight them and make
    // the collection order meaningless as a record of what arrived when.
    useCanvasStore.getState().createPendingArtifact(seed("a1"));
    useCanvasStore.getState().electricUpsertArtifact(serverRow("srv-hi", { watermark: 900 }));
    useCanvasStore.getState().electricUpsertArtifact(serverRow("srv-lo", { watermark: 2 }));

    expect(ids()).toEqual(["a1", "srv-hi", "srv-lo"]);
  });
});

describe("useCanvasStore — removeArtifact", () => {
  it("drops the row AND its provenance, so a re-created id starts clean", () => {
    useCanvasStore.getState().createPendingArtifact(seed("a1"));
    useCanvasStore.getState().createPendingArtifact(seed("a2"));

    useCanvasStore.getState().removeArtifact("a1");

    expect(ids()).toEqual(["a2"]);
    expect(store()._lastUpdateSource.a1).toBeUndefined();
    expect(store()._lastUpdateSource.a2).toBeDefined();
  });

  it("removing the FOREGROUNDED row clears the selection and RELEASES it back to auto-foreground", () => {
    // The canvas must not dangle on a gone id. The second half matters more: dropping
    // `currentArtifactSetByUser` hands control back to the highest-watermark rule, so the
    // next Electric row silently decides what the user is looking at.
    useCanvasStore.getState().createPendingArtifact(seed("a1"));
    useCanvasStore.getState().electricUpsertArtifact(serverRow("srv-1", { watermark: 3 }));

    useCanvasStore.getState().removeArtifact("a1");

    expect(store().currentArtifactId).toBeNull();
    expect(store().currentArtifactSetByUser).toBe(false);

    useCanvasStore.getState().electricUpsertArtifact(serverRow("srv-2", { watermark: 7 }));
    expect(store().currentArtifactId).toBe("srv-2");
  });

  it("removing a NON-foregrounded row leaves the selection alone", () => {
    useCanvasStore.getState().createPendingArtifact(seed("a1"));
    useCanvasStore.getState().createPendingArtifact(seed("a2"));

    useCanvasStore.getState().removeArtifact("a1");

    expect(store().currentArtifactId).toBe("a2");
    expect(store().currentArtifactSetByUser).toBe(true);
  });

  it("an unknown id is a TRUE no-op — the array keeps its identity, so nothing re-renders", () => {
    // Electric replays deletes. Returning a fresh filtered array for a row that was never
    // there would churn every subscriber on every replay.
    useCanvasStore.getState().createPendingArtifact(seed("a1"));
    const before = artifacts();

    useCanvasStore.getState().removeArtifact("ghost");

    expect(artifacts()).toBe(before);
  });
});

describe("useCanvasStore — reconcileTaskArtifacts", () => {
  it("replaces the task set exactly and leaves every ANSWER artifact untouched", () => {
    // Two populations, one collection. A reconciler that reset the array would delete the
    // user's answers every time the task poll returned.
    useCanvasStore.getState().createPendingArtifact(seed("a1"));
    useCanvasStore.getState().reconcileTaskArtifacts([taskRow("t1"), taskRow("t2")]);
    useCanvasStore.getState().reconcileTaskArtifacts([taskRow("t2")]);

    expect(ids()).toEqual(["a1", "task:t2"]);
    expect(byId("a1").question_text).toBe("who owns the alpha dashboard?");
  });

  it("a reconcile that CHANGES anything rewrites order to answers-first, tasks-last", () => {
    // Pinned as found. Chronology is not preserved: a task that predates an answer jumps
    // behind it the moment any task changes. Every consumer sorts, so nothing breaks today,
    // but array order here is not a record of arrival and must not be read as one. Note the
    // rewrite is conditional on `changed` — an unchanged redelivery leaves the old order,
    // so the collection's order depends on poll history, not on the data.
    useCanvasStore.getState().reconcileTaskArtifacts([taskRow("t1")]);
    useCanvasStore.getState().createPendingArtifact(seed("a1"));
    expect(ids()).toEqual(["task:t1", "a1"]);

    useCanvasStore.getState().reconcileTaskArtifacts([taskRow("t1"), taskRow("t2")]);

    expect(ids()).toEqual(["a1", "task:t1", "task:t2"]);
  });

  it("an UNCHANGED redelivery is a total no-op — same array AND same row objects", () => {
    // The Electric poll re-delivers identical tasks continuously. Fresh objects would remount
    // the review card and wipe an in-progress override + reason the reviewer had typed.
    useCanvasStore.getState().reconcileTaskArtifacts([taskRow("t1")]);
    const before = artifacts();

    useCanvasStore.getState().reconcileTaskArtifacts([taskRow("t1")]);

    expect(artifacts()).toBe(before);
    expect(byId("task:t1")).toBe(before[0]);
  });

  it("preserves a lazy-fetched review batch when the redelivered task carries none", () => {
    // The batch is fetched client-side on first selection and lives nowhere else. A task-state
    // update arriving with rendered_output null would otherwise empty the card the reviewer
    // is working in.
    const batch = { components: [{ archetype: "GROUPED_REVIEW", batch: { rows: [] } }] };
    useCanvasStore.getState().reconcileTaskArtifacts([taskRow("t1", { rendered_output: batch })]);
    useCanvasStore
      .getState()
      .reconcileTaskArtifacts([
        taskRow("t1", { rendered_output: null, task_ref: { ...taskRow("t1").task_ref!, task_state: "approved" } }),
      ]);

    expect(byId("task:t1").rendered_output).toBe(batch);
    expect(byId("task:t1").task_ref!.task_state).toBe("approved");
  });

  it("a NEWLY fetched batch REPLACES the old one — rendered_output is compared, not assumed stable", () => {
    // The other half of the preserve rule, and the one that makes it safe. Reuse is decided
    // by an equality check that includes rendered_output; drop that field from the check and
    // a task whose only change is a re-fetched batch reads as unchanged, so the reviewer keeps
    // working against rows the server has already replaced.
    const first = { components: [{ archetype: "GROUPED_REVIEW", batch: { rows: ["old"] } }] };
    const second = { components: [{ archetype: "GROUPED_REVIEW", batch: { rows: ["new"] } }] };
    useCanvasStore.getState().reconcileTaskArtifacts([taskRow("t1", { rendered_output: first })]);

    useCanvasStore.getState().reconcileTaskArtifacts([taskRow("t1", { rendered_output: second })]);

    expect(byId("task:t1").rendered_output).toBe(second);
  });

  it("that comparison is BY REFERENCE — a re-adapted task with identical content still churns", () => {
    // Pinned as found, and it costs the no-churn guarantee for most tasks in production:
    // taskToArtifact mints a fresh `{ components: [...] }` on every call for every archetype
    // except GROUPED_REVIEW, and the sync effect re-adapts the whole task list on each store
    // emission. So identical-content approval tasks fail the reference check and get a new
    // object every poll — the exact remount-churn the reuse path exists to prevent.
    const adapt = () => taskRow("t1", { rendered_output: { components: [{ archetype: "APPROVAL_TASK" }] } });
    useCanvasStore.getState().reconcileTaskArtifacts([adapt()]);
    const before = byId("task:t1");

    useCanvasStore.getState().reconcileTaskArtifacts([adapt()]);

    expect(byId("task:t1")).not.toBe(before);
    expect(byId("task:t1").rendered_output).toEqual(before.rendered_output);
  });

  it("a changed task_state DOES produce a fresh object — staleness is not the price of stability", () => {
    useCanvasStore.getState().reconcileTaskArtifacts([taskRow("t1")]);
    const before = byId("task:t1");

    useCanvasStore
      .getState()
      .reconcileTaskArtifacts([
        taskRow("t1", { task_ref: { ...taskRow("t1").task_ref!, task_state: "approved" } }),
      ]);

    expect(byId("task:t1")).not.toBe(before);
    expect(byId("task:t1").task_ref!.task_state).toBe("approved");
  });

  it("a changed question_text is DROPPED — the equality check does not compare that field", () => {
    // Pinned as found, and it is a real staleness hole: taskToArtifact maps the task's SUMMARY
    // onto question_text and its TITLE onto summary. taskArtifactContentEqual compares summary
    // but not question_text, so a task whose body text changed while its title did not is
    // considered unchanged and the old object is reused verbatim.
    useCanvasStore.getState().reconcileTaskArtifacts([taskRow("t1", { question_text: "before" })]);

    useCanvasStore.getState().reconcileTaskArtifacts([taskRow("t1", { question_text: "AFTER" })]);

    expect(byId("task:t1").question_text).toBe("before");
  });

  it("drops provenance for vanished tasks but keeps it for surviving ones and for answers", () => {
    useCanvasStore.getState().createPendingArtifact(seed("a1"));
    useCanvasStore.getState().reconcileTaskArtifacts([taskRow("t1"), taskRow("t2")]);
    useCanvasStore
      .getState()
      .updateArtifact("task:t1", { rendered_output: null }, "local:task_batch");

    useCanvasStore.getState().reconcileTaskArtifacts([taskRow("t2")]);

    expect(store()._lastUpdateSource["task:t1"]).toBeUndefined();
    expect(store()._lastUpdateSource.a1).toBeDefined();
  });

  it("clears the foreground when the FOREGROUNDED task disappears, but never for an answer", () => {
    // A resolved task drops out of the poll while the user is looking at it. The selection has
    // to let go or the canvas renders nothing with no way to tell why.
    useCanvasStore.getState().reconcileTaskArtifacts([taskRow("t1")]);
    useCanvasStore.getState().setCurrentArtifact("task:t1");

    useCanvasStore.getState().reconcileTaskArtifacts([]);

    expect(store().currentArtifactId).toBeNull();
    expect(store().currentArtifactSetByUser).toBe(false);
  });

  it("an answer foreground SURVIVES a task reconcile that empties the task set", () => {
    useCanvasStore.getState().createPendingArtifact(seed("a1"));
    useCanvasStore.getState().reconcileTaskArtifacts([taskRow("t1")]);

    useCanvasStore.getState().reconcileTaskArtifacts([]);

    expect(store().currentArtifactId).toBe("a1");
    expect(ids()).toEqual(["a1"]);
  });

  it("task ids are recognised by the `task:` PREFIX, so an answer id can never be reconciled away", () => {
    // The partition is a string prefix and nothing else. Pinned because it is the only thing
    // standing between the task poll and the answer collection.
    useCanvasStore.getState().createPendingArtifact(seed("taskish-but-not-a-task"));
    useCanvasStore.getState().reconcileTaskArtifacts([]);

    expect(ids()).toEqual(["taskish-but-not-a-task"]);
    expect(TASK_ARTIFACT_PREFIX).toBe("task:");
  });
});

describe("useCanvasStore — clearCanvas", () => {
  it("resets EVERY slice including the provenance map — the only reclaim path there is", () => {
    // Session-reset escape hatch, never per-turn. It is also the sole thing that reclaims
    // orphan provenance entries and the only thing that lowers isRevealing.
    useCanvasStore.getState().createPendingArtifact(seed("a1"));
    useCanvasStore.getState().updateArtifact("ghost", { status: "complete" }, "sse:stream_end");
    useCanvasStore.getState().setActiveTab("SUSTAINMENT");
    useCanvasStore.getState().openInspector("urn:x:node");

    useCanvasStore.getState().clearCanvas();

    expect(artifacts()).toEqual([]);
    expect(store().currentArtifactId).toBeNull();
    expect(store().currentArtifactSetByUser).toBe(false);
    expect(store().isRevealing).toBe(false);
    expect(store().activeTab).toBe("ALL");
    expect(store().isInspectorOpen).toBe(false);
    expect(store().inspectedNodeId).toBeNull();
    expect(store()._lastUpdateSource).toEqual({});
  });
});
