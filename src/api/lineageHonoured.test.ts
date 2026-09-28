/**
 * A CLAIM CORTEX POSTS — AND THE RULE THAT DECIDES WHETHER THE SERVER KEEPS IT.
 *
 * `useInterviewAgent.test.ts` seals, in six arms, exactly which artifact id a composer turn posts
 * as `answering_artifact_id`. Every one of them passes. None of them asks whether the server KEEPS
 * it. When this file was written, measured 2026-09-27 against `gateway.py`, it did not:
 *
 *     _answers_something = bool(request.bound_slots) or bool(request.spoken_answer)
 *
 * A turn typed into the composer carries neither, so the guard refused the claim, logged a warning,
 * and nulled the variable that THREE separate consumers read: the pre-resolved route (the one that
 * skips /plan, /resolve and /classify_predicate), the accumulated chain slots, and
 * `derived_from_artifact_id` on the written artifact. Six green arms over a send whose every
 * consumer received None — and the composer is the turn the feature was built for, which
 * `useInterviewAgent.ts:512` names: "a turn typed into the composer — which is how a safety
 * question is asked, and how `draft a risk assessment for HAZ-1003` was asked — carried no lineage
 * at all".
 *
 * ── THE RULING ARRIVED THE SAME DAY, AND IT WENT THE OTHER WAY ─────────────────────────────
 *
 * This file's first header put the question to the architect — should a turn that names a drawn
 * answer and carries the reader's typed words in `message` count as answering it? — and said the
 * arms "go red the day the platform honours it, which is the point: this is a tripwire on someone
 * else's decision, not a shrug about it."
 *
 * `invincible-agent` d3944da8 (2026-09-27) ruled it, and answered neither of the two options
 * cortex had framed. Not a third clause in `_answers_something` — that would have widened the
 * pre-resolved route along with the arrow — and not cortex withdrawing the claim. The one predicate
 * was SPLIT, and the rule moved out of the handler to `iagent_pure/lineage_claim.py`:
 *
 *     named + (pick or typed answer)        -> honoured
 *     named + prose + ask is the caller's   -> honoured   <- the widened arm, HAZ-1003's turn
 *     named + prose + ask is NOT theirs     -> refused    (REFUSED_NOT_THE_CALLERS)
 *     named + neither + no prose            -> refused    (REFUSED_NOTHING_CARRIED)
 *     nothing named                         -> no claim, and deliberately NOT a refusal
 *
 * and `pre_resolved_route_allowed(answers_something=...)` kept the NARROW predicate, taking it as
 * its only argument precisely so it cannot inherit a later widening of the arrow.
 *
 * ── HOW CORTEX FOUND OUT, WHICH IS NOT HOW CORTEX MEANT TO ────────────────────────────────
 *
 * Two tripwires were laid for this ruling and BOTH were keyed one address too low:
 *
 *   1. `useInterviewAgent.test.ts`'s composer arm asserts `lineageClaimVerdict(body) === "refused"`.
 *      `lineageClaimVerdict` is cortex's COPY of the rule, so on the day the producer changed, the
 *      arm compared the mirror to itself and stayed GREEN. An arm pinned to a mirror cannot report
 *      that the mirror is stale.
 *
 *   2. The census arm below anticipated exactly this failure — its comment warns that "a THIRD way
 *      to satisfy the guard appearing upstream would leave this mirror quietly reporting `refused`
 *      for turns the server now honours" — and it censused the right-hand side of
 *      `_answers_something`. The third way was not added there. It was added one level up, as a
 *      separate predicate, and `_answers_something` still has exactly its two clauses. The arm is
 *      still correct and still passed.
 *
 * What reddened were the two arms that read the producer's source and asserted the SHAPE OF THE
 * DECISION rather than the spelling of one expression. That is the argument for reading a peer
 * instead of restating it, and `lineage_claim.py`'s own docstring makes the same one: "with a rule
 * inlined in a handler, a seal can only MIRROR it, and a mirror is not a seal."
 *
 * So the live arms below now read the RULE MODULE, which is where the decision lives, and keep the
 * gateway arms for the wiring — the call site, the nulling, and the three consumers — because that
 * is what the gateway still owns.
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

const PEER = path.join(__dirname, "../../../invincible-agent/src");
const GATEWAY = path.join(PEER, "iagent/gateway.py");
/** The rule's own address as of d3944da8. A seal over the handler can only mirror it. */
const RULE = path.join(PEER, "iagent_pure/lineage_claim.py");
const HAVE_GATEWAY = existsSync(GATEWAY);
const HAVE_RULE = existsSync(RULE);

/** The claim, plus whatever answer the turn carries. */
const body = (o: LineageBearingBody = {}): LineageBearingBody => o;

describe("the four states, because `nothing claimed` is not `claim discarded`", () => {
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

  it("a claim beside PROSE is the graph's to decide — the arm d3944da8 widened", () => {
    /*
      The composer turn, and the one this whole file was opened about. It is no longer `refused`,
      and it is not `honoured` either: the server honours it if and only if `_artifact_is_the_callers`
      finds the named ask in the graph under this caller, which is a read cortex cannot perform.
      The fourth state names that decider instead of guessing on its behalf.
    */
    expect(
      lineageClaimVerdict(
        body({ answering_artifact_id: "prev-answer", message: "is HAZ-1003 still open?" }),
      ),
    ).toBe("ownership_decides");
  });

  it("a claim with NEITHER and no prose is REFUSED, and that arm did not move", () => {
    // REFUSED_NOTHING_CARRIED. The widening did not make the guard toothless: a turn naming an ask
    // while carrying nothing at all is still an ordinary question that claims a descent.
    expect(lineageClaimVerdict(body({ answering_artifact_id: "prev-answer" }))).toBe("refused");
    expect(lineageClaimVerdict(body({ answering_artifact_id: "prev-answer", message: "" }))).toBe(
      "refused",
    );
  });

  it("no claim is NO_CLAIM and never `refused`", () => {
    // The distinction the multi-state return exists for: an ordinary question is not a dropped
    // lineage, and a boolean would report both as false. Diagnosing one as the other is what left
    // 14 artifacts' worth of null `derived_from_artifact_id` ambiguous for a fortnight. Note the
    // third body: prose without a claim is still nothing claimed, so the new clause cannot turn
    // every ordinary question into an ownership question.
    expect(lineageClaimVerdict(body({}))).toBe("no_claim");
    expect(lineageClaimVerdict(body({ answering_artifact_id: "" }))).toBe("no_claim");
    expect(lineageClaimVerdict(body({ bound_slots: { s: "C7" } }))).toBe("no_claim");
    expect(lineageClaimVerdict(body({ message: "an ordinary question" }))).toBe("no_claim");
  });

  it("⛔ AN EMPTY `bound_slots` MAP DOES NOT ANSWER — Python truthiness, not JS", () => {
    // `bool({})` is False; `{}` is truthy. The obvious JS spelling of this clause —
    // `if (body.bound_slots || body.spoken_answer)` — calls this honoured and is wrong. The finding
    // survives the widening; what changed is only what such a body FALLS THROUGH to, which is why
    // both halves are asserted: without prose it is refused, with prose it reaches the new arm. If
    // the empty map were ever read as an answer, the second half would say `honoured` instead.
    const empty = { answering_artifact_id: "ask-1", bound_slots: {} };
    expect(lineageClaimVerdict(body(empty))).toBe("refused");
    expect(lineageClaimVerdict(body({ ...empty, message: "words" }))).toBe("ownership_decides");
    expect(lineageClaimVerdict(body({ answering_artifact_id: "ask-1", spoken_answer: "" }))).toBe(
      "refused",
    );
  });

  it("whitespace answers and whitespace prose part ways, because the producer trims ONE of them", () => {
    /*
      `bool(" ")` is True to Python, so a whitespace `spoken_answer` IS an answer to the gateway —
      and `_carries_prose` is `bool((request.message or "").strip())`, so a whitespace message is
      NOT prose to it. Both asserted, because the asymmetry is the producer's and a tidier mirror
      that spelled them the same way would be wrong on one arm whichever way it chose. The second
      half of the first line is why the laxness costs cortex nothing: `spokenAnswerBody` drops such
      an answer before it can be posted.
    */
    expect(lineageClaimVerdict(body({ answering_artifact_id: "ask-1", spoken_answer: "   " }))).toBe(
      "honoured",
    );
    expect(spokenAnswerBody({ slot: "s", answer: "   " })).toEqual({});
    expect(lineageClaimVerdict(body({ answering_artifact_id: "ask-1", message: "   " }))).toBe(
      "refused",
    );
  });
});

describe("the verdict over the bodies cortex actually assembles", () => {
  /**
   * Exactly the three spreads `useInterviewAgent` puts in an `InterviewRequest`, plus `message`.
   *
   * ⛔ `message` IS IN HERE BECAUSE EVERY TURN POSTS IT — `useInterviewAgent.ts:636` sends
   * `message: userInput` and `InterviewRequest.message` is not optional. The first version of this
   * helper left it out, and on the day `message` became the field that decides, a fixture missing
   * it would have kept answering the old question while looking like the real body.
   */
  const posted = (
    claim: string | undefined,
    boundSlots?: Record<string, string>,
    spoken?: { slot: string; answer: string },
    message = "draft a risk assessment for HAZ-1003",
  ): LineageBearingBody => ({
    message,
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

  it("⛔ THE COMPOSER SAFETY TURN NOW REACHES THE WIDENED ARM", () => {
    // Built from the real body-assembling functions, so this cannot pass by my mis-remembering what
    // a composer turn posts. The claim IS there, no answer fields are, and the prose carries it to
    // the arm the ruling added — which for a card cortex itself drew is the outcome the feature
    // wanted. What cortex still cannot assert is the graph read; see the ownership arms below.
    const b = posted("prev-answer");
    expect(b.answering_artifact_id).toBe("prev-answer");
    expect(b).not.toHaveProperty("bound_slots");
    expect(b).not.toHaveProperty("spoken_answer");
    expect(lineageClaimVerdict(b)).toBe("ownership_decides");
  });

  it("and an EMPTY composer turn is still refused, so the arm above is about the prose", () => {
    // The contrast that stops the arm above from reading as "the composer is honoured now". Strip
    // the words and the same body is refused, which is what says the prose is load-bearing.
    expect(lineageClaimVerdict(posted("prev-answer", undefined, undefined, ""))).toBe("refused");
  });
});

describe("the RULE, read live at its own address", () => {
  it.skipIf(!HAVE_RULE)("branches in the order the ruling states, and on the four inputs", () => {
    /*
      Read from `lineage_claim.py` rather than from the handler, because that is the move d3944da8
      made and the reason it gave: a rule inlined in a handler can only be mirrored. The signature
      is asserted keyword by keyword — a parameter appearing or vanishing changes what the rule can
      possibly consider, which is the coarsest drift there is and the cheapest to detect.
    */
    const src = readFileSync(RULE, "utf8");
    const sig = src.match(/def lineage_is_honoured\(([\s\S]*?)\)\s*->/);
    expect(sig, "no `lineage_is_honoured` definition found").toBeTruthy();
    const params = [...sig![1].matchAll(/([a-z_]+)\s*:/g)].map((m) => m[1]);
    expect(params).toEqual(["names_an_ask", "answers_something", "carries_prose", "ownership_ok"]);
  });

  it.skipIf(!HAVE_RULE)("honours the answering arm WITHOUT the graph read, which is a named hole", () => {
    /*
      ⛔ THIS SEALS A HOLE OPEN, AND ON PURPOSE. The answering arm returns honoured before
      `ownership_ok` is ever called, so a caller who names someone else's ask while carrying a pick
      is honoured. The producer names it rather than closing it — closing it would refuse valid
      lineage in any window where the ask's own write has not landed, and whether that race exists
      is UNMEASURED. Cortex's stake is that its own claims pass, so cortex has no business pushing
      for a close it cannot measure either; what cortex CAN do is make the day it closes loud, since
      that is the day cortex's ordering seal on the pending row starts to matter.
    */
    const src = readFileSync(RULE, "utf8");
    const fn = src.match(/def lineage_is_honoured\([\s\S]*?\n(?=\n*def |\n*$)/);
    expect(fn, "could not slice the rule body").toBeTruthy();
    const beforeOwnership = fn![0].slice(0, fn![0].indexOf("ownership_ok()"));
    expect(beforeOwnership, "the ownership read moved BEFORE the answering arm — measure the race")
      .toMatch(/if answers_something:\s*\n\s*return True, ""/);
  });

  it.skipIf(!HAVE_RULE)("gives the two refusals different words, so a log line says which", () => {
    // Two refusals that read the same are one refusal for anybody debugging. Keyed on the constants
    // rather than on their text: they are exported, so cortex may one day surface them, and a
    // reworded reason is not drift while a DELETED distinction is.
    const src = readFileSync(RULE, "utf8");
    expect(src).toContain("REFUSED_NOTHING_CARRIED");
    expect(src).toContain("REFUSED_NOT_THE_CALLERS");
    const nothing = src.match(/REFUSED_NOTHING_CARRIED = \(([\s\S]*?)\)\n/);
    const notTheirs = src.match(/REFUSED_NOT_THE_CALLERS = \(([\s\S]*?)\)\n/);
    expect(nothing?.[1]?.trim().length, "REFUSED_NOTHING_CARRIED has no text").toBeGreaterThan(20);
    expect(notTheirs?.[1]?.trim().length, "REFUSED_NOT_THE_CALLERS has no text").toBeGreaterThan(20);
    expect(nothing![1]).not.toEqual(notTheirs![1]);
  });

  it.skipIf(!HAVE_RULE)("⛔ THE ROUTE GATE CANNOT EXPRESS THE WIDER RULE, which is cortex's real exposure", () => {
    /*
      THE ARM CORTEX WOULD MISS THE FEATURE FOR. A wrong arrow folds two cards together on a lineage
      nobody produced; a wrong pre-resolved route DISPATCHES A VERB AGAINST A SUBJECT nobody
      confirmed this turn, and cortex renders that result as an answer. So the thing to seal is not
      that the route is narrow today but that it CANNOT be widened by accident: the producer gave
      `pre_resolved_route_allowed` one parameter so that granting it the lineage decision would have
      to be typed out, with a red here, rather than inherited for free by the next commit that
      widens the arrow.
    */
    const src = readFileSync(RULE, "utf8");
    // NOT LINE-ANCHORED: `pre_resolved_route_allowed` declares its one parameter on the same line
    // as its `def`, and the anchored version found NOTHING there. It surfaced as a red only because
    // the expectation names the parameter it wants; had it compared two extractions, or asserted a
    // count, an extractor that matched nothing would have read as agreement.
    const sig = src.match(/def pre_resolved_route_allowed\(([\s\S]*?)\)\s*->/);
    expect(sig, "no `pre_resolved_route_allowed` definition found").toBeTruthy();
    const params = [...sig![1].matchAll(/([a-z_]+)\s*:/g)].map((m) => m[1]);
    expect(params, "the route gate took a second input — it can now inherit the wider rule").toEqual(
      ["answers_something"],
    );
  });
});

describe("the WIRING, read live in the gateway", () => {
  it.skipIf(!HAVE_GATEWAY)("mirrors BOTH clauses of `_answers_something` and no third one", () => {
    /*
      ⛔ THE CENSUS IS OVER THE GUARD'S OWN EXPRESSION, BOTH DIRECTIONS. `boundSlots.test.ts`
      asserts only that the string `_answers_something` occurs in the file, which is a containment
      check and cannot see a clause being added or removed.

      AND THIS ARM PASSED THROUGH d3944da8, correctly. Its comment used to warn that "a THIRD way to
      satisfy the guard appearing upstream would leave this mirror quietly reporting `refused` for
      turns the server now honours" — which is exactly what happened, and this arm could not see it,
      because the third way was added one level up as a separate predicate while these two clauses
      stayed put. Kept, because the narrow predicate still gates the ROUTE and a third clause here
      would widen that; the drift it was built for now lives in the arms above it.
    */
    const src = readFileSync(GATEWAY, "utf8");
    const line = src.match(/^\s*_answers_something\s*=\s*(.+)$/m);
    expect(line, "no `_answers_something = ...` assignment found in gateway.py").toBeTruthy();
    const fields = [...line![1].matchAll(/request\.([a-z_]+)/g)].map((m) => m[1]);
    expect(fields.length, "the extraction found no `request.<field>` at all").toBeGreaterThan(0);
    expect([...fields].sort()).toEqual(["bound_slots", "spoken_answer"]);
  });

  it.skipIf(!HAVE_GATEWAY)("reads prose STRIPPED, which is the clause cortex mirrors", () => {
    // The one clause of the new rule the gateway still spells itself, and the one place cortex's
    // mirror could drift in the invisible direction: untrimmed here would make a whitespace-only
    // message buy an arrow, and cortex would report `refused` for a turn the server honoured.
    const src = readFileSync(GATEWAY, "utf8");
    expect(src).toMatch(/_carries_prose\s*=\s*bool\(\(request\.message or ""\)\.strip\(\)\)/);
  });

  it.skipIf(!HAVE_GATEWAY)("calls the rule instead of restating it, and passes all four inputs", () => {
    // If the handler ever re-inlines the branching, the arms above go on passing over a module
    // nobody calls — a seal on dead code, which is the failure `cold_start_fallback_domains`
    // records a surviving mutant for. So the CALL is asserted, not just the rule's existence.
    const src = readFileSync(GATEWAY, "utf8");
    const call = src.match(/lineage_is_honoured\(([\s\S]*?)\n\s*\)/);
    expect(call, "gateway.py does not call `lineage_is_honoured`").toBeTruthy();
    for (const kw of ["names_an_ask=", "answers_something=", "carries_prose=", "ownership_ok="]) {
      expect(call![1], `the call does not pass ${kw}`).toContain(kw);
    }
    // LAZY on purpose: a called-eagerly ownership check pays a graph round trip on every turn that
    // names an ask, including the two arms that are decided without it.
    expect(call![1], "ownership_ok is no longer deferred").toMatch(/ownership_ok=lambda:/);
  });

  it.skipIf(!HAVE_GATEWAY)("the claim is nulled by that rule, not merely logged beside it", () => {
    // The difference between a warning and a consequence. A guard that logged and carried on would
    // make every arm above wrong while every string this file greps for still matched.
    const src = readFileSync(GATEWAY, "utf8");
    expect(src).toMatch(
      /_answering_artifact_id\s*=\s*\(\s*\(request\.answering_artifact_id or None\)\s*if _lineage_honoured else None\s*\)/,
    );
  });

  it.skipIf(!HAVE_GATEWAY)(
    "and ALL THREE consumers read the nulled value, so a refusal costs three things",
    () => {
      /*
        The arm that makes the finding worth its words. "A refused claim loses a lineage arrow" would
        be a small defect; the same refusal also skips the route reuse and the inherited slots, which
        is the 40-second cost the gateway's own log line names. Asserted per consumer, because a
        count would pass if the wrong three matched.
      */
      const src = readFileSync(GATEWAY, "utf8");
      expect(src).toContain("_pre_resolved_from_ask(_answering_artifact_id or");
      expect(src).toContain("_accumulated_slots(_answering_artifact_id or");
      expect(src).toMatch(/"derived_from_artifact_id":\s*_answering_artifact_id/);
    },
  );

  it.skipIf(!HAVE_GATEWAY)("the route is gated on the NARROW predicate at the call site too", () => {
    // Belt to the rule module's braces. The signature above proves the route gate cannot be handed
    // the wider decision; this proves the handler is not handing it something else that amounts to
    // one — `if _answering_artifact_id` alone would re-join the gates, since that id is now set on
    // the prose arm as well.
    const src = readFileSync(GATEWAY, "utf8");
    expect(src).toMatch(/pre_resolved_route_allowed\(answers_something=_answers_something\)/);
  });

  it.skipIf(!HAVE_GATEWAY)("the refusal branch cortex now reaches is still the one that fires", () => {
    // Named so a rename upstream cannot turn this whole file into a seal over a branch that no
    // longer exists. The warning's own words are the anchor, since they are what an operator greps
    // for when the arrow is missing.
    const src = readFileSync(GATEWAY, "utf8");
    expect(src).toContain("if _names_an_ask and not _lineage_honoured:");
    expect(src).toContain("lineage claim REFUSED");
  });
});
