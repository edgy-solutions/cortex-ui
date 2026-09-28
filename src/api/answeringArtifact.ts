/**
 * The wire name for "this turn answers that ask" — one constant, for the third time and the
 * same reason: posting the wrong name is not rejected, it is ignored.
 *
 * `gateway.py` declares `answering_artifact_id: str | None` and reads
 * `request.answering_artifact_id`. A body posting anything else parses as None, the lineage
 * claim is silently absent, and the fold never happens — no error, just two cards forever.
 *
 * ── THE CLAIM IS THE CLIENT'S AND THE DECISION IS THE SERVER'S, AND THE NAMES SAY SO ──────
 *
 * We post `answering_artifact_id`; the artifact comes back carrying `derived_from_artifact_id`.
 * Two names for what could have been one field, because the server does NOT take the claim at
 * face value: it honours it only when the turn actually carries an answer — a pick or words —
 * and refuses it otherwise. One name would make that check look like a rename.
 *
 * WHY THE GUARD EXISTS AT ALL, which is worth knowing on this side too: the write is a
 * `MERGE (parent:AnswerArtifact {id: $parent_id})`, and MERGE CREATES what it cannot find. An
 * unguarded claim would not record a wrong parent — it would CONJURE an artifact into the
 * provenance graph by naming it, and the rail would fold two cards onto a lineage nobody
 * produced.
 */
export const ANSWERING_ARTIFACT_FIELD = "answering_artifact_id" as const;

/**
 * The claim's slice of the request body — `{}` when this turn answers no ask.
 *
 * A FUNCTION RATHER THAN A SPREAD AT THE CALL SITE — and the reason first recorded here was
 * FALSE. It said the absent-versus-empty distinction "is not testable in a conditional inside
 * an object literal". `useInterviewAgent.test.ts` had captured the outgoing request since
 * before this file existed and asserts on it directly; the seal was one import away. What got
 * written instead was a source-text guard, chosen because the stronger form had been recorded
 * as nonexistent.
 *
 * The extraction is still right — one place for a decision three fields share — but a recorded
 * conclusion about a test deserves the same suspicion as the test. This one stopped anyone
 * looking for a year's worth of the wrong reason in a day. The body is asserted on the body
 * now, in `describe("what an answered ask actually posts")`.
 *
 * An empty string is not a missing id — it is a claim to have answered an artifact with no
 * name, which the server would refuse and which no caller means.
 */
export function answeringArtifactBody(
  artifactId?: string | null,
): Record<string, never> | { answering_artifact_id: string } {
  const id = (artifactId ?? "").trim();
  if (!id) return {};
  return { [ANSWERING_ARTIFACT_FIELD]: id } as { answering_artifact_id: string };
}

/**
 * ── WHETHER THE SERVER WILL HONOUR THE CLAIM, DECIDED BESIDE THE CLAIM ────────────────────
 *
 * The header above says the server "honours it only when the turn actually carries an answer".
 * That sentence was true, sat one function away from the code that posts the claim, and NOTHING
 * CHECKED IT. `boundSlots.test.ts` asserts that a guard named `_answers_something` exists in
 * `gateway.py` and never reads what its condition is, so cortex could not learn the one fact
 * that matters: a turn typed into the composer satisfies neither clause.
 *
 * MEASURED 2026-09-27 against `gateway.py`, and then RE-MEASURED the same day after the producer
 * moved, which is the more useful half of the story — see the note below it:
 *
 *     _answers_something = bool(request.bound_slots) or bool(request.spoken_answer)
 *     _answering_artifact_id = (request.answering_artifact_id or None) if _answers_something else None
 *
 * ⛔ THAT IS NO LONGER THE RULE. `invincible-agent` d3944da8 (2026-09-27) split the one predicate
 * in two and moved the rule out of the handler to `iagent_pure/lineage_claim.py`, where a seal can
 * exercise it instead of grepping for it. The rule now reads:
 *
 *     named + (pick or typed answer)        -> honoured
 *     named + prose + ask is the caller's   -> honoured   <- NEW, and it pays with a graph read
 *     named + prose + ask is NOT theirs     -> refused    (REFUSED_NOT_THE_CALLERS)
 *     named + neither + no prose            -> refused    (REFUSED_NOTHING_CARRIED)
 *     nothing named                         -> no claim, and deliberately NOT a refusal
 *
 * ⛔ AND THE ROUTE DID NOT MOVE WITH IT. `pre_resolved_route_allowed(answers_something=...)` still
 * takes the narrow predicate, and takes it as its ONLY argument so that it cannot inherit a future
 * widening of the arrow. An accepted claim draws an arrow; a pre-resolved route dispatches a verb
 * against a subject nobody re-confirmed this turn. They are no longer the same question, and this
 * file must not answer them with one value.
 *
 * ⛔ HOW CORTEX FOUND OUT, BECAUSE IT IS NOT HOW CORTEX MEANT TO. `useInterviewAgent.test.ts` holds
 * an arm on the composer turn whose own comment says it "goes RED the day it is ruled either way,
 * which is the only honest way to hold someone else's decision". It was ruled, and that arm stayed
 * GREEN — because it asserts `lineageClaimVerdict(body) === "refused"`, and this function is
 * cortex's COPY of the rule. An arm pinned to the mirror cannot report that the mirror is stale.
 * The two arms in `lineageHonoured.test.ts` that read the producer's source live are what reddened.
 * That is the whole argument for reading the peer instead of restating it.
 *
 * and all THREE consumers read the post-guard variable — the pre-resolved route (which is what
 * skips /plan, /resolve and /classify_predicate), the accumulated chain slots, and
 * `derived_from_artifact_id` on the written artifact. So a refused claim does not cost a wrong
 * arrow; it costs the route skip, the inherited slots AND the lineage edge, all three, silently.
 *
 * ⛔ THIS RETURNS THREE STATES AND NOT A BOOLEAN. "Nothing was claimed" and "a claim was thrown
 * away" are the two outcomes this repo keeps confusing, and a boolean spells them the same. The
 * gateway itself has exactly these three audible branches — REFUSED, ACCEPTED, and an ordinary
 * question worth no line — so the mirror has three too, one for one.
 *
 * PYTHON TRUTHINESS, NOT JS TRUTHINESS, AND THE DIFFERENCE IS THE WHOLE POINT OF THE FUNCTION:
 * `bool({})` is False where `{}` is truthy, so a body posting an empty `bound_slots` map is
 * REFUSED by the server while the obvious JS spelling of this check would call it honoured. The
 * one place the mirror is deliberately laxer than cortex is whitespace: `bool(" ")` is True to
 * Python, and `spokenAnswerBody` trims such an answer away before it can ever be posted. This
 * function answers "what will the server do", never "what should cortex have sent".
 */
/**
 * ⛔ FOUR STATES, AND THE FOURTH IS AN ASSIGNMENT RATHER THAN A SHRUG. `ownership_decides` is the
 * prose arm: the server honours it if and only if `_artifact_is_the_callers` finds the named ask in
 * the graph under this caller. That is a Neo4j read under the caller's identity, so CORTEX CANNOT
 * DECIDE IT — not because the check is hard to mirror, but because the evidence is not in the
 * browser. Naming the decider is the point: "undecided" on its own reads as a draw and gets
 * re-argued, whereas "the ownership read decides, on the server" says where to look and stays put.
 *
 * Collapsing it either way would be worse than the fourth state. Called `honoured`, cortex would
 * promise an arrow the graph can refuse; called `refused`, cortex is back to predicting the loss of
 * a claim the producer now keeps, which is the exact defect this state was added to end.
 */
export type LineageClaimVerdict = "honoured" | "refused" | "no_claim" | "ownership_decides";

/** The only four fields of the posted body that bear on the verdict. */
export interface LineageBearingBody {
  bound_slots?: Record<string, string>;
  spoken_answer?: string;
  answering_artifact_id?: string;
  /** The composer's prose. It buys the arrow and never the route, as of d3944da8. */
  message?: string;
}

export function lineageClaimVerdict(body: LineageBearingBody): LineageClaimVerdict {
  // `bool(request.answering_artifact_id or None)` — an empty string is no claim, which is also
  // the state `answeringArtifactBody` produces by omitting the key entirely.
  if (!body.answering_artifact_id) return "no_claim";
  // `bool(request.bound_slots)`: a non-empty MAP. Keyed on the key count rather than on the
  // object's own truthiness, because that is the clause JS gets backwards.
  const carriesPick = Object.keys(body.bound_slots ?? {}).length > 0;
  // `bool(request.spoken_answer)`: a non-empty STRING, untrimmed, mirroring the server.
  const carriesWords = (body.spoken_answer ?? "") !== "";
  if (carriesPick || carriesWords) return "honoured";
  // `bool((request.message or "").strip())` — STRIPPED, where `spoken_answer` above is not. The
  // asymmetry is the producer's and is mirrored rather than tidied: a whitespace-only message is
  // not prose to the gateway, while a whitespace-only `spoken_answer` IS an answer to it (cortex
  // trims such an answer away before it can be posted, which is the one place this mirror is
  // laxer than cortex). Spelling both the same way would make one of the two arms wrong.
  const carriesProse = (body.message ?? "").trim() !== "";
  if (!carriesProse) return "refused";
  // Named an ask, carries prose, carries no answer: the widened arm, and the graph has the
  // casting vote. See the note on `LineageClaimVerdict`.
  return "ownership_decides";
}
