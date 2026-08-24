/**
 * CHARACTERIZATION of the TASK → ARTIFACT adapter — the seam that makes a HITL task a
 * first-class timeline citizen instead of a bespoke surface.
 *
 * Three properties dominate this file.
 *
 * The first is THE TWO IDS. A `HumanTask` carries `id` (the per-recipient projection row)
 * and `taskId` (the logical Restate key). The artifact id is minted from the ROW id; the
 * `task_ref` carries the LOGICAL id, because that is the /act + fetchReviewBatch key. Both
 * are plausible strings on the same object, and a swap produces an app that looks correct
 * until a lookup silently misses. The fixture makes them deliberately different so the
 * round-trip cannot pass by coincidence.
 *
 * The second is THE CROSS-MAPPING. `taskToArtifact` puts the task's SUMMARY on
 * `question_text` and its TITLE on `summary`. That is surprising, it is deliberate
 * (`answerSummary` reads `summary` for the timeline lead line), and it is exactly the kind of
 * fact a field-name list cannot carry. It is also the mechanism behind filed finding 1.
 *
 * The third is REFERENCE IDENTITY AS CONTRACT. `useCanvasStore`'s reuse path compares
 * `rendered_output` BY REFERENCE. This module mints a fresh body object on every call for
 * every kind that HAS a body, so the reuse path can only ever fire for the one shape whose
 * body is `null`. The three findings filed against the reconciler are re-pinned here through
 * the REAL adapter — the store's own tests use hand-built fixtures, which prove the
 * reconciler's logic but not that this module actually produces the shapes that trigger it.
 *
 * Every derived sweep carries a POSITIVE CONTROL: a derivation that silently returns nothing
 * passes vacuously and reads as coverage while being none.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it, expect, beforeEach } from "vitest";
import type { Artifact } from "@/api/types";
import type { HumanTask } from "@/store/useHumanTaskStore";
import type { ReviewBatch } from "@/components/GroupedReview/types";
import { useCanvasStore } from "@/store/useCanvasStore";
import { taskKindDisplay } from "@/lib/taskKindRegistry";
import {
  taskToArtifact,
  taskArtifactId,
  taskRowIdOf,
  isTaskArtifact,
  taskKindLabel,
  TASK_ARTIFACT_PREFIX,
} from "./taskArtifact";

// ── Fixtures ──────────────────────────────────────────────────────────────────

/** `id` and `taskId` are deliberately unlike each other, and neither is a substring of the
 *  other. Every id assertion below depends on that: a fixture where they matched would let a
 *  row-id/task-id swap pass unnoticed, which is the single most expensive confusion here. */
const task = (o: Partial<HumanTask> = {}): HumanTask => ({
  id: "row-77",
  taskId: "utask-abc",
  workflowId: "wf-1",
  audience: "promotion:DATA_ENGINEERING",
  kind: "workflow_ack",
  status: "pending",
  title: "Approve promotion of alpha",
  summary: "Alpha passed every gate; approve to promote it to production.",
  requestedBy: "bob",
  subjectRef: "urn:x:alpha",
  createdAt: 1_700_000_000_000,
  ...o,
});

const batch = (id: string): ReviewBatch => ({
  batch_id: id,
  notice_id: "PCN-1",
  notice_type: "PCN",
  notice_fingerprint: "fp-1",
  approver: "bob",
  items: [],
});

const comp = (a: Artifact): Record<string, unknown> =>
  (a.rendered_output?.components[0] ?? {}) as Record<string, unknown>;

const store = () => useCanvasStore.getState();
const byId = (id: string) => store().artifacts.find((a) => a.id === id)!;

/** The registry's declared rows, read from its source — a sixth kind cannot inherit "tested"
 *  by being forgotten here. */
const REGISTRY_SRC = readFileSync(path.join(__dirname, "taskKindRegistry.ts"), "utf8");
const DECLARED_KINDS = (() => {
  const block = REGISTRY_SRC.match(/const REGISTRY:[^=]*=\s*\{([\s\S]*?)\n\};/)?.[1] ?? "";
  return [...block.matchAll(/^ {2}([a-z_]+):\s*\{/gm)].map((m) => m[1]);
})();

/** The task-status vocabulary, read from the store's own union. Terminal states are PER
 *  SPECIES (a triage task is acknowledged/redriven, never approved/rejected); only `pending`
 *  is load-bearing for queue filtering, so this list widens over time. */
const TASK_SRC = readFileSync(path.join(__dirname, "..", "store", "useHumanTaskStore.ts"), "utf8");
const TASK_STATUSES = (() => {
  const union = TASK_SRC.match(/status:\s*("pending"(?:\s*\|\s*"[a-z]+")*)/)?.[1] ?? "";
  return [...union.matchAll(/"([a-z]+)"/g)].map((m) => m[1] as HumanTask["status"]);
})();

beforeEach(() => {
  useCanvasStore.getState().clearCanvas();
});

describe("taskArtifact — the derived populations", () => {
  it("both derivations actually read their source modules — positive control", () => {
    // Every sweep below iterates these. A regex that matched nothing would make each of them
    // pass instantly over zero cases and report as coverage.
    expect(DECLARED_KINDS).toContain("grouped_review");
    expect(DECLARED_KINDS).toContain("extraction_refusal");
    expect(DECLARED_KINDS.length).toBeGreaterThanOrEqual(5);
    expect(TASK_STATUSES).toContain("pending");
    expect(TASK_STATUSES).toContain("acknowledged");
    expect(TASK_STATUSES.length).toBeGreaterThanOrEqual(6);
  });
});

describe("taskArtifactId / taskRowIdOf — the id the whole timeline keys on", () => {
  it("mints the id from the projection ROW id, NEVER the logical taskId", () => {
    // The live trap. `HumanTaskInboxBadge` computes `taskArtifactId(t.id)` to decide which
    // rows are unseen, and the reconciler keys its whole existing-set map on this id. Swap in
    // `task.taskId` and every one of those lookups misses silently: the badge stops matching,
    // and the reconciler treats every poll as a full replacement.
    const t = task();
    expect(t.id).not.toBe(t.taskId); // positive control: the two are genuinely distinguishable

    expect(taskArtifactId(t.id)).toBe("task:row-77");
    expect(taskToArtifact(t).id).toBe(taskArtifactId(t.id));
    expect(taskToArtifact(t).id).not.toContain(t.taskId);
  });

  it("round-trips EVERY row-id shape, including one that contains the prefix itself", () => {
    // `slice(prefix.length)` not `replace`, so a row id that itself starts with `task:` or
    // contains colons survives. Worth pinning: projection row ids are opaque and a future
    // URN-shaped id (`urn:li:humanTask:...`) is full of colons.
    const rowIds = ["row-77", "urn:li:humanTask:9", "task:nested", "with space", "0"];
    expect(rowIds.length).toBeGreaterThanOrEqual(5);

    for (const id of rowIds) {
      expect(taskRowIdOf(taskArtifactId(id)), id).toBe(id);
    }
  });

  it("returns NULL for an id that is not a task-artifact — an answer id never resolves to a row", () => {
    // The partition between the two populations in one collection is this string prefix and
    // nothing else. A non-null answer here would let the task poll reach into answers.
    for (const id of ["a1", "urn:li:answerArtifact:1", "", "TASK:row-77", " task:row-77"]) {
      expect(taskRowIdOf(id), id).toBeNull();
    }
  });

  it("the BARE prefix yields an empty string, not null — 'task:' reads as the row named ''", () => {
    // Pinned as found. `taskRowIdOf` answers "is this a task id" by prefix alone, so the
    // degenerate id claims to be a task-artifact for a row that cannot exist. Harmless today
    // because nothing mints it; recorded because the null-vs-"" distinction is the whole API.
    expect(taskRowIdOf(TASK_ARTIFACT_PREFIX)).toBe("");
    expect(taskRowIdOf(TASK_ARTIFACT_PREFIX)).not.toBeNull();
  });

  it("isTaskArtifact accepts EITHER signal — a task_ref alone, or the prefix alone", () => {
    // Two independent witnesses, deliberately OR'd: the prefix survives an artifact whose
    // task_ref was dropped by a partial update, and the task_ref survives an id scheme change.
    expect(isTaskArtifact({ id: "task:row-77" })).toBe(true);
    expect(isTaskArtifact({ id: "a1", task_ref: taskToArtifact(task()).task_ref })).toBe(true);
    expect(isTaskArtifact({ id: "a1" })).toBe(false);
    expect(isTaskArtifact({ id: "a1", task_ref: undefined })).toBe(false);
  });
});

describe("taskToArtifact — the synthetic artifact's shape", () => {
  it("is ALWAYS status 'complete' — pending-is-a-state lives on task_ref, not on status", () => {
    // `status` is the ANSWER's generation state; a task has none. Setting it to "pending" for
    // a pending task would make the timeline hide or spinner the row, and pending tasks are
    // the last thing that may be hidden. The task's own lifecycle rides task_ref.task_state,
    // which must carry the real value for every state in the vocabulary.
    expect(TASK_STATUSES.length).toBeGreaterThanOrEqual(6);

    for (const status of TASK_STATUSES) {
      const a = taskToArtifact(task({ status }));
      expect(a.status, status).toBe("complete");
      expect(a.task_ref!.task_state, status).toBe(status);
    }
  });

  it("CROSS-MAPS the task's body onto question_text and its TITLE onto summary", () => {
    // The surprising mapping, and the one a field-name list cannot carry. `answerSummary`
    // reads `summary` for the timeline lead line, so the TITLE is what the row shows and the
    // body lands in the question slot. Asserted in both directions — an "alignment" that made
    // summary carry the task's summary would silently change every task row's headline.
    const t = task();
    const a = taskToArtifact(t);

    expect(a.question_text).toBe(t.summary);
    expect(a.summary).toBe(t.title);
    expect(a.summary).not.toBe(t.summary);
    expect(a.question_text).not.toBe(t.title);
  });

  it("sources ALL THREE timestamps from createdAt — a task-artifact never appears to change", () => {
    // created_at IS updated_at IS valid_as_of. The timeline sorts on created_at, so the row
    // holds its chronological position when the task resolves (pending-is-a-state) instead of
    // jumping to "now". The cost is that `updated_at` cannot witness a task-state change.
    const a = taskToArtifact(task({ createdAt: 1_234 }));

    expect(a.created_at).toBe(1_234);
    expect(a.updated_at).toBe(1_234);
    expect(a.valid_as_of).toBe(1_234);
    expect(a.valid_until).toBeNull();
  });

  it("attributes production to the HITL agent, not to the requester", () => {
    // `produced_by` is answerer-side provenance (ADR-0009). A task was produced BY the HITL
    // mechanism FOR an approver; putting the requester here would conflate the two personas —
    // the exact conflation the two separate fields exist to prevent.
    expect(taskToArtifact(task()).produced_by).toEqual({ actor_type: "agent", actor_id: "hitl" });
  });

  it("claims produced_for.is_authenticated TRUE even when no requester is known", () => {
    // Pinned as found, not endorsed. `user_id` degrades honestly to "" when requestedBy is
    // blank, but `is_authenticated: true` is a hardcoded claim about a user the adapter cannot
    // identify. Nothing reads it for entitlement today; it is a synthesized fact sitting in a
    // provenance field, which is the category of thing that becomes load-bearing by accident.
    expect(taskToArtifact(task({ requestedBy: "bob" })).produced_for).toEqual({
      user_id: "bob",
      is_authenticated: true,
      entitlement_source: "none",
    });
    expect(taskToArtifact(task({ requestedBy: "" })).produced_for).toEqual({
      user_id: "",
      is_authenticated: true,
      entitlement_source: "none",
    });
  });

  it("mirrors the task onto task_ref, carrying the LOGICAL taskId there while the id carries the ROW", () => {
    // The two-id trap stated as one assertion. `task_ref.taskId` is the /act and
    // fetchReviewBatch key; the artifact id is the selection key. They are different strings
    // for the same task and each is wrong in the other's place.
    const t = task();
    const a = taskToArtifact(t);

    expect(a.task_ref).toEqual({
      taskId: "utask-abc",
      workflowId: "wf-1",
      kind: "workflow_ack",
      task_state: "pending",
      audience: "promotion:DATA_ENGINEERING",
      requestedBy: "bob",
      subjectRef: "urn:x:alpha",
    });
    expect(a.id).toBe("task:row-77");
    expect(a.task_ref!.taskId).not.toBe(taskRowIdOf(a.id));
  });

  it("carries EMPTY provenance and a 'durable' claim — nothing here came from the projector", () => {
    // A task-artifact is minted client-side and never round-trips through the projector, so
    // routing/sources/graph_trace are honestly empty and watermark is the 0 sentinel meaning
    // "no server-assigned position". `durability_status: "durable"` is the odd one out: it is
    // asserted, not observed, for an object nothing persisted. Pinned as found.
    const a = taskToArtifact(task());

    expect(a.routing).toBeNull();
    expect(a.sources).toEqual([]);
    expect(a.graph_trace).toEqual([]);
    expect(a.graph_trace_alternates).toEqual([]);
    expect(a.derived_from_artifact_id).toBeNull();
    expect(a.resolved_intent).toEqual({});
    expect(a.message_id).toBe("");
    expect(a.watermark).toBe(0);
    expect(a.durability_status).toBe("durable");
  });
});

describe("taskToArtifact — the card species, keyed on ARCHETYPE not on the kind string", () => {
  it("renders EVERY declared kind through its registry archetype", () => {
    // The discipline the registry exists to enforce: a new kind is a ROW, never a branch here.
    // Asserted against `taskKindDisplay` rather than literals, so a `kind === "..."` branch
    // sneaked into the adapter diverges from the table and fails — while a table edit does not.
    const withBody = DECLARED_KINDS.filter(
      (k) => taskKindDisplay(k).archetype !== "GROUPED_REVIEW",
    );
    expect(withBody.length).toBeGreaterThanOrEqual(4);
    expect(new Set(withBody.map((k) => taskKindDisplay(k).archetype)).size).toBeGreaterThanOrEqual(2);

    for (const kind of withBody) {
      expect(comp(taskToArtifact(task({ kind }))).archetype, kind).toBe(
        taskKindDisplay(kind).archetype,
      );
    }
  });

  it("an UNDECLARED kind still gets an APPROVAL_TASK body — the default is a card WITH verbs", () => {
    // The honest-default's blind spot, stated where it bites. The badge degrades to "TASK",
    // but the archetype names the approval species, so an unregistered kind is handed the
    // accept/reject card. The registry's comment says ApprovalTaskCard renders it read-only;
    // that gating is downstream of here, so this module alone cannot be read as safe.
    const a = taskToArtifact(task({ kind: "a_kind_nobody_registered" }));

    expect(comp(a).archetype).toBe("APPROVAL_TASK");
    expect(taskKindLabel("a_kind_nobody_registered")).toBe("TASK");
  });

  it("the APPROVAL_TASK body carries task_id = the LOGICAL id and task_state = the task's status", () => {
    // The card acts through `task_id` (the /act key). Feeding it the ROW id would produce a
    // card whose buttons 404 against a task that plainly exists on screen.
    expect(comp(taskToArtifact(task())).task).toEqual({
      task_id: "utask-abc",
      kind: "workflow_ack",
      task_state: "pending",
      title: "Approve promotion of alpha",
      summary: "Alpha passed every gate; approve to promote it to production.",
      audience: "promotion:DATA_ENGINEERING",
      requested_by: "bob",
      subject_ref: "urn:x:alpha",
    });
  });

  it("the TRIAGE_TASK body adds warnings / reason_code / pages ON TOP of the same base fields", () => {
    // The third species: an unprocessable input, not a decision. The warnings are the WHY that
    // makes a refusal actionable and the pages are the failed extraction itself — threaded
    // through the payload rather than re-fetched, so no second join can silently stop happening.
    const t = task({
      kind: "extraction_refusal",
      payload: { warnings: ["header pass timed out"], reason_code: "NO_PARTS_TABLE", pages: [{ n: 1 }] },
    });
    const body = comp(taskToArtifact(t)).task as Record<string, unknown>;

    expect(comp(taskToArtifact(t)).archetype).toBe("TRIAGE_TASK");
    expect(body.warnings).toEqual(["header pass timed out"]);
    expect(body.reason_code).toBe("NO_PARTS_TABLE");
    expect(body.pages).toEqual([{ n: 1 }]);
    expect(body.task_id).toBe("utask-abc"); // the base is spread in, not replaced
    expect(body.title).toBe(t.title);
  });

  it("defaults every triage payload field for an absent, null, or partial payload", () => {
    // A refusal with no payload is a real shape (an older producer, or a redacted one). The
    // card maps over `warnings` and reads `reason_code` directly; `undefined` there is a blank
    // card at best and a throw at worst, so the empty-but-present defaults are load-bearing.
    const shapes: Array<[string, HumanTask["payload"]]> = [
      ["absent", undefined],
      ["null", null],
      ["empty object", {}],
      ["only reason_code", { reason_code: "X" }],
    ];
    expect(shapes.length).toBeGreaterThanOrEqual(4);

    for (const [why, payload] of shapes) {
      const body = comp(taskToArtifact(task({ kind: "extraction_refusal", payload }))).task as Record<
        string,
        unknown
      >;
      expect(body.warnings, why).toEqual([]);
      expect(body.pages, why).toEqual([]);
      expect(body.reason_code, why).toBe(payload?.reason_code ?? "");
    }
  });

  it("a GROUPED_REVIEW with no batch has NO BODY AT ALL — rendered_output is null, not an empty envelope", () => {
    // The distinction the lazy-fetch effect depends on. `useTaskArtifactSync` fetches the
    // batch on first selection and skips any artifact whose components are non-empty; an
    // empty `{ components: [] }` would read as a body to some checks and as absence to others.
    const a = taskToArtifact(task({ kind: "grouped_review" }));

    expect(a.rendered_output).toBeNull();
    expect(a.summary).toBe(task().title); // the card still has its title to show
  });

  it("a GROUPED_REVIEW WITH a batch embeds it BY REFERENCE, not a copy", () => {
    // Load-bearing for the reuse path: the reconciler compares rendered_output by reference,
    // and the preserved body must stay identical across re-adaptation. A defensive clone here
    // would look harmless and would defeat the preservation the reviewer's in-progress edit
    // depends on.
    const b = batch("b1");
    const a = taskToArtifact(task({ kind: "grouped_review" }), b);

    expect(comp(a).archetype).toBe("GROUPED_REVIEW");
    expect(comp(a).batch).toBe(b);
  });

  it("IGNORES the batch argument for every non-GROUPED_REVIEW kind", () => {
    // The batch is meaningful only to the review archetype. Pinned so a future kind that
    // starts carrying one fails here rather than smuggling review rows into an approval card.
    for (const kind of ["workflow_ack", "extraction_refusal", "a_kind_nobody_registered"]) {
      const a = taskToArtifact(task({ kind }), batch("b1"));
      expect(JSON.stringify(a.rendered_output), kind).not.toContain("b1");
    }
  });

  it("the ONLY production caller passes NO batch — the parameter is dead outside tests", () => {
    // NEW FINDING, pinned at the source level because no runtime assertion can see it. Unit
    // coverage of a helper does not prove its callers use it: `useTaskArtifactSync` is the
    // sole caller and it calls `taskToArtifact(t)` with one argument, so the batch-carrying
    // branch above NEVER runs in production. A real batch reaches the artifact only later, via
    // `updateArtifact`. That is why the reconciler's preserve rule is the only thing keeping a
    // fetched batch alive — and why the batchless `null` body is the shape that actually ships.
    const SYNC_SRC = readFileSync(path.join(__dirname, "useTaskArtifactSync.ts"), "utf8");

    expect(SYNC_SRC).toContain("taskToArtifact(t)");
    expect(SYNC_SRC).not.toMatch(/taskToArtifact\([^)]*,/);
  });
});

describe("FILED FINDING 2 — the reuse optimisation is defeated by fresh body objects", () => {
  it("mints a FRESH rendered_output on EVERY call for every kind that has a body", () => {
    // The mechanism behind the churn. The reconciler's equality check compares
    // `rendered_output` by reference; this module builds a new `{ components: [...] }` (and a
    // new component object inside it) each time it is called, so two adaptations of the SAME
    // task object can never be reference-equal. Deep-equal, but never identical.
    const withBody = DECLARED_KINDS.filter((k) => taskKindDisplay(k).archetype !== "GROUPED_REVIEW");
    expect(withBody.length).toBeGreaterThanOrEqual(4);

    for (const kind of withBody) {
      const t = task({ kind });
      expect(taskToArtifact(t).rendered_output, kind).not.toBe(taskToArtifact(t).rendered_output);
      expect(taskToArtifact(t).rendered_output, kind).toEqual(taskToArtifact(t).rendered_output);
    }
  });

  it("only the batchless GROUPED_REVIEW passes the reference check — because its body is null", () => {
    // `null === null`. The single shape for which the reuse path can fire is the one whose
    // body does not exist yet, which is the opposite of the case the optimisation was written
    // for (a reviewer mid-edit inside a FETCHED batch).
    const t = task({ kind: "grouped_review" });

    expect(taskToArtifact(t).rendered_output).toBe(taskToArtifact(t).rendered_output);
    expect(taskToArtifact(t).rendered_output).toBeNull();
  });

  it("so an APPROVAL task CHURNS A NEW OBJECT ON EVERY POLL — the remount the reuse path exists to prevent", () => {
    // The defect end-to-end, through the real adapter rather than a hand-built fixture. The
    // sync effect re-adapts the whole task list on each store emission; nothing about this task
    // changed, and the store still hands every consumer a new object. Anything holding local
    // state keyed on that identity (an in-progress edit, a focused input) is remounted.
    const t = task();
    store().reconcileTaskArtifacts([taskToArtifact(t)]);
    const before = byId("task:row-77");

    store().reconcileTaskArtifacts([taskToArtifact(t)]);

    expect(byId("task:row-77")).not.toBe(before);
    expect(byId("task:row-77")).toEqual(before); // identical content — only identity changed
  });

  it("the batchless GROUPED_REVIEW is the ONE shape the reuse path actually saves", () => {
    // The other half, and the measure of how little the optimisation buys as written: it fires
    // exactly where there is no body to protect.
    const t = task({ kind: "grouped_review" });
    store().reconcileTaskArtifacts([taskToArtifact(t)]);
    const before = byId("task:row-77");

    store().reconcileTaskArtifacts([taskToArtifact(t)]);

    expect(byId("task:row-77")).toBe(before);
  });
});

describe("FILED FINDING 1 — a changed task BODY is invisible to the equality check", () => {
  it("DROPS an edited summary on a grouped review — question_text is never compared", () => {
    // The staleness hole, end-to-end. The task's body text moved to `question_text`; the
    // reconciler compares `summary` (which holds the TITLE) and not `question_text`, so a task
    // whose body changed while its title did not is judged unchanged and the stale object is
    // reused verbatim. The positive control matters: the ADAPTER does carry the new text, so
    // the loss is entirely the comparison's.
    const before = task({ kind: "grouped_review", summary: "before" });
    const after = task({ kind: "grouped_review", summary: "AFTER" });
    expect(taskToArtifact(after).question_text).toBe("AFTER"); // the adapter is not at fault

    store().reconcileTaskArtifacts([taskToArtifact(before)]);
    store().reconcileTaskArtifacts([taskToArtifact(after)]);

    expect(byId("task:row-77").question_text).toBe("before");
  });

  it("the SAME edit survives on an approval task only BY ACCIDENT — finding 2 masks finding 1", () => {
    // The two filed defects interact, and that is worth stating explicitly: an approval task's
    // fresh `rendered_output` fails the reference check on every poll, which forces a new
    // object and carries the edited text along with it. Fix the churn (finding 2) without
    // fixing the comparison (finding 1) and this row starts going stale — a "performance fix"
    // that manufactures a correctness bug.
    const before = task({ summary: "before" });
    const after = task({ summary: "AFTER" });

    store().reconcileTaskArtifacts([taskToArtifact(before)]);
    store().reconcileTaskArtifacts([taskToArtifact(after)]);

    expect(byId("task:row-77").question_text).toBe("AFTER");
    expect((comp(byId("task:row-77")).task as Record<string, unknown>).summary).toBe("AFTER");
  });
});

describe("FILED FINDING 3 — the lazy-fetched batch across a task-state update", () => {
  it("PRESERVES the fetched batch when the re-adapted task arrives with no body", () => {
    // The reconciler's stated purpose, verified against what the sync effect actually emits:
    // `taskToArtifact(t)` with no batch, i.e. `rendered_output: null`. The batch exists only
    // client-side, so without the preserve rule an approval landing on any task would empty
    // the card the reviewer is working inside — with no way to tell why.
    const b = batch("b1");
    const pending = task({ kind: "grouped_review" });
    store().reconcileTaskArtifacts([taskToArtifact(pending, b)]);
    const before = byId("task:row-77");

    store().reconcileTaskArtifacts([taskToArtifact(task({ kind: "grouped_review", status: "approved" }))]);

    expect(byId("task:row-77").rendered_output).toBe(before.rendered_output);
    expect(comp(byId("task:row-77")).batch).toBe(b);
    expect(byId("task:row-77").task_ref!.task_state).toBe("approved");
    expect(byId("task:row-77")).not.toBe(before); // a real state change still yields a new object
  });

  it("a RE-FETCHED batch REPLACES the preserved one — preservation is not stickiness", () => {
    // The half that makes the preserve rule safe. Preservation only fires when the incoming
    // body is absent; a genuinely new batch wins, so a reviewer is never left dispositioning
    // rows the server has already replaced.
    const first = batch("b1");
    const second = batch("b2");
    const t = task({ kind: "grouped_review" });
    store().reconcileTaskArtifacts([taskToArtifact(t, first)]);

    store().reconcileTaskArtifacts([taskToArtifact(t, second)]);

    expect(comp(byId("task:row-77")).batch).toBe(second);
  });

  it("the preserved batch also survives a poll where NOTHING changed", () => {
    // The steady state between selection and resolution: the effect re-adapts a batchless
    // artifact on every emission. Preservation has to hold repeatedly, not just once.
    const b = batch("b1");
    const t = task({ kind: "grouped_review" });
    store().reconcileTaskArtifacts([taskToArtifact(t, b)]);
    const before = byId("task:row-77");

    store().reconcileTaskArtifacts([taskToArtifact(t)]);
    store().reconcileTaskArtifacts([taskToArtifact(t)]);

    expect(byId("task:row-77")).toBe(before);
    expect(comp(byId("task:row-77")).batch).toBe(b);
  });
});
