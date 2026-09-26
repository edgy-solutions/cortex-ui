/**
 * WHAT A COMPOSER TURN IS ALLOWED TO CLAIM AS ITS PARENT.
 *
 * Every assertion here is about a MERGE that creates what it cannot find. A wrong id does not
 * 422 and does not warn — it writes an `AnswerArtifact` node that no producer made, and the rail
 * then folds cards onto a lineage nobody produced. So the negative cases are the point of this
 * file and the positive one is the control: four guards that all returned `undefined` would be
 * indistinguishable from a function that returns `undefined` always.
 */
import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import type { Artifact } from "@/api/types";
import { drawnLineageClaim } from "@/lib/drawnLineage";

const answer = (o: Partial<Artifact> = {}): Artifact => ({
  id: "a1",
  created_at: 1_000,
  updated_at: 1_000,
  valid_as_of: 1_000,
  valid_until: null,
  question_text: "what is the burn rate?",
  summary: "",
  resolved_intent: {},
  message_id: "msg-a1",
  status: "complete",
  rendered_output: null,
  produced_by: { actor_type: "agent", actor_id: "engine_a" },
  produced_for: { user_id: "bob", is_authenticated: true, entitlement_source: "none" },
  routing: null,
  sources: [],
  graph_trace: [],
  graph_trace_alternates: [],
  derived_from_artifact_id: null,
  durability_status: "durable",
  watermark: 1,
  ...o,
});

describe("the claim a drawn card may be defaulted into", () => {
  it("THE CONTROL — a durable, non-task, non-ask answer yields its id", () => {
    // Without this the four refusals below prove nothing: a function that always returned
    // undefined would pass every one of them.
    expect(drawnLineageClaim(answer({ id: "ans-7" }))).toBe("ans-7");
  });

  it("nothing drawn claims nothing", () => {
    expect(drawnLineageClaim(null)).toBeUndefined();
    expect(drawnLineageClaim(undefined)).toBeUndefined();
  });

  it("a synthetic TASK artifact is refused — its id is a task-store row, not an artifact", () => {
    // Tasks and answers share the collection by design, so the foregrounded id is routinely a
    // `task:` one. No AnswerArtifact ever had it; MERGE would invent one.
    expect(drawnLineageClaim(answer({ id: "task:row-9" }))).toBeUndefined();
    // And by the OTHER half of isTaskArtifact — a task_ref without the prefix is still a task.
    expect(
      drawnLineageClaim(
        answer({
          id: "looks-ordinary",
          task_ref: {
            taskId: "t-9",
            workflowId: null,
            kind: "risk_acceptance_medium",
            task_state: "pending",
            audience: "SAFETY_ENGINEER",
            requestedBy: "mesh",
            subjectRef: null,
          },
        }),
      ),
    ).toBeUndefined();
  });

  it("⛔ NOT IN THE GRAPH OF RECORD IS REFUSED — and `status` cannot answer that question", () => {
    // Both non-durable values, because they fail for different reasons and both conjure:
    // `persistence_pending` is a write still in flight, `persistence_failed` is one that gave up
    // after its retry budget — the type's own words are "the user has the answer, but it is NOT
    // in the graph-of-record".
    expect(drawnLineageClaim(answer({ durability_status: "persistence_pending" }))).toBeUndefined();
    expect(drawnLineageClaim(answer({ durability_status: "persistence_failed" }))).toBeUndefined();
    // THE CONFLATION THIS PREVENTS, asserted rather than described: a row the PIPELINE calls
    // complete while the SUBSTRATE has nothing. Reading `status` here would pass this card.
    expect(
      drawnLineageClaim(answer({ status: "complete", durability_status: "persistence_failed" })),
    ).toBeUndefined();
  });

  it("an ASK is never defaulted to, because the default would fold it away", () => {
    // The reader typed a question INSTEAD of answering this one. Claiming it would let
    // `askFold` hide the ask, and what replaced it would answer something else.
    const ask = answer({
      rendered_output: { components: [{ archetype: "ELICITATION" }] } as Artifact["rendered_output"],
    });
    expect(drawnLineageClaim(ask)).toBeUndefined();
    // The control on the control: the SAME card with a non-ask component is claimable, so the
    // refusal above is about the archetype and not about having a rendered_output at all.
    expect(
      drawnLineageClaim(
        answer({
          id: "ans-8",
          rendered_output: {
            components: [{ archetype: "MULTI_SERIES" }],
          } as Artifact["rendered_output"],
        }),
      ),
    ).toBe("ans-8");
  });

  it("a blank id is not an id", () => {
    expect(drawnLineageClaim(answer({ id: "   " }))).toBeUndefined();
  });
});

/**
 * ── THE DEFAULT LIVES IN ONE PLACE, AND THAT IS ASSERTED ───────────────────────────────────
 *
 * ⛔ This file's reason for existing is that the claim was wired at the two sites someone was
 * reading — the ask card and the reopen path — and the composer, which is the surface a safety
 * turn and the HAZ-1003 question actually go through, was not among them. Wiring added at "the"
 * call site lands on a subset of the branches that ship.
 *
 * So the fix is a DEFAULT inside the single hook every send funnels through, and this seal is
 * what keeps it there: the moment a component reaches for `drawnLineageClaim` itself, the
 * default has started growing per-surface copies again and this goes red.
 */
describe("the default is mounted once, not per surface", () => {
  it("exactly one non-test module calls drawnLineageClaim, and it is the send hook", () => {
    // `src` itself — the sweep must reach every surface, not just the hooks directory.
    const SRC = path.join(__dirname, "..");
    const walk = (dir: string): string[] =>
      readdirSync(dir).flatMap((n) => {
        const p = path.join(dir, n);
        return statSync(p).isDirectory() ? walk(p) : [p];
      });
    const files = walk(SRC).filter(
      (p) =>
        /\.(ts|tsx)$/.test(p) &&
        !/\.test\.(ts|tsx)$/.test(p) &&
        !p.endsWith(path.join("lib", "drawnLineage.ts")),
    );
    // The control: the sweep really walked the source tree. A bad root would otherwise make the
    // count below zero and the assertion would read as "nobody imports it", which is false.
    expect(files.length, "the source sweep found nothing — the roots are wrong").toBeGreaterThan(
      200,
    );

    const callers = files.filter((p) => readFileSync(p, "utf8").includes("drawnLineageClaim"));
    expect(callers.map((p) => path.basename(p))).toEqual(["useInterviewAgent.ts"]);
  });
});
