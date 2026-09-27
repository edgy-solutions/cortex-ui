/**
 * A CLAIM CORTEX POSTS AND THE SERVER THROWS AWAY.
 *
 * `useInterviewAgent.test.ts` seals, in six arms, exactly which artifact id a composer turn
 * posts as `answering_artifact_id`. Every one of them passes. None of them asks whether the
 * server KEEPS it — and measured 2026-09-27 against `gateway.py`, it does not:
 *
 *     _answers_something = bool(request.bound_slots) or bool(request.spoken_answer)
 *
 * A turn typed into the composer carries neither. `boundSlotsBody(undefined)` and
 * `spokenAnswerBody(undefined)` both return `{}` by design, so the guard refuses the claim, logs
 * a warning, and nulls the variable that THREE separate consumers then read: the pre-resolved
 * route (the one that skips /plan, /resolve and /classify_predicate), the accumulated chain
 * slots, and `derived_from_artifact_id` on the written artifact.
 *
 * ⛔ THE COMPOSER IS THE TURN THE FEATURE WAS BUILT FOR. `useInterviewAgent.ts:512` names it:
 * "A turn typed into the composer — which is how a safety question is asked, and how `draft a
 * risk assessment for HAZ-1003` was asked — carried no lineage at all". The default was added
 * there, it posts correctly, and the safety turn is the exact shape the server refuses. Six
 * green arms over a send whose every consumer receives None.
 *
 * ── WHAT WAS UNREACHABLE, AND WHAT REACHING IT SHOWED ─────────────────────────────────────
 *
 * The refusal branch at `gateway.py:4872` is reachable only from a body that names an ask while
 * carrying no answer. Before the drawn-card default no cortex path could build one — both ask
 * paths guard their payload in `rerouteDispatch`, and the composer sent no claim at all — so the
 * branch was dead code on this client. Defaulting the claim made it reachable, and what it
 * reports is that the turn it fires on is the one the change was for.
 *
 * ── WHOSE DECISION THIS IS, STATED SO IT STOPS BEING SYMMETRIC ────────────────────────────
 *
 * Cortex CANNOT close this alone and must not try. Satisfying the guard means posting
 * `spoken_answer`, which the gateway model pairs with `spoken_slot`, and a composer turn has no
 * slot name — one would have to be invented, and `spoken_slot` feeds the resolution ladder. So
 * fabricating a slot to buy a lineage edge would trade a missing arrow for a wrong route.
 *
 * THE QUESTION IS THE ARCHITECT'S: should a turn that names a drawn answer and carries the
 * reader's typed words in `message` count as answering it? The guard's own comment says a turn
 * with neither pick nor typed reply "is an ordinary question", and a safety question answered in
 * prose is not an ordinary question. Until that is ruled, the arms below assert the REFUSAL as
 * the current truth. They go red the day the platform honours it, which is the point: this is a
 * tripwire on someone else's decision, not a shrug about it.
 */
import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import {
  answeringArtifactBody,
  lineageClaimVerdict,
  type LineageBearingBody,
} from "./answeringArtifact";
import { boundSlotsBody } from "./boundSlots";
import { spokenAnswerBody } from "./spokenAnswer";

const GATEWAY = path.join(__dirname, "../../../invincible-agent/src/iagent/gateway.py");
const HAVE_GATEWAY = existsSync(GATEWAY);

/** The claim, plus whatever answer the turn carries. */
const body = (o: LineageBearingBody = {}): LineageBearingBody => o;

describe("the three states, because `nothing claimed` is not `claim discarded`", () => {
  it("a claim beside a pick is HONOURED", () => {
    expect(
      lineageClaimVerdict(body({ answering_artifact_id: "ask-1", bound_slots: { s: "C7" } })),
    ).toBe("honoured");
  });

  it("a claim beside typed words is HONOURED", () => {
    expect(
      lineageClaimVerdict(body({ answering_artifact_id: "ask-1", spoken_answer: "meridian" })),
    ).toBe("honoured");
  });

  it("a claim with NEITHER is REFUSED, which is the composer turn", () => {
    expect(lineageClaimVerdict(body({ answering_artifact_id: "prev-answer" }))).toBe("refused");
  });

  it("no claim is NO_CLAIM and never `refused`", () => {
    // The distinction the three-state return exists for: an ordinary question is not a dropped
    // lineage, and a boolean would report both as false. Diagnosing one as the other is what
    // left 14 artifacts' worth of null `derived_from_artifact_id` ambiguous for a fortnight.
    expect(lineageClaimVerdict(body({}))).toBe("no_claim");
    expect(lineageClaimVerdict(body({ answering_artifact_id: "" }))).toBe("no_claim");
    expect(lineageClaimVerdict(body({ bound_slots: { s: "C7" } }))).toBe("no_claim");
  });

  it("⛔ AN EMPTY `bound_slots` MAP IS REFUSED — Python truthiness, not JS", () => {
    // `bool({})` is False; `{}` is truthy. The obvious JS spelling of this clause —
    // `if (body.bound_slots || body.spoken_answer)` — calls this honoured and is wrong. The
    // mirror answers what the SERVER does, so it must get this backwards-looking case right.
    expect(lineageClaimVerdict(body({ answering_artifact_id: "ask-1", bound_slots: {} }))).toBe(
      "refused",
    );
    expect(lineageClaimVerdict(body({ answering_artifact_id: "ask-1", spoken_answer: "" }))).toBe(
      "refused",
    );
  });

  it("whitespace words are HONOURED, because the server does not trim and cortex does", () => {
    // `bool(" ")` is True to Python. Asserted rather than left implicit so nobody "fixes" the
    // mirror into being stricter than the thing it mirrors — and the second half is why that
    // laxness costs nothing: `spokenAnswerBody` drops such an answer before the post.
    expect(lineageClaimVerdict(body({ answering_artifact_id: "ask-1", spoken_answer: "   " }))).toBe(
      "honoured",
    );
    expect(spokenAnswerBody({ slot: "s", answer: "   " })).toEqual({});
  });
});

describe("the verdict over the bodies cortex actually assembles", () => {
  /** Exactly the three spreads `useInterviewAgent` puts in an `InterviewRequest`. */
  const posted = (
    claim: string | undefined,
    boundSlots?: Record<string, string>,
    spoken?: { slot: string; answer: string },
  ): LineageBearingBody => ({
    ...boundSlotsBody(boundSlots),
    ...spokenAnswerBody(spoken),
    ...answeringArtifactBody(claim),
  });

  it("a BIND from an ask card is honoured", () => {
    expect(lineageClaimVerdict(posted("ask-1", { capability_id: "C4" }))).toBe("honoured");
  });

  it("a RESPEAK from an ask card is honoured", () => {
    expect(
      lineageClaimVerdict(posted("ask-1", undefined, { slot: "s", answer: "meridian" })),
    ).toBe("honoured");
  });

  it("⛔ THE COMPOSER SAFETY TURN IS REFUSED — the claim is posted and discarded", () => {
    // Built from the real body-assembling functions, so this cannot pass by my mis-remembering
    // what a composer turn posts. The claim IS there — that half of the feature works.
    const b = posted("prev-answer");
    expect(b.answering_artifact_id).toBe("prev-answer");
    expect(b).not.toHaveProperty("bound_slots");
    expect(b).not.toHaveProperty("spoken_answer");
    expect(lineageClaimVerdict(b)).toBe("refused");
  });
});

describe("the mirror against the gateway, read live", () => {
  it.skipIf(!HAVE_GATEWAY)("mirrors BOTH clauses of `_answers_something` and no third one", () => {
    /*
      ⛔ THE CENSUS IS OVER THE GUARD'S OWN EXPRESSION, BOTH DIRECTIONS. `boundSlots.test.ts`
      asserts only that the string `_answers_something` occurs in the file, which is a
      containment check and cannot see a clause being added or removed. A THIRD way to satisfy
      the guard appearing upstream would leave this mirror quietly reporting `refused` for turns
      the server now honours — wrong in the safe-looking direction, which is the one nobody
      investigates.
    */
    const src = readFileSync(GATEWAY, "utf8");
    const line = src.match(/^\s*_answers_something\s*=\s*(.+)$/m);
    expect(line, "no `_answers_something = ...` assignment found in gateway.py").toBeTruthy();
    const fields = [...line![1].matchAll(/request\.([a-z_]+)/g)].map((m) => m[1]);
    expect(fields.length, "the extraction found no `request.<field>` at all").toBeGreaterThan(0);
    expect([...fields].sort()).toEqual(["bound_slots", "spoken_answer"]);
  });

  it.skipIf(!HAVE_GATEWAY)("the claim is nulled by that guard, not merely logged beside it", () => {
    // The difference between a warning and a consequence. A guard that logged and carried on
    // would make every arm above wrong while every string this file greps for still matched.
    const src = readFileSync(GATEWAY, "utf8");
    expect(src).toMatch(
      /_answering_artifact_id\s*=\s*\(\s*\(request\.answering_artifact_id or None\)\s*if _answers_something else None\s*\)/,
    );
  });

  it.skipIf(!HAVE_GATEWAY)(
    "and ALL THREE consumers read the nulled value, so a refusal costs three things",
    () => {
      /*
        The arm that makes the finding worth its words. "A refused claim loses a lineage arrow"
        would be a small defect; the same refusal also skips the route reuse and the inherited
        slots, which is the 40-second cost the gateway's own log line names. Asserted per
        consumer, because a count would pass if the wrong three matched.
      */
      const src = readFileSync(GATEWAY, "utf8");
      expect(src).toContain("_pre_resolved_from_ask(_answering_artifact_id or");
      expect(src).toContain("_accumulated_slots(_answering_artifact_id or");
      expect(src).toMatch(/"derived_from_artifact_id":\s*_answering_artifact_id/);
    },
  );

  it.skipIf(!HAVE_GATEWAY)("the refusal branch cortex now reaches is still the one that fires", () => {
    // Named so a rename upstream cannot turn this whole file into a seal over a branch that no
    // longer exists. The warning's own words are the anchor, since they are what an operator
    // greps for when the arrow is missing.
    const src = readFileSync(GATEWAY, "utf8");
    expect(src).toContain("if request.answering_artifact_id and not _answers_something:");
    expect(src).toContain("lineage claim REFUSED");
  });
});
